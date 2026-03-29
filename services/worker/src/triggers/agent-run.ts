import { logger, metadata, task, wait } from "@trigger.dev/sdk/v3";
import { evaluatePolicy } from "../../../../packages/harness/src/policy";
import type { AgentRecord } from "../../../../packages/harness/src/repositories";
import type { RunSummary, RunTrigger } from "../../../../packages/harness/src/types";
import { getAgentWorkspacePath } from "../../../../packages/harness/src/workspace";
import { getGoogleAdsToolsForPi, type PiToolDefinition } from "../../../../packages/harness/src/connections/google-ads/tools";
import { buildPromptBundle, buildSubRunPrompt, createWorkerRuntime } from "../lib/agent-runtime";
import { getComposioToolsForPi } from "../lib/composio-pi-bridge";
import { narrateEvent } from "../lib/narrate";
import { executePiAgent } from "../lib/pi-runtime";

export const agentRunTask = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async (payload: { agentId: string; projectId: string; trigger: RunTrigger; runId?: string }) => {
    const runtime = await createWorkerRuntime(payload.projectId);
    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    const runId = await ensureRunRecord(runtime, agent, payload.runId, payload.trigger);
    const eventIds: string[] = [];
    const liveEvents: Array<{ id: string; type: string; summary: string; timestamp: number }> = [];

    function emitLiveEvent(id: string, type: string, eventPayload: Record<string, unknown>) {
      liveEvents.push({ id, type, summary: narrateEvent(type, eventPayload), timestamp: Date.now() });
      metadata.set("events", liveEvents);
    }

    const recentToolCalls: Array<{ toolName: string; timestamp: Date }> = [];

    try {
      await runtime.runRepository.markRunning(runId);
      metadata.set("status", "running");

      const startPayload = { trigger: payload.trigger, providers: runtime.activeProviders };
      const startId = await recordEvent(runtime, runId, agent.id, "run_started", startPayload);
      eventIds.push(startId);
      emitLiveEvent(startId, "run_started", startPayload);

      const promptBundle = await buildPromptBundle({ agent, trigger: payload.trigger });
      const promptPayload = {
        selectedSkills: promptBundle.selectedSkills.map((s) => s.id),
        systemLength: promptBundle.system.length,
        workspaceKnowledgeLength: promptBundle.workspaceKnowledge.length,
      };
      const promptId = await recordEvent(runtime, runId, agent.id, "prompt_built", promptPayload);
      eventIds.push(promptId);
      emitLiveEvent(promptId, "prompt_built", promptPayload);

      // Build tool list — route googleads to direct connector, rest to Composio.
      // When Composio's Google Ads integration is fixed (ComposioHQ/composio#3066),
      // delete the googleads branch and restore the single getComposioToolsForPi() call.
      const allTools: PiToolDefinition[] = [];
      const composioProviders = runtime.activeProviders.filter((p) => p !== "googleads");

      if (runtime.activeProviders.includes("googleads")) {
        const customerId = runtime.providerConfigs.googleads?.customerId as string | undefined;
        if (customerId) {
          allTools.push(...getGoogleAdsToolsForPi({ customerId }));
        } else {
          logger.warn("Google Ads connection active but no customerId in config — skipping tools");
        }
      }

      if (composioProviders.length > 0) {
        const composioTools = await getComposioToolsForPi({
          userId: runtime.userId,
          toolkits: composioProviders,
        });
        allTools.push(...composioTools);
      }

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);

      // Sub-run delegation tool
      const MAX_SUB_RUNS = 3;
      let subRunCount = 0;

      const spawnSubRunTool: PiToolDefinition = {
        name: "spawn_sub_run",
        label: "Delegate to Specialist",
        description:
          "Delegate a focused sub-task to a specialist. Roles: scout (research & data gathering), " +
          "analyst (pattern analysis & insights), builder (executing specific actions). " +
          "Use when a sub-task benefits from focused attention.",
        parameters: {
          type: "object",
          required: ["role", "task"],
          properties: {
            role: { type: "string", enum: ["scout", "analyst", "builder"], description: "Specialist role" },
            task: { type: "string", description: "What the specialist should do" },
            context: { type: "string", description: "Optional data or context to pass to the specialist" },
          },
        },
        execute: async (_toolCallId, params) => {
          const role = (params.role as string) ?? "scout";
          const taskDesc = (params.task as string) ?? "";
          const context = params.context as string | undefined;

          if (subRunCount >= MAX_SUB_RUNS) {
            return {
              content: [{ type: "text" as const, text: `Sub-run limit reached (${MAX_SUB_RUNS}). Cannot delegate further.` }],
              details: { blocked: true, reason: "maxSubRuns" },
            };
          }
          subRunCount++;

          const startPayload = { role, task: taskDesc, subRunIndex: subRunCount };
          const startId = await recordEvent(runtime, runId, agent.id, "sub_run_started", startPayload);
          eventIds.push(startId);
          emitLiveEvent(startId, "sub_run_started", startPayload);

          const subPrompt = buildSubRunPrompt({
            role,
            task: taskDesc,
            context,
            agentInstructions: agent.instructions,
          });

          // Sub-run gets same tools minus spawn_sub_run (prevents recursion)
          const subTools = allTools.filter((t) => t.name !== "spawn_sub_run");

          try {
            const subResult = await executePiAgent({
              systemPrompt: subPrompt,
              userPrompt: taskDesc,
              workspacePath,
              composioTools: subTools,
              onEvent: async (event) => {
                const id = await recordEvent(
                  runtime,
                  runId,
                  agent.id,
                  event.type as "tool_called" | "tool_executed" | "agent_message",
                  { ...event.payload, subRunRole: role },
                );
                eventIds.push(id);
                emitLiveEvent(id, event.type, { ...event.payload, subRunRole: role });
                return id;
              },
              beforeToolCall: async (toolName, args) => {
                const toolInput = normalizeToolInput(args);
                const toolOverrides = (agent.toolConfig as any)?.toolOverrides as Record<string, string> | undefined;
                const overrideMode = toolOverrides?.[toolName];
                const policy = evaluatePolicy(
                  {
                    toolName,
                    toolInput,
                    toolConfig: {
                      toolName,
                      slug: toolName,
                      provider: "",
                      title: toolName,
                      description: "",
                      mode: "write" as const,
                      enabled: true,
                      approvalMode: (overrideMode as "auto" | "approval" | "blocked") ?? "auto",
                    },
                  },
                  { now: new Date(), globalApprovalRequired: false, recentToolCalls },
                );
                if (policy.result === "auto") return undefined;
                if (policy.result === "blocked") return { block: true, reason: policy.reason };
                return handleApprovalRequest({
                  runtime, agent, runId, toolName, toolInput,
                  policyReason: policy.reason, eventIds, emitLiveEvent, projectId: payload.projectId,
                });
              },
            });

            const completePayload = { role, success: true, outputLength: subResult.output.length };
            const completeId = await recordEvent(runtime, runId, agent.id, "sub_run_completed", completePayload);
            eventIds.push(completeId);
            emitLiveEvent(completeId, "sub_run_completed", completePayload);

            return {
              content: [{ type: "text" as const, text: subResult.output || "(No output)" }],
              details: { role, success: true, durationMs: subResult.durationMs },
            };
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            const failPayload = { role, success: false, error: errorMsg };
            const failId = await recordEvent(runtime, runId, agent.id, "sub_run_completed", failPayload);
            eventIds.push(failId);
            emitLiveEvent(failId, "sub_run_completed", failPayload);

            return {
              content: [{ type: "text" as const, text: `Specialist (${role}) failed: ${errorMsg}` }],
              details: { role, success: false, error: errorMsg },
            };
          }
        },
      };

      allTools.push(spawnSubRunTool);

      logger.info("Prompt assembled", {
        systemPromptLength: promptBundle.system.length,
        systemPromptPreview: promptBundle.system.slice(0, 500),
        userPromptPreview: promptBundle.user.slice(0, 500),
        skills: promptBundle.selectedSkills.map((s) => s.id),
        activeProviders: runtime.activeProviders,
        toolCount: allTools.length,
        toolNames: allTools.map((t) => t.name),
        workspacePath,
      });

      const piResult = await executePiAgent({
        systemPrompt: promptBundle.system,
        userPrompt: promptBundle.user,
        workspacePath,
        composioTools: allTools,
        onEvent: async (event) => {
          if (event.type === "tool_executed") {
            recentToolCalls.push({ toolName: event.payload.toolName as string, timestamp: new Date() });
          }
          const id = await recordEvent(
            runtime,
            runId,
            agent.id,
            event.type as "tool_called" | "tool_executed" | "agent_message",
            event.payload,
          );
          eventIds.push(id);
          emitLiveEvent(id, event.type, event.payload);
          return id;
        },
        beforeToolCall: async (toolName, args) => {
          const toolInput = normalizeToolInput(args);
          const toolOverrides = (agent.toolConfig as any)?.toolOverrides as Record<string, string> | undefined;
          const overrideMode = toolOverrides?.[toolName];

          const policy = evaluatePolicy(
            {
              toolName,
              toolInput,
              toolConfig: {
                toolName,
                slug: toolName,
                provider: "",
                title: toolName,
                description: "",
                mode: "write" as const,
                enabled: true,
                approvalMode: (overrideMode as "auto" | "approval" | "blocked") ?? "auto",
              },
            },
            { now: new Date(), globalApprovalRequired: false, recentToolCalls },
          );

          if (policy.result === "auto") return undefined;
          if (policy.result === "blocked") return { block: true, reason: policy.reason };

          // Human approval needed — create token, persist, notify, checkpoint
          return handleApprovalRequest({
            runtime,
            agent,
            runId,
            toolName,
            toolInput,
            policyReason: policy.reason,
            eventIds,
            emitLiveEvent,
            projectId: payload.projectId,
          });
        },
      });

      if (piResult.output.trim()) {
        const findingPayload = { text: piResult.output };
        const findingId = await recordEvent(runtime, runId, agent.id, "finding_recorded", findingPayload);
        eventIds.push(findingId);
        emitLiveEvent(findingId, "finding_recorded", findingPayload);
      }

      const summary = buildSummary({
        status: "completed",
        finalText: piResult.output,
        agent,
        runId,
        recentToolCalls: piResult.toolCalls,
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
        durationMs: piResult.durationMs,
        toolCallCount: piResult.toolCalls.length,
      });

      return { runId, agentId: agent.id, summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const summary = buildSummary({
        status: "failed",
        finalText: "",
        agent,
        runId,
        error: message,
        recentToolCalls: [],
        eventIds,
      });
      const failPayload = { reason: message, summary };
      const failId = await recordEvent(runtime, runId, agent.id, "run_failed", failPayload);
      eventIds.push(failId);
      emitLiveEvent(failId, "run_failed", failPayload);
      metadata.set("status", "failed");
      await runtime.runRepository.fail(runId, new Date(), message, summary);
      logger.error("Agent run failed", { runId, agentId: agent.id, error: message });
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
      if (existing.status === "completed") {
        throw new Error(`Run ${runId} is already completed`);
      }
      // Allow retrying a failed run (trigger.dev retry) — reset it to running
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

async function handleApprovalRequest(params: {
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>;
  agent: AgentRecord;
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  policyReason: string;
  eventIds: string[];
  emitLiveEvent: (id: string, type: string, payload: Record<string, unknown>) => void;
  projectId: string;
}): Promise<{ block: boolean; reason?: string } | undefined> {
  const { runtime, agent, runId, toolName, toolInput, policyReason, eventIds, emitLiveEvent, projectId } = params;
  const approvalId = crypto.randomUUID();

  const token = await wait.createToken({
    idempotencyKey: `approval-${runId}-${approvalId}`,
    timeout: "24h",
    tags: [projectId, agent.id, runId, approvalId, toolName],
  });

  const approvalRecordId = await runtime.approvalRepository.create({
    runId,
    agentId: agent.id,
    approvalId,
    waitTokenId: token.id,
    toolName,
    toolInput,
    createdAt: new Date(),
  });

  const reqPayload = { approvalId: approvalRecordId, toolName, input: toolInput, reason: policyReason };
  const reqId = await recordEvent(runtime, runId, agent.id, "tool_approval_requested", reqPayload);
  eventIds.push(reqId);
  emitLiveEvent(approvalRecordId, "tool_approval_requested", reqPayload);

  await runtime.runRepository.markWaitingForApproval(runId);
  metadata.set("status", "waiting_for_approval");

  // Container checkpoints here — resumes when human responds
  let decision: { decision: string; reason?: string };
  try {
    decision = (await wait.forToken<{ decision: string; reason?: string }>(token).unwrap()) ?? {
      decision: "rejected",
      reason: "Token completed without data",
    };
  } catch (err) {
    decision = { decision: "rejected", reason: err instanceof Error ? err.message : String(err) };
  }

  const status = decision.decision === "approved" ? "approved" : "rejected";
  const reason = decision.reason ?? policyReason;

  await runtime.approvalRepository.markResolved(approvalRecordId, status, reason, new Date());

  const resPayload = { approvalId: approvalRecordId, toolName, status, reason };
  const resId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", resPayload);
  eventIds.push(resId);
  emitLiveEvent(resId, "tool_approval_resolved", resPayload);

  await runtime.runRepository.markRunning(runId);
  metadata.set("status", "running");

  if (status === "approved") return undefined;
  return { block: true, reason };
}

function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

async function recordEvent(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  runId: string,
  agentId: string,
  type:
    | "run_started"
    | "prompt_built"
    | "tool_called"
    | "tool_executed"
    | "tool_approval_requested"
    | "tool_approval_resolved"
    | "agent_message"
    | "finding_recorded"
    | "sub_run_started"
    | "sub_run_completed"
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

  logger.info("Agent run event", { runId, agentId, type });
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
      ? `Tool calls executed: ${params.recentToolCalls.map((call) => call.toolName).join(", ")}`
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
