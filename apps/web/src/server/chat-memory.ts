import type { ConversationCheckpoint, ConversationEvent, ConversationThread, LessonRecord } from "@nochore/harness";
import {
  buildConversationTranscript,
  CHECKPOINT_KEEP_RECENT_TOKENS,
  estimateConversationStateTokens,
  estimateTextTokens,
  extractStructuredConversationEvents,
  findCompactionBoundary,
  INLINE_COMPACTION_KEEP_RECENT_TOKENS,
  RECENT_MODEL_MESSAGE_LIMIT,
  RECENT_VISIBLE_MESSAGE_LIMIT,
  rehydrateConversationMessages,
  sanitizeConversationMessage,
  shouldAttemptChatMemoryDistillation,
  shouldInlineCompact,
  shouldRefreshCheckpoint,
} from "@nochore/harness";
import { convertToModelMessages, generateObject, generateText, type LanguageModel, type UIMessage } from "ai";
import { z } from "zod";
import type { AgentRow, ProjectDeps } from "./deps";

const CHECKPOINT_SYSTEM_PROMPT = `You are maintaining a compact relationship checkpoint for an agent conversation.

Return concise markdown using these exact headings:
## Relationship Context
## Stable Preferences and Decisions
## Durable Run Learnings
## Active Goals and Workstreams
## Open Loops
## Critical References

Only keep durable, high-signal information that will help a future assistant continue the relationship accurately.`;

const CHECKPOINT_UPDATE_PROMPT = `Update the existing checkpoint using only the new conversation span. Preserve still-relevant information, add new durable information, and remove stale open loops that were resolved.`;

const SPLIT_TURN_PROMPT = `A single large exchange had to be split. Summarize only the earlier compacted prefix of that exchange in up to four bullets focused on context a future assistant must know before reading the kept suffix.`;

const CHAT_MEMORY_EXTRACTION_SCHEMA = z.object({
  memories: z
    .array(
      z.object({
        scope: z.enum(["memory:preference", "memory:correction", "memory:decision"]),
        content: z.string().min(1).max(280),
        confidence: z.enum(["high", "medium", "low"]).default("medium"),
      }),
    )
    .max(3),
});

const CHAT_MEMORY_EXTRACTION_PROMPT = `Extract only durable user relationship memory from the exchange below.

Valid memory types:
- memory:preference for stable user preferences or standing instructions
- memory:correction for durable corrections of facts the assistant should not repeat
- memory:decision for stable decisions that should shape future work

Rules:
- Return zero items when nothing here should be remembered long-term
- Ignore temporary requests, casual chatter, and speculative ideas
- Keep each memory self-contained and factual
- Do not restate tool outputs unless they change future behavior`;

const NEW_THREAD_TITLE = "New thread";
const MAX_THREAD_TITLE_LENGTH = 58;

type MessagePartRecord = Record<string, unknown>;

export interface ConversationLoaderState {
  thread: ConversationThread;
  checkpoint: ConversationCheckpoint | null;
  messages: UIMessage[];
  durableLessons: LessonRecord[];
  episodicLessons: LessonRecord[];
}

export interface ConversationAssembly {
  thread: ConversationThread;
  checkpoint: ConversationCheckpoint | null;
  modelMessages: Awaited<ReturnType<typeof convertToModelMessages>>;
  memoryContext: string;
  estimatedTokens: number;
  visibleMessages: UIMessage[];
  durableLessons: LessonRecord[];
  episodicLessons: LessonRecord[];
  recentRuns: Array<{ id: string; status: string; headline?: string; finalText?: string }>;
}

export async function resolveConversationThread(params: {
  deps: ProjectDeps;
  agentId: string;
  requestedThreadId?: string;
}): Promise<ConversationThread> {
  const requestedThread = params.requestedThreadId
    ? await params.deps.conversationThreadRepository.getById(params.requestedThreadId)
    : null;

  return requestedThread && requestedThread.agentId === params.agentId
    ? requestedThread
    : await params.deps.conversationThreadRepository.getOrCreatePrimary(params.agentId);
}

export async function loadConversationLoaderState(params: {
  deps: ProjectDeps;
  agentId: string;
  requestedThreadId?: string;
  limit?: number;
}): Promise<ConversationLoaderState> {
  const thread = await resolveConversationThread({
    deps: params.deps,
    agentId: params.agentId,
    requestedThreadId: params.requestedThreadId,
  });
  const checkpoint = await params.deps.conversationCheckpointRepository.getByThread(thread.id);
  const messages = await listRehydratedMessages(params.deps, thread.id, params.limit ?? RECENT_VISIBLE_MESSAGE_LIMIT);
  const durableLessons = await params.deps.lessonRepository.listDurableByAgent(params.agentId);
  const episodicLessons = await params.deps.lessonRepository.listEpisodicByAgent(params.agentId, 50);

  return {
    thread,
    checkpoint,
    messages,
    durableLessons,
    episodicLessons,
  };
}

export async function persistConversationMessages(params: {
  deps: ProjectDeps;
  threadId: string;
  agentId: string;
  messages: UIMessage[];
  source?: "web" | "system";
}): Promise<{
  messageEvents: ConversationEvent[];
  structuredEvents: ConversationEvent[];
}> {
  const source = params.source ?? "web";
  const persistedMessages = params.messages
    .filter((message) => !isSyntheticMessageId(message.id))
    .map((message) => sanitizeConversationMessage(message))
    .filter((message): message is UIMessage => message != null);

  const now = Date.now();
  const messageEvents = await params.deps.conversationEventRepository.upsertMessages(
    persistedMessages.map((message, index) => ({
      threadId: params.threadId,
      agentId: params.agentId,
      source,
      message,
      createdAt: new Date(now + index),
    })),
  );

  const structuredSpecs = params.messages
    .filter((message) => !isSyntheticMessageId(message.id))
    .flatMap((message) => extractStructuredConversationEvents(message));

  const structuredEvents = await params.deps.conversationEventRepository.upsertStructuredEvents(
    structuredSpecs.map((event, index) => ({
      threadId: params.threadId,
      agentId: params.agentId,
      source,
      role: event.role,
      eventType: event.eventType,
      eventKey: event.eventKey,
      messageId: event.messageId,
      payload: event.payload,
      createdAt: new Date(now + persistedMessages.length + index),
    })),
  );

  const latestEvent = [...messageEvents]
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
    .at(-1);
  if (latestEvent) {
    await params.deps.conversationThreadRepository.touch(params.threadId, latestEvent.createdAt);
  }

  await maybeAutoTitleManualThread(params.deps, params.threadId, persistedMessages);

  return { messageEvents, structuredEvents };
}

export async function assembleConversation(params: {
  deps: ProjectDeps;
  agent: AgentRow;
  thread: ConversationThread;
  model: LanguageModel;
}): Promise<ConversationAssembly> {
  let checkpoint = await params.deps.conversationCheckpointRepository.getByThread(params.thread.id);
  const durableLessons = await params.deps.lessonRepository.listDurableByAgent(params.agent.id);
  const episodicLessons = await params.deps.lessonRepository.listEpisodicByAgent(params.agent.id, 3);
  const recentRuns = (await params.deps.runRepository.getByAgent(params.agent.id, 4)).map((run) => ({
    id: run.id,
    status: run.status,
    headline: run.summary?.headline,
    finalText: run.summary?.finalText,
  }));

  let visibleMessages = await listRehydratedMessages(params.deps, params.thread.id);
  let uncoveredMessages = sliceMessagesAfterCheckpoint(visibleMessages, checkpoint?.coversThroughMessageId);
  let rawMessages = checkpoint ? uncoveredMessages.slice(-RECENT_MODEL_MESSAGE_LIMIT) : uncoveredMessages;
  let memoryContext = buildChatMemoryContext({
    checkpointSummary: checkpoint?.summary,
    durableLessons,
    episodicLessons,
    recentRuns,
  });
  let estimatedTokens = estimateConversationStateTokens({
    system: memoryContext,
    messages: rawMessages,
  });

  if (shouldInlineCompact(estimatedTokens) && params.thread.consecutiveCompactionFailures < 3) {
    checkpoint = await refreshConversationCheckpoint({
      deps: params.deps,
      agentId: params.agent.id,
      thread: params.thread,
      model: params.model,
      keepRecentTokens: INLINE_COMPACTION_KEEP_RECENT_TOKENS,
    }).catch(async (_error) => {
      await params.deps.conversationThreadRepository.incrementCompactionFailures(params.thread.id);
      return checkpoint;
    });

    visibleMessages = await listRehydratedMessages(params.deps, params.thread.id);
    uncoveredMessages = sliceMessagesAfterCheckpoint(visibleMessages, checkpoint?.coversThroughMessageId);
    rawMessages = checkpoint ? uncoveredMessages.slice(-RECENT_MODEL_MESSAGE_LIMIT) : uncoveredMessages;
    memoryContext = buildChatMemoryContext({
      checkpointSummary: checkpoint?.summary,
      durableLessons,
      episodicLessons,
      recentRuns,
    });
    estimatedTokens = estimateConversationStateTokens({
      system: memoryContext,
      messages: rawMessages,
    });
  }

  return {
    thread: params.thread,
    checkpoint,
    memoryContext,
    estimatedTokens,
    visibleMessages,
    durableLessons,
    episodicLessons,
    recentRuns,
    modelMessages: await convertToModelMessages(stripUnansweredToolParts(rawMessages)),
  };
}

export async function persistConversationAfterResponse(params: {
  deps: ProjectDeps;
  agent: AgentRow;
  thread: ConversationThread;
  messages: UIMessage[];
  responseMessage: UIMessage;
  model: LanguageModel;
  totalUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
  latestUserText: string;
}): Promise<void> {
  const persisted = await persistConversationMessages({
    deps: params.deps,
    threadId: params.thread.id,
    agentId: params.agent.id,
    messages: params.messages,
  });

  if (params.totalUsage) {
    await params.deps.conversationThreadRepository.recordUsage(params.thread.id, params.totalUsage);
  }
  await params.deps.conversationThreadRepository.resetCompactionFailures(params.thread.id);

  const allMessages = await listRehydratedMessages(params.deps, params.thread.id);
  const estimatedTokens = estimateConversationStateTokens({
    system: "",
    messages: allMessages,
  });

  if (shouldRefreshCheckpoint(allMessages.length, estimatedTokens) && params.thread.consecutiveCompactionFailures < 3) {
    await refreshConversationCheckpoint({
      deps: params.deps,
      agentId: params.agent.id,
      thread: params.thread,
      model: params.model,
      keepRecentTokens: CHECKPOINT_KEEP_RECENT_TOKENS,
      existingMessages: allMessages,
    }).catch(async () => {
      await params.deps.conversationThreadRepository.incrementCompactionFailures(params.thread.id);
    });
  }

  await distillChatMemory({
    deps: params.deps,
    agentId: params.agent.id,
    threadId: params.thread.id,
    model: params.model,
    latestUserText: params.latestUserText,
    responseMessage: params.responseMessage,
    sourceEventIds: [
      ...persisted.messageEvents.map((event) => event.id),
      ...persisted.structuredEvents.map((event) => event.id),
    ].slice(-10),
  });
}

function buildChatMemoryContext(params: {
  checkpointSummary?: string;
  durableLessons: LessonRecord[];
  episodicLessons: LessonRecord[];
  recentRuns: Array<{ id: string; status: string; headline?: string; finalText?: string }>;
}): string {
  const sections: string[] = [];

  if (params.checkpointSummary?.trim()) {
    sections.push(`Relationship checkpoint:\n${params.checkpointSummary.trim()}`);
  }

  if (params.durableLessons.length > 0) {
    sections.push(
      `Durable memory:\n${params.durableLessons
        .slice(0, 8)
        .map((lesson) => `- [${lesson.scope}] (${lesson.confidence}) ${lesson.content}`)
        .join("\n")}`,
    );
  }

  if (params.episodicLessons.length > 0) {
    sections.push(
      `Recent episodic context:\n${params.episodicLessons
        .slice(0, 3)
        .map((lesson) => `- [${lesson.scope}] ${lesson.content}`)
        .join("\n")}`,
    );
  }

  const recentRunLines = params.recentRuns
    .filter((run) => run.headline || run.finalText)
    .slice(0, 4)
    .map((run) => {
      const summary = run.headline ?? run.finalText ?? run.status;
      return `- ${run.id}: ${summary}`;
    });

  if (recentRunLines.length > 0) {
    sections.push(`Recent run outcomes:\n${recentRunLines.join("\n")}`);
  }

  if (sections.length === 0) {
    return "";
  }

  return `Persisted relationship context is available for this chat. Use it when it improves accuracy and continuity, but do not invent certainty beyond the stored facts.\n\n${sections.join(
    "\n\n",
  )}`;
}

async function listRehydratedMessages(deps: ProjectDeps, threadId: string, limit?: number): Promise<UIMessage[]> {
  const messageEvents = limit
    ? await deps.conversationEventRepository.listMessagesByThread(threadId, limit)
    : await deps.conversationEventRepository.listAllMessagesByThread(threadId);
  const messages = messageEvents
    .map((event) => deps.conversationEventRepository.toUIMessage(event))
    .filter((message): message is UIMessage => message != null);
  const structuredEvents = await deps.conversationEventRepository.listStructuredEventsByMessageIds(
    threadId,
    messages.map((message) => message.id),
  );
  return rehydrateConversationMessages(messages, structuredEvents);
}

async function refreshConversationCheckpoint(params: {
  deps: ProjectDeps;
  agentId: string;
  thread: ConversationThread;
  model: LanguageModel;
  keepRecentTokens: number;
  existingMessages?: UIMessage[];
}): Promise<ConversationCheckpoint | null> {
  const existingCheckpoint = await params.deps.conversationCheckpointRepository.getByThread(params.thread.id);
  const allMessages = params.existingMessages ?? (await listRehydratedMessages(params.deps, params.thread.id));

  if (allMessages.length <= 1) {
    return existingCheckpoint;
  }

  const boundary = findCompactionBoundary(allMessages, params.keepRecentTokens);
  if (boundary.firstKeptMessageIndex <= 0) {
    return existingCheckpoint;
  }

  const previousCoverageIndex = existingCheckpoint?.coversThroughMessageId
    ? allMessages.findIndex((message) => message.id === existingCheckpoint.coversThroughMessageId)
    : -1;
  const boundaryStart = previousCoverageIndex >= 0 ? previousCoverageIndex + 1 : 0;
  const historyEnd = boundary.isSplitTurn ? boundary.turnStartIndex : boundary.firstKeptMessageIndex;
  const messagesToSummarize = allMessages.slice(boundaryStart, Math.max(historyEnd, boundaryStart));
  const turnPrefixMessages =
    boundary.isSplitTurn && boundary.turnStartIndex >= 0
      ? allMessages.slice(boundary.turnStartIndex, boundary.firstKeptMessageIndex)
      : [];
  const coversThroughMessageId = allMessages[boundary.firstKeptMessageIndex - 1]?.id;

  if (!coversThroughMessageId || existingCheckpoint?.coversThroughMessageId === coversThroughMessageId) {
    return existingCheckpoint;
  }

  let summary = existingCheckpoint?.summary ?? "";

  if (!summary && messagesToSummarize.length === 0 && turnPrefixMessages.length === 0) {
    return existingCheckpoint;
  }

  if (messagesToSummarize.length > 0) {
    summary = await generateCheckpointSummary({
      model: params.model,
      previousSummary: summary || undefined,
      messages: messagesToSummarize,
    });
  }

  if (turnPrefixMessages.length > 0) {
    const splitTurnSummary = await generateSplitTurnSummary({
      model: params.model,
      messages: turnPrefixMessages,
    });
    summary = summary.length > 0 ? `${summary}\n\n### Split Turn Context\n${splitTurnSummary}` : splitTurnSummary;
  }

  await params.deps.conversationCheckpointRepository.upsert({
    threadId: params.thread.id,
    summary,
    messageCount: boundary.firstKeptMessageIndex,
    estimatedTokens: estimateTextTokens(summary),
    coversThroughMessageId,
  });

  const checkpoint = await params.deps.conversationCheckpointRepository.getByThread(params.thread.id);
  if (checkpoint) {
    await params.deps.conversationEventRepository.append({
      threadId: params.thread.id,
      agentId: params.agentId,
      source: "system",
      role: "system",
      eventType: "checkpoint_marker",
      eventKey: `checkpoint:${checkpoint.summaryVersion}`,
      payload: {
        summaryVersion: checkpoint.summaryVersion,
        coversThroughMessageId,
        messageCount: checkpoint.messageCount,
      },
      createdAt: new Date(),
    });
    await params.deps.conversationThreadRepository.markCompactionSuccess(params.thread.id, new Date());
  }

  return checkpoint;
}

async function generateCheckpointSummary(params: {
  model: LanguageModel;
  previousSummary?: string;
  messages: UIMessage[];
}): Promise<string> {
  const transcript = buildConversationTranscript(params.messages);
  const prompt =
    params.previousSummary && params.previousSummary.trim().length > 0
      ? `<existing-checkpoint>\n${params.previousSummary}\n</existing-checkpoint>\n\n<new-conversation>\n${transcript}\n</new-conversation>\n\n${CHECKPOINT_UPDATE_PROMPT}`
      : `<conversation>\n${transcript}\n</conversation>`;

  const result = await generateText({
    model: params.model,
    system: CHECKPOINT_SYSTEM_PROMPT,
    prompt,
    maxOutputTokens: 900,
    temperature: 0,
  });

  return result.text.trim();
}

async function generateSplitTurnSummary(params: { model: LanguageModel; messages: UIMessage[] }): Promise<string> {
  const transcript = buildConversationTranscript(params.messages);
  const result = await generateText({
    model: params.model,
    system: SPLIT_TURN_PROMPT,
    prompt: `<conversation>\n${transcript}\n</conversation>`,
    maxOutputTokens: 300,
    temperature: 0,
  });

  return result.text.trim();
}

async function distillChatMemory(params: {
  deps: ProjectDeps;
  agentId: string;
  threadId: string;
  model: LanguageModel;
  latestUserText: string;
  responseMessage: UIMessage;
  sourceEventIds: string[];
}): Promise<void> {
  const toolNames = extractStructuredConversationEvents(params.responseMessage).map((event) =>
    String(event.payload.toolName ?? ""),
  );
  if (!shouldAttemptChatMemoryDistillation({ latestUserText: params.latestUserText, toolNames })) {
    return;
  }

  const assistantText = extractVisibleText(params.responseMessage);
  const durableLessons = await params.deps.lessonRepository.listDurableByAgent(params.agentId);
  const existingKeys = new Set(durableLessons.map((lesson) => `${lesson.scope}:${lesson.content}`));

  const extracted = await generateObject({
    model: params.model,
    schema: CHAT_MEMORY_EXTRACTION_SCHEMA,
    prompt: `<latest-user-message>\n${params.latestUserText}\n</latest-user-message>\n\n<assistant-response>\n${assistantText}\n</assistant-response>\n\n${CHAT_MEMORY_EXTRACTION_PROMPT}`,
    maxOutputTokens: 400,
    temperature: 0,
  }).catch(() => null);

  if (!extracted) {
    return;
  }

  const memoryWrites = extracted.object.memories.filter((memory) => {
    const key = `${memory.scope}:${memory.content}`;
    return !existingKeys.has(key);
  });

  for (const memory of memoryWrites) {
    existingKeys.add(`${memory.scope}:${memory.content}`);
    const lessonId = await params.deps.lessonRepository.create({
      agentId: params.agentId,
      content: memory.content,
      scope: memory.scope,
      confidence: memory.confidence,
      sourceEventIds: params.sourceEventIds,
      createdAt: new Date(),
    });
    await params.deps.conversationEventRepository.append({
      threadId: params.threadId,
      agentId: params.agentId,
      source: "system",
      role: "system",
      eventType: "memory_write",
      payload: {
        lessonId,
        scope: memory.scope,
      },
      createdAt: new Date(),
    });
  }
}

export function isSyntheticMessageId(id: string | undefined): boolean {
  if (!id) return false;
  return id === "greeting" || id.startsWith("system:");
}

function stripUnansweredToolParts(messages: UIMessage[]): UIMessage[] {
  return messages
    .map((message) => {
      const parts = (message.parts as Array<MessagePartRecord>).filter((part) => {
        const type = part.type as string | undefined;
        const isToolPart = typeof type === "string" && (type.startsWith("tool-") || type === "dynamic-tool");
        if (!isToolPart) {
          return true;
        }

        return part.state === "output-available";
      });

      return {
        ...message,
        parts: parts as UIMessage["parts"],
      };
    })
    .filter((message) => message.parts.length > 0);
}

function sliceMessagesAfterCheckpoint(messages: UIMessage[], coversThroughMessageId?: string): UIMessage[] {
  if (!coversThroughMessageId) {
    return messages;
  }

  const index = messages.findIndex((message) => message.id === coversThroughMessageId);
  return index >= 0 ? messages.slice(index + 1) : messages;
}

function extractVisibleText(message: UIMessage): string {
  return (message.parts as Array<MessagePartRecord>)
    .filter((part) => part.type === "text")
    .map((part) => String(part.text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function maybeAutoTitleManualThread(deps: ProjectDeps, threadId: string, messages: UIMessage[]): Promise<void> {
  const thread = await deps.conversationThreadRepository.getById(threadId);
  if (!thread || thread.scope !== "manual" || thread.title !== NEW_THREAD_TITLE) {
    return;
  }

  const title = deriveThreadTitle(messages);
  if (!title) {
    return;
  }

  await deps.conversationThreadRepository.updateTitle(threadId, title);
}

function deriveThreadTitle(messages: UIMessage[]): string | null {
  const firstUserText = messages
    .filter((message) => message.role === "user")
    .map(extractVisibleText)
    .map((text) => text.split("\n")[0]?.trim() ?? "")
    .find(Boolean);

  if (!firstUserText) {
    return null;
  }

  const normalized = firstUserText.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_THREAD_TITLE_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, MAX_THREAD_TITLE_LENGTH - 3).trimEnd()}...`;
}
