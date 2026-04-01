import { createServerFn } from "@tanstack/react-start";
import { loadConversationLoaderState } from "./chat-memory";
import { getAgentRow, getProjectDeps } from "./deps";
import { startAgentRun } from "./orchestration";
import { jsonSafe } from "./serializable";

export const sendChat = createServerFn({ method: "POST" })
  .inputValidator((input: { agentId: string; projectId: string; message: string }) => input)
  .handler(async ({ data: { agentId, projectId, message } }) => {
    const agent = await getAgentRow(projectId, agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const { runId, triggerRunId } = await startAgentRun({
      agentId,
      projectId,
      trigger: {
        type: "chat",
        timestamp: new Date(),
        metadata: { message },
      },
    });

    return jsonSafe({
      response: "Queued a background run for this request.",
      startedRunId: runId,
      triggerRunId,
      toolActivitySummary: [],
    });
  });

export const getChatHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string; limit?: number }) => input)
  .handler(async ({ data: { agentId, projectId, limit } }) => {
    const { runRepository } = getProjectDeps(projectId);
    const runs = await runRepository.getByAgent(agentId, limit ?? 10);

    return jsonSafe(
      runs.map((run) => ({
        id: run.id,
        role: "assistant" as const,
        content:
          run.status === "failed"
            ? (run.error ?? "The run failed.")
            : run.status === "cancelled"
              ? (run.error ?? "The run was cancelled.")
              : `Run ${run.status} via ${run.triggerType}.`,
        createdAt: run.completedAt?.toISOString() ?? run.startedAt.toISOString(),
      })),
    );
  });

export const getPrimaryConversationState = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string; limit?: number }) => input)
  .handler(async ({ data: { agentId, projectId, limit } }) => {
    const state = await loadConversationLoaderState({
      deps: getProjectDeps(projectId),
      agentId,
      limit,
    });

    return jsonSafe({
      threadId: state.thread.id,
      checkpointSummary: state.checkpoint?.summary,
      checkpointMessageCount: state.checkpoint?.messageCount ?? 0,
      checkpointSummaryVersion: state.checkpoint?.summaryVersion ?? 0,
      messages: state.messages.map((message) => ({
          id: message.id,
          role: message.role,
          parts: message.parts as Array<Record<string, unknown>>,
        })),
      lessons: state.durableLessons.map((lesson) => ({
        id: lesson.id,
        content: lesson.content,
        scope: lesson.scope,
        confidence: lesson.confidence,
        createdAt: lesson.createdAt.toISOString(),
      })),
    });
  });
