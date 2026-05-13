import type { RunSummary, RunTrigger } from "@nochore/harness";
import {
  type AgentRecord,
  classifyEpisodicLesson,
  createAiSdkModel,
  extractRunInsights,
  getAgentWorkspacePath,
} from "@nochore/harness";
import { logger, metadata, task } from "@trigger.dev/sdk";
import { buildPromptBundle, createAgentRuntime, resolveAgentConnectionContext } from "../lib/agent-runtime";
import { runAgentSession } from "../lib/agent-session";
import { createDelegateTaskTool } from "../lib/agent-task-coordinator";
import { ApprovalCheckpointError, recordEvent } from "../lib/run-helpers";
import { buildLeadToolEnvelope } from "../lib/tool-envelope";
import { listProviderTools } from "../lib/tool-provider";

export const agentRunTask = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async (payload: { agentId: string; projectId: string; trigger: RunTrigger; runId?: string }) => {
    const runtime = await createAgentRuntime(payload.projectId);
    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    const runId = await ensureRunRecord(runtime, agent, payload.runId, payload.trigger);
    const eventIds: string[] = [];
    const connectionContext = await resolveAgentConnectionContext({
      db: runtime.db,
      projectId: payload.projectId,
      agent,
    });

    try {
      await runtime.runRepository.markRunning(runId);
      metadata.set("status", "running");

      const startPayload = { trigger: payload.trigger, providers: connectionContext.activeProviders };
      const startId = await recordEvent(runtime, runId, agent.id, "run_started", startPayload);
      eventIds.push(startId);

      const promptBundle = await buildPromptBundle({
        agent,
        trigger: payload.trigger,
        providerConfigs: connectionContext.providerConfigs,
        providerBindings: connectionContext.providerBindings,
      });
      const promptPayload = {
        selectedSkills: promptBundle.selectedSkills.map((s) => s.id),
        systemLength: promptBundle.system.length,
        workspaceKnowledgeLength: promptBundle.workspaceKnowledge.length,
      };
      const promptId = await recordEvent(runtime, runId, agent.id, "prompt_built", promptPayload);
      eventIds.push(promptId);

      const providerTools = await listProviderTools({
        userId: runtime.userId,
        activeProviders: connectionContext.activeProviders,
        providerConfigs: connectionContext.providerConfigs,
        providerBindings: connectionContext.providerBindings,
      });

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);
      const allTools = buildLeadToolEnvelope({
        providerTools,
        delegateTaskTool: createDelegateTaskTool({
          runtime,
          agent,
          runId,
          projectId: payload.projectId,
          eventIds,
        }),
      });

      logger.info("Lead prompt context assembled", {
        skills: promptBundle.selectedSkills.map((s) => s.id),
        activeProviders: connectionContext.activeProviders,
      });

      const executionResult = await runAgentSession({
        runtime,
        agent,
        runId,
        projectId: payload.projectId,
        systemPrompt: promptBundle.system,
        userPrompt: promptBundle.user,
        workspacePath,
        tools: allTools,
        eventIds,
      });

      if (executionResult.output.trim()) {
        const findingPayload = { text: executionResult.output };
        const findingId = await recordEvent(runtime, runId, agent.id, "finding_recorded", findingPayload);
        eventIds.push(findingId);
      }

      const summary = buildSummary({
        status: "completed",
        finalText: executionResult.output,
        agent,
        runId,
        recentToolCalls: executionResult.toolCalls,
        eventIds,
      });
      await runtime.runRepository.complete(runId, new Date(), summary);

      const completePayload = { summary };
      const completeId = await recordEvent(runtime, runId, agent.id, "run_completed", completePayload);
      eventIds.push(completeId);
      metadata.set("status", "completed");

      await recordRunResultInConversation(runtime, agent.id, summary);

      const durableLessons = await runtime.lessonRepository.listDurableByAgent(agent.id);
      const existingInsights = durableLessons
        .filter((lesson) => lesson.scope === "memory:insight")
        .map((lesson) => lesson.content);

      const combinedContent = [summary.headline, summary.finalText, ...(summary.details ?? [])]
        .filter(Boolean)
        .join(" ")
        .trim();

      let lessonWrites = combinedContent
        ? await extractRunInsights({
            model: createAiSdkModel(),
            headline: summary.headline,
            finalText: summary.finalText,
            details: summary.details,
            existingInsights,
          })
        : [];

      if (lessonWrites.length === 0) {
        lessonWrites = classifyEpisodicLesson({
          headline: summary.headline,
          finalText: summary.finalText,
          details: summary.details,
          toolCallCount: executionResult.toolCalls.length,
        });
      }

      for (const lessonWrite of lessonWrites) {
        const lessonId = await runtime.lessonRepository.create({
          agentId: agent.id,
          content: lessonWrite.content,
          scope: lessonWrite.scope,
          confidence: lessonWrite.confidence,
          sourceEventIds: eventIds.slice(-10),
          createdAt: new Date(),
          expiresAt: lessonWrite.expiresInMs ? new Date(Date.now() + lessonWrite.expiresInMs) : undefined,
        });
        const lessonPayload = { lessonId, scope: lessonWrite.scope };
        const lessonEventId = await recordEvent(runtime, runId, agent.id, "lesson_distilled", lessonPayload);
        eventIds.push(lessonEventId);
      }

      logger.info("Agent run completed", {
        runId,
        agentId: agent.id,
        triggerType: payload.trigger.type,
        durationMs: executionResult.durationMs,
        toolCallCount: executionResult.toolCalls.length,
      });

      return { runId, agentId: agent.id, summary };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isApprovalTerminal = error instanceof ApprovalCheckpointError;

      if (isApprovalTerminal) {
        await stopRunForApproval({
          runtime,
          runId,
          agentId: agent.id,
          error,
          eventIds,
        });
        logger.info("Agent run stopped", { runId, agentId: agent.id, reason: message, cause: error.stopCause });
        return { runId, agentId: agent.id, stopped: true };
      }

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
      metadata.set("status", "failed");
      await runtime.runRepository.fail(runId, new Date(), message, summary);
      await recordRunResultInConversation(runtime, agent.id, summary);
      logger.error("Agent run failed", { runId, agentId: agent.id, error: message });
      throw error;
    }
  },
});

export async function stopRunForApproval(params: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  runId: string;
  agentId: string;
  error: ApprovalCheckpointError;
  eventIds: string[];
  metadataApi?: { set: (key: string, value: string) => void };
}) {
  const stopPayload = {
    cause: params.error.stopCause,
    reason: params.error.message,
    ...(params.error.approvalId ? { approvalId: params.error.approvalId } : {}),
    ...(params.error.taskId ? { taskId: params.error.taskId } : {}),
  };
  const stopId = await recordEvent(params.runtime, params.runId, params.agentId, "run_stopped", stopPayload);
  params.eventIds.push(stopId);
  await params.runtime.runRepository.stop(params.runId, new Date(), params.error.message);
  (params.metadataApi ?? metadata).set("status", "stopped");
}

async function ensureRunRecord(
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
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

async function recordRunResultInConversation(
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>,
  agentId: string,
  summary: RunSummary,
) {
  const thread = await runtime.conversationThreadRepository.getOrCreatePrimary(agentId);
  await runtime.conversationEventRepository.append({
    threadId: thread.id,
    agentId,
    source: "run",
    role: "system",
    eventType: "run_result",
    payload: {
      status: summary.status,
      headline: summary.headline,
      details: summary.details,
      finalText: summary.finalText,
    },
    createdAt: new Date(),
  });
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
