import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import type { AgentRecord } from "../../../../packages/harness/src/repositories";
import type { RunSummary, RunTrigger } from "../../../../packages/harness/src/types";
import { getAgentWorkspacePath } from "../../../../packages/harness/src/workspace";
import { buildPromptBundle, createWorkerRuntime } from "../lib/agent-runtime";
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

    const composioTools = await getComposioToolsForPi({
      userId: runtime.userId,
      toolkits: runtime.activeProviders,
    });

    const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);

    logger.info("Prompt assembled", {
      systemPromptLength: promptBundle.system.length,
      systemPromptPreview: promptBundle.system.slice(0, 500),
      userPromptPreview: promptBundle.user.slice(0, 500),
      skills: promptBundle.selectedSkills.map((s) => s.id),
      activeProviders: runtime.activeProviders,
      composioToolCount: composioTools.length,
      composioToolNames: composioTools.map((t) => t.name),
      workspacePath,
    });

    try {
      const piResult = await executePiAgent({
        systemPrompt: promptBundle.system,
        userPrompt: promptBundle.user,
        workspacePath,
        composioTools,
        onEvent: async (event) => {
          const id = await recordEvent(
            runtime,
            runId,
            agent.id,
            event.type as "tool_called" | "tool_executed",
            event.payload,
          );
          eventIds.push(id);
          emitLiveEvent(id, event.type, event.payload);
          return id;
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

async function recordEvent(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  runId: string,
  agentId: string,
  type:
    | "run_started"
    | "prompt_built"
    | "tool_called"
    | "tool_executed"
    | "finding_recorded"
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
