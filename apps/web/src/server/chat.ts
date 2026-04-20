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
            : run.status === "stopped"
              ? (run.error ?? "The run was stopped.")
              : run.status === "cancelled"
                ? (run.error ?? "The run was cancelled.")
                : `Run ${run.status} via ${run.triggerType}.`,
        createdAt: run.completedAt?.toISOString() ?? run.startedAt.toISOString(),
      })),
    );
  });

export const getConversationState = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string; threadId?: string; limit?: number }) => input)
  .handler(async ({ data: { agentId, projectId, threadId, limit } }) => {
    const state = await loadConversationLoaderState({
      deps: getProjectDeps(projectId),
      agentId,
      requestedThreadId: threadId,
      limit,
    });

    return jsonSafe({
      threadId: state.thread.id,
      threadTitle: state.thread.title,
      isPrimary: state.thread.scope === "primary",
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
        expiresAt: lesson.expiresAt?.toISOString(),
      })),
      episodicLessons: state.episodicLessons.map((lesson) => ({
        id: lesson.id,
        content: lesson.content,
        scope: lesson.scope,
        confidence: lesson.confidence,
        createdAt: lesson.createdAt.toISOString(),
        expiresAt: lesson.expiresAt?.toISOString(),
      })),
    });
  });

export const listConversationThreads = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const threads = await getProjectDeps(projectId).conversationThreadRepository.listByAgent(agentId);

    return jsonSafe(
      threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        scope: thread.scope,
        isPrimary: thread.scope === "primary",
        createdAt: thread.createdAt.toISOString(),
        updatedAt: thread.updatedAt.toISOString(),
        lastMessageAt: thread.lastMessageAt?.toISOString(),
      })),
    );
  });

export const createConversationThread = createServerFn({ method: "POST" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const agent = await getAgentRow(projectId, agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found`);
    }

    const thread = await getProjectDeps(projectId).conversationThreadRepository.createManualWebThread(agentId);
    return jsonSafe({
      id: thread.id,
      title: thread.title,
      scope: thread.scope,
      isPrimary: false,
      createdAt: thread.createdAt.toISOString(),
      updatedAt: thread.updatedAt.toISOString(),
      lastMessageAt: thread.lastMessageAt?.toISOString(),
    });
  });
