import { logger, metadata, task, wait } from "@trigger.dev/sdk/v3";
import {
  generateText,
  stepCountIs,
  type ModelMessage,
  type ToolApprovalResponse,
} from "ai";
import {
  buildPromptBundle,
  buildRuntimeTools,
  createModel,
  createWorkerRuntime,
  getEffectiveToolEntry,
  getMissingRequiredProviders,
  sendApprovalNotification,
} from "../lib/agent-runtime";
import { evaluatePolicy } from "../../../../packages/harness/src/policy";
import { narrateEvent } from "../lib/narrate";
import type {
  RunSummary,
  RunTrigger,
} from "../../../../packages/harness/src/types";
import type { AgentRecord } from "../../../../packages/harness/src/repositories";

type ApprovalDecision = {
  decision: "approved" | "rejected" | "blocked";
  reason: string;
};

export const agentRunTask = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async (payload: {
    agentId: string;
    projectId: string;
    trigger: RunTrigger;
    runId?: string;
  }) => {
    const runtime = await createWorkerRuntime(payload.projectId);
    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    const runId = await ensureRunRecord(runtime, agent, payload.runId, payload.trigger);
    const eventIds: string[] = [];
    const recentToolCalls: Array<{ toolName: string; timestamp: Date }> = [];
    const liveEvents: Array<{ id: string; type: string; summary: string; timestamp: number }> = [];

    function emitLiveEvent(id: string, type: string, eventPayload: Record<string, unknown>) {
      liveEvents.push({ id, type, summary: narrateEvent(type, eventPayload), timestamp: Date.now() });
      metadata.set("events", liveEvents);
    }

    await runtime.runRepository.markRunning(runId);
    metadata.set("status", "running");
    const startEventPayload = { trigger: payload.trigger, providers: runtime.activeProviders };
    const startEventId = await recordEvent(runtime, runId, agent.id, "run_started", startEventPayload);
    eventIds.push(startEventId);
    emitLiveEvent(startEventId, "run_started", startEventPayload);

    const missingProviders = getMissingRequiredProviders(
      agent,
      runtime.activeProviders,
    );
    if (missingProviders.length > 0) {
      const error = `Missing required connections: ${missingProviders
        .map((provider) => provider.provider)
        .join(", ")}`;
      eventIds.push(
        await recordEvent(runtime, runId, agent.id, "run_failed", {
          reason: error,
          missingProviders,
        }),
      );
      await runtime.runRepository.fail(runId, new Date(), error);
      throw new Error(error);
    }

    const promptBundle = await buildPromptBundle({
      agent,
      trigger: payload.trigger,
    });
    const promptEventPayload = {
      selectedSkills: promptBundle.selectedSkills.map((skill) => skill.id),
      systemLength: promptBundle.system.length,
      workspaceKnowledgeLength: promptBundle.workspaceKnowledge.length,
    };
    const promptEventId = await recordEvent(runtime, runId, agent.id, "prompt_built", promptEventPayload);
    eventIds.push(promptEventId);
    emitLiveEvent(promptEventId, "prompt_built", promptEventPayload);

    const model = await createModel();
    const tools = await buildRuntimeTools({ runtime, agent });
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: promptBundle.user,
      },
    ];

    let finalText = "";
    let lastResult: Awaited<ReturnType<typeof generateText>> | null = null;

    try {
      for (let cycle = 0; cycle < 12; cycle += 1) {
        metadata.set("cycle", cycle);

        const result = await generateText({
          model,
          system: promptBundle.system,
          messages,
          tools,
          stopWhen: stepCountIs(10),
        });

        lastResult = result;
        messages.push(...result.response.messages);

        if (result.text.trim().length > 0) {
          finalText = result.text.trim();
          const findingPayload = { text: finalText };
          const findingId = await recordEvent(runtime, runId, agent.id, "finding_recorded", findingPayload);
          eventIds.push(findingId);
          emitLiveEvent(findingId, "finding_recorded", findingPayload);
        }

        if (result.toolCalls.length > 0) {
          for (const toolCall of result.toolCalls) {
            const toolCallPayload = {
              toolCallId: toolCall.toolCallId,
              toolName: toolCall.toolName,
              input: toolCall.input,
            };
            const toolCallId = await recordEvent(runtime, runId, agent.id, "tool_called", toolCallPayload);
            eventIds.push(toolCallId);
            emitLiveEvent(toolCallId, "tool_called", toolCallPayload);
          }
        }

        if (result.toolResults.length > 0) {
          for (const toolResult of result.toolResults) {
            recentToolCalls.push({
              toolName: toolResult.toolName,
              timestamp: new Date(),
            });
            const toolExecPayload = {
              toolCallId: toolResult.toolCallId,
              toolName: toolResult.toolName,
              input: toolResult.input,
              output: toolResult.output,
            };
            const toolExecId = await recordEvent(runtime, runId, agent.id, "tool_executed", toolExecPayload);
            eventIds.push(toolExecId);
            emitLiveEvent(toolExecId, "tool_executed", toolExecPayload);
          }
        }

        const approvalRequests = result.content.filter(
          (part) => part.type === "tool-approval-request",
        );
        if (approvalRequests.length === 0) {
          break;
        }

        const approvalResponses: ToolApprovalResponse[] = [];

        for (const approvalRequest of approvalRequests) {
          const toolName = approvalRequest.toolCall.toolName;
          const toolInput = normalizeToolInput(approvalRequest.toolCall.input);
          const toolConfig = getEffectiveToolEntry(
            agent,
            runtime.activeProviders,
            toolName,
          );
          const policy = evaluatePolicy(
            {
              toolName,
              toolInput,
              toolConfig,
            },
            {
              now: new Date(),
              globalApprovalRequired: false,
              recentToolCalls,
            },
          );

          const approvalReqPayload = {
            approvalId: approvalRequest.approvalId,
            toolCallId: approvalRequest.toolCall.toolCallId,
            toolName,
            input: toolInput,
            policy: policy.result,
            reason: policy.reason,
          };
          const approvalReqId = await recordEvent(runtime, runId, agent.id, "tool_approval_requested", approvalReqPayload);
          eventIds.push(approvalReqId);
          emitLiveEvent(approvalReqId, "tool_approval_requested", approvalReqPayload);

          if (policy.result === "auto") {
            approvalResponses.push({
              type: "tool-approval-response",
              approvalId: approvalRequest.approvalId,
              approved: true,
              reason: policy.reason,
            });
            const autoPayload = { approvalId: approvalRequest.approvalId, toolName, status: "approved", reason: policy.reason };
            const autoId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", autoPayload);
            eventIds.push(autoId);
            emitLiveEvent(autoId, "tool_approval_resolved", autoPayload);
            continue;
          }

          if (policy.result === "blocked") {
            approvalResponses.push({
              type: "tool-approval-response",
              approvalId: approvalRequest.approvalId,
              approved: false,
              reason: policy.reason,
            });
            const blockedPayload = { approvalId: approvalRequest.approvalId, toolName, status: "blocked", reason: policy.reason };
            const blockedId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", blockedPayload);
            eventIds.push(blockedId);
            emitLiveEvent(blockedId, "tool_approval_resolved", blockedPayload);
            continue;
          }

          const token = await wait.createToken({
            idempotencyKey: `approval-${runId}-${approvalRequest.approvalId}`,
            timeout: "24h",
            tags: [payload.projectId, agent.id, runId, approvalRequest.approvalId, toolName],
          });
          const approvalRecordId = await runtime.approvalRepository.create({
            runId,
            agentId: agent.id,
            approvalId: approvalRequest.approvalId,
            waitTokenId: token.id,
            toolName,
            toolInput,
            createdAt: new Date(),
          });

          const notifChannel = await sendApprovalNotification({
            runtime,
            agent,
            approval: {
              approvalId: approvalRequest.approvalId,
              toolName,
              toolInput,
              waitTokenId: token.id,
            },
          });
          const notifPayload = { approvalId: approvalRequest.approvalId, toolName, channel: notifChannel };
          const notifId = await recordEvent(runtime, runId, agent.id, "notification_sent", notifPayload);
          eventIds.push(notifId);
          emitLiveEvent(notifId, "notification_sent", notifPayload);

          await runtime.runRepository.markWaitingForApproval(runId);
          metadata.set("status", "waiting_for_approval");

          let humanDecision: ApprovalDecision;
          try {
            humanDecision = await wait.forToken<ApprovalDecision>(token).unwrap();
          } catch (error) {
            humanDecision = {
              decision: "rejected",
              reason: error instanceof Error ? error.message : String(error),
            };
          }

          const approvalStatus = humanDecision.decision === "approved" ? "approved" : "rejected";
          await runtime.approvalRepository.markResolved(
            approvalRecordId,
            approvalStatus,
            humanDecision.reason ?? policy.reason,
            new Date(),
          );

          const humanPayload = {
            approvalId: approvalRequest.approvalId,
            approvalRecordId,
            toolName,
            status: approvalStatus,
            reason: humanDecision.reason ?? policy.reason,
            waitTokenId: token.id,
          };
          const humanId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", humanPayload);
          eventIds.push(humanId);
          emitLiveEvent(humanId, "tool_approval_resolved", humanPayload);

          await runtime.runRepository.markRunning(runId);
          metadata.set("status", "running");
          approvalResponses.push({
            type: "tool-approval-response",
            approvalId: approvalRequest.approvalId,
            approved: humanDecision.decision === "approved",
            reason: humanDecision.reason ?? policy.reason,
          });
        }

        if (approvalResponses.length > 0) {
          messages.push({
            role: "tool",
            content: approvalResponses,
          });
        }
      }

      const summary = buildSummary({
        status: "completed",
        finalText,
        agent,
        runId,
        recentToolCalls,
        eventIds,
      });
      await runtime.runRepository.complete(runId, new Date(), summary);
      const completePayload = { summary };
      const completeId = await recordEvent(runtime, runId, agent.id, "run_completed", completePayload);
      eventIds.push(completeId);
      emitLiveEvent(completeId, "run_completed", completePayload);
      metadata.set("status", "completed");

      if (summary.finalText && summary.finalText.trim().length > 0) {
        const lessonId = await runtime.lessonRepository.create({
          agentId: agent.id,
          content: summary.finalText.slice(0, 2000),
          scope: "run-summary",
          confidence: "medium",
          sourceRunEventIds: eventIds.slice(-10),
          createdAt: new Date(),
        });
        const lessonPayload = { lessonId, scope: "run-summary" };
        const lessonEventId = await recordEvent(runtime, runId, agent.id, "lesson_distilled", lessonPayload);
        eventIds.push(lessonEventId);
        emitLiveEvent(lessonEventId, "lesson_distilled", lessonPayload);
      }

      logger.info("Agent run completed", {
        runId,
        agentId: agent.id,
        triggerType: payload.trigger.type,
        steps: lastResult?.steps.length ?? 0,
      });

      return {
        runId,
        agentId: agent.id,
        summary,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const summary = buildSummary({
        status: "failed",
        finalText,
        agent,
        runId,
        error: message,
        recentToolCalls,
        eventIds,
      });
      const failPayload = { reason: message, summary };
      const failId = await recordEvent(runtime, runId, agent.id, "run_failed", failPayload);
      eventIds.push(failId);
      emitLiveEvent(failId, "run_failed", failPayload);
      metadata.set("status", "failed");
      await runtime.runRepository.fail(runId, new Date(), message, summary);
      logger.error("Agent run failed", {
        runId,
        agentId: agent.id,
        error: message,
      });
      throw error;
    }
  },
});

async function ensureRunRecord(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  agent: AgentRecord,
  runId: string | undefined,
  trigger: RunTrigger,
): Promise<string> {
  if (runId) {
    const existing = await runtime.runRepository.getById(runId);
    if (existing) {
      if (existing.status === "completed" || existing.status === "failed") {
        throw new Error(`Run ${runId} is already ${existing.status}`);
      }
      await runtime.runRepository.markRunning(runId);
      return runId;
    }
  }

  return runtime.runRepository.create({
    id: runId,
    agentId: agent.id,
    triggerType: trigger.type,
    startedAt: trigger.timestamp,
    status: "running",
  });
}

async function recordEvent(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  runId: string,
  agentId: string,
  type:
    | "run_started"
    | "prompt_built"
    | "tool_called"
    | "tool_approval_requested"
    | "tool_approval_resolved"
    | "tool_executed"
    | "finding_recorded"
    | "notification_sent"
    | "lesson_distilled"
    | "run_completed"
    | "run_failed",
  payload: Record<string, unknown>,
): Promise<string> {
  const id = await runtime.runEventRepository.append({
    runId,
    agentId,
    timestamp: new Date(),
    type,
    payload,
  });

  logger.info("Agent run event", {
    runId,
    agentId,
    type,
  });

  return id;
}

function buildSummary(params: {
  status: "completed" | "failed";
  finalText: string;
  agent: AgentRecord;
  runId: string;
  recentToolCalls: Array<{ toolName: string; timestamp: Date }>;
  eventIds: string[];
  error?: string;
}): RunSummary {
  const normalizedText = params.finalText.trim();
  const headline =
    normalizedText.split(/\n|\./, 1)[0]?.trim().slice(0, 140) ||
    (params.status === "completed" ? `${params.agent.name} completed` : `${params.agent.name} failed`);

  const details = [
    params.error ? `Error: ${params.error}` : undefined,
    normalizedText ? normalizedText : undefined,
    params.recentToolCalls.length > 0
      ? `Tool calls executed: ${params.recentToolCalls
          .map((call) => call.toolName)
          .join(", ")}`
      : undefined,
    `Events recorded: ${params.eventIds.length}`,
  ].filter((item): item is string => typeof item === "string" && item.length > 0);

  return {
    status: params.status,
    headline,
    details,
    ...(normalizedText ? { finalText: normalizedText } : {}),
  };
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return input as Record<string, unknown>;
}
