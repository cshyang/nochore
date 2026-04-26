import type { RunSummary, RunTrigger } from "@nochore/harness";
import {
  type AgentRecord,
  classifyEpisodicLesson,
  createAiSdkModel,
  extractRunInsights,
  getAgentWorkspacePath,
  type PiToolDefinition,
} from "@nochore/harness";
import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import { buildPromptBundle, createAgentRuntime } from "../lib/agent-runtime";
import { runAgentSession } from "../lib/agent-session";
import { ApprovalCheckpointError, recordEvent } from "../lib/run-helpers";
import { listProviderTools } from "../lib/tool-provider";
import { agentTaskRunTask } from "./agent-task-run";

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

    try {
      await runtime.runRepository.markRunning(runId);
      metadata.set("status", "running");

      const startPayload = { trigger: payload.trigger, providers: runtime.activeProviders };
      const startId = await recordEvent(runtime, runId, agent.id, "run_started", startPayload);
      eventIds.push(startId);

      const promptBundle = await buildPromptBundle({ agent, trigger: payload.trigger });
      const promptPayload = {
        selectedSkills: promptBundle.selectedSkills.map((s) => s.id),
        systemLength: promptBundle.system.length,
        workspaceKnowledgeLength: promptBundle.workspaceKnowledge.length,
      };
      const promptId = await recordEvent(runtime, runId, agent.id, "prompt_built", promptPayload);
      eventIds.push(promptId);

      const allTools: PiToolDefinition[] = await listProviderTools({
        userId: runtime.userId,
        activeProviders: runtime.activeProviders,
        providerConfigs: runtime.providerConfigs,
      });

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);

      const MAX_AGENT_TASKS = 3;

      const delegateTaskTool: PiToolDefinition = {
        name: "delegate_task",
        label: "Delegate to Specialist",
        description:
          "Delegate a focused task to a specialist. Roles: scout (research & data gathering), " +
          "analyst (pattern analysis & insights), builder (executing specific actions). " +
          "Use when a task benefits from focused attention.",
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

          // DB-backed limit check replaces closure counter
          const currentCount = await runtime.agentTaskRepository.countByParentRun(runId);
          if (currentCount >= MAX_AGENT_TASKS) {
            return {
              content: [
                { type: "text" as const, text: `Task limit reached (${MAX_AGENT_TASKS}). Cannot delegate further.` },
              ],
              details: { blocked: true, reason: "maxAgentTasks" },
            };
          }

          // Create a durable task before triggering the child container.
          const taskId = await runtime.agentTaskRepository.create({
            parentRunId: runId,
            rootRunId: runId,
            agentId: agent.id,
            role,
            title: taskDesc.slice(0, 200),
          });

          const startPayload = { role, task: taskDesc, taskId, taskIndex: currentCount + 1 };
          const startId = await recordEvent(runtime, runId, agent.id, "task_started", startPayload);
          eventIds.push(startId);

          await runtime.runRepository.markWaitingForTasks(runId);
          metadata.set("status", "waiting_for_tasks");

          try {
            const result = await agentTaskRunTask.triggerAndWait({
              taskId,
              parentRunId: runId,
              rootRunId: runId,
              agentId: agent.id,
              projectId: payload.projectId,
              role,
              task: taskDesc,
              context,
              agentInstructions: agent.instructions,
            });

            if (!result.ok) {
              await runtime.runRepository.markRunning(runId);
              metadata.set("status", "running");
              const errorMsg = String(result.error ?? "Agent task failed");
              await runtime.agentTaskRepository.fail(taskId, new Date(), errorMsg);
              const failPayload = { role, success: false, error: errorMsg, taskId };
              const failId = await recordEvent(runtime, runId, agent.id, "task_completed", failPayload);
              eventIds.push(failId);

              return {
                content: [{ type: "text" as const, text: `Specialist (${role}) failed: ${errorMsg}` }],
                details: { role, success: false, error: errorMsg, taskId },
              };
            }

            const output = result.output;
            if (output.status === "stopped") {
              await handleStoppedAgentTask({
                runtime,
                runId,
                agentId: agent.id,
                role,
                taskId,
                result: output,
                eventIds,
              });
            }
            await runtime.runRepository.markRunning(runId);
            metadata.set("status", "running");
            const completePayload = {
              role,
              outcome: "completed",
              success: true,
              outputLength: output.output.length,
              taskId,
            };
            const completeId = await recordEvent(runtime, runId, agent.id, "task_completed", completePayload);
            eventIds.push(completeId);

            return {
              content: [{ type: "text" as const, text: output.output || "(No output)" }],
              details: { role, success: true, durationMs: output.durationMs, taskId },
            };
          } catch (err) {
            if (err instanceof ApprovalCheckpointError) {
              throw err;
            }

            await runtime.runRepository.markRunning(runId);
            metadata.set("status", "running");
            const errorMsg = err instanceof Error ? err.message : String(err);
            await runtime.agentTaskRepository.fail(taskId, new Date(), errorMsg);
            const failPayload = { role, success: false, error: errorMsg, taskId };
            const failId = await recordEvent(runtime, runId, agent.id, "task_completed", failPayload);
            eventIds.push(failId);

            return {
              content: [{ type: "text" as const, text: `Specialist (${role}) failed: ${errorMsg}` }],
              details: { role, success: false, error: errorMsg, taskId },
            };
          }
        },
      };

      allTools.push(delegateTaskTool);

      logger.info("Lead prompt context assembled", {
        skills: promptBundle.selectedSkills.map((s) => s.id),
        activeProviders: runtime.activeProviders,
      });

      const piResult = await runAgentSession({
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

      if (piResult.output.trim()) {
        const findingPayload = { text: piResult.output };
        const findingId = await recordEvent(runtime, runId, agent.id, "finding_recorded", findingPayload);
        eventIds.push(findingId);
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
          toolCallCount: piResult.toolCalls.length,
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
        durationMs: piResult.durationMs,
        toolCallCount: piResult.toolCalls.length,
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

export async function handleStoppedAgentTask(params: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  runId: string;
  agentId: string;
  role: string;
  taskId: string;
  result: Extract<AgentTaskRunResult, { status: "stopped" }>;
  eventIds: string[];
}): Promise<never> {
  const stopPayload = {
    role: params.role,
    outcome: "stopped",
    success: false,
    cause: params.result.cause,
    reason: params.result.reason,
    taskId: params.taskId,
    ...(params.result.approvalId ? { approvalId: params.result.approvalId } : {}),
  };
  const eventId = await recordEvent(params.runtime, params.runId, params.agentId, "task_completed", stopPayload);
  params.eventIds.push(eventId);
  throw new ApprovalCheckpointError(
    params.result.reason ?? "An agent task stopped awaiting human input",
    params.result.cause === "approval_expired" ? "expired" : "rejected",
    {
      approvalId: params.result.approvalId,
      taskId: params.taskId,
    },
  );
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
