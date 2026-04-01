import type { UIMessage } from "ai";
import type { ConversationEvent } from "../types";

export const RECENT_VISIBLE_MESSAGE_LIMIT = 12;
export const RECENT_MODEL_MESSAGE_LIMIT = 16;
export const CHECKPOINT_MESSAGE_THRESHOLD = 24;
export const CHECKPOINT_SOFT_TOKEN_THRESHOLD = 110_000;
export const CHECKPOINT_HARD_TOKEN_THRESHOLD = 140_000;
export const CHECKPOINT_KEEP_RECENT_TOKENS = 20_000;
export const INLINE_COMPACTION_KEEP_RECENT_TOKENS = 12_000;
export const EPISODIC_NO_FINDING_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const EPISODIC_ATTEMPTED_TTL_MS = 3 * 24 * 60 * 60 * 1000;

type MessagePartRecord = Record<string, unknown>;

export interface StructuredConversationEventSpec {
  role: "assistant" | "tool" | "system";
  eventType: "tool_call" | "tool_output";
  eventKey: string;
  messageId?: string;
  payload: Record<string, unknown>;
}

export interface CompactionBoundary {
  firstKeptMessageIndex: number;
  turnStartIndex: number;
  isSplitTurn: boolean;
}

export interface RunLessonWrite {
  scope: string;
  confidence: "high" | "medium" | "low";
  content: string;
  expiresInMs?: number;
}

export function sanitizeConversationMessage(message: UIMessage): UIMessage | null {
  const parts = sanitizeMessageParts(message.parts as Array<MessagePartRecord>);
  if (parts.length === 0) {
    if (message.role === "assistant" && (message.parts as Array<MessagePartRecord>).some((part) => isRequestInputToolPart(part))) {
      return {
        id: message.id,
        role: "assistant",
        parts: [] as UIMessage["parts"],
      };
    }

    return null;
  }

  return {
    id: message.id,
    role: message.role,
    parts: parts as UIMessage["parts"],
  };
}

export function sanitizeMessageParts(parts: Array<MessagePartRecord>): Array<MessagePartRecord> {
  const sanitized: MessagePartRecord[] = [];

  for (const part of parts) {
    if (part.type === "text") {
      const text = String(part.text ?? "").trim();
      if (text.length > 0) {
        sanitized.push({ ...part, text });
      }
      continue;
    }

    if (isRequestInputToolPart(part) && part.state === "output-available") {
      sanitized.push({
        type: "tool-request_input",
        toolCallId: part.toolCallId,
        state: "output-available",
        input: part.input,
        output: part.output,
      });
    }
  }

  return sanitized;
}

export function extractStructuredConversationEvents(message: UIMessage): StructuredConversationEventSpec[] {
  if (message.role !== "assistant") {
    return [];
  }

  const events: StructuredConversationEventSpec[] = [];

  for (const part of message.parts as Array<MessagePartRecord>) {
    const invocation = getToolInvocation(part);
    if (!invocation) {
      continue;
    }

    const basePayload = {
      messageId: message.id,
      toolCallId: invocation.toolCallId,
      toolName: invocation.toolName,
      input: invocation.input,
    };

    events.push({
      role: "assistant",
      eventType: "tool_call",
      eventKey: `tool:${invocation.toolCallId}:call`,
      messageId: message.id,
      payload: {
        ...basePayload,
        state: invocation.state,
      },
    });

    if (invocation.state === "output-available") {
      events.push({
        role: "tool",
        eventType: "tool_output",
        eventKey: `tool:${invocation.toolCallId}:output`,
        messageId: message.id,
        payload: {
          ...basePayload,
          output: invocation.output,
        },
      });
    }
  }

  return events;
}

export function rehydrateConversationMessages(messages: UIMessage[], structuredEvents: ConversationEvent[]): UIMessage[] {
  const eventsByMessageId = new Map<string, ConversationEvent[]>();
  for (const event of structuredEvents) {
    if (!event.messageId) continue;
    const bucket = eventsByMessageId.get(event.messageId) ?? [];
    bucket.push(event);
    eventsByMessageId.set(event.messageId, bucket);
  }

  return messages.map((message) => {
    if (message.role !== "assistant") {
      return message;
    }

    const existingParts = [...(message.parts as Array<MessagePartRecord>)];
    const existingToolCallIds = new Set(
      existingParts
        .filter((part) => isRequestInputToolPart(part))
        .map((part) => String(part.toolCallId ?? "")),
    );
    const messageEvents = eventsByMessageId.get(message.id) ?? [];
    const requestInputs = buildRequestInputParts(messageEvents).filter(
      (part) => !existingToolCallIds.has(String(part.toolCallId ?? "")),
    );

    if (requestInputs.length === 0) {
      return message;
    }

    return {
      ...message,
      parts: [...existingParts, ...requestInputs] as UIMessage["parts"],
    };
  });
}

export function estimateTextTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateMessageTokens(message: UIMessage): number {
  let chars = 0;

  for (const part of message.parts as Array<MessagePartRecord>) {
    if (part.type === "text") {
      chars += String(part.text ?? "").length;
      continue;
    }

    if (isRequestInputToolPart(part)) {
      chars += JSON.stringify(part.input ?? {}).length;
      chars += JSON.stringify(part.output ?? {}).length;
      continue;
    }
  }

  return Math.ceil(chars / 4);
}

export function estimateConversationStateTokens(params: {
  system: string;
  checkpointSummary?: string;
  lessons?: string[];
  recentRuns?: string[];
  messages: UIMessage[];
}): number {
  let total = estimateTextTokens(params.system);
  total += estimateTextTokens(params.checkpointSummary ?? "");
  total += (params.lessons ?? []).reduce((sum, lesson) => sum + estimateTextTokens(lesson), 0);
  total += (params.recentRuns ?? []).reduce((sum, run) => sum + estimateTextTokens(run), 0);
  total += params.messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  return total;
}

export function findCompactionBoundary(messages: UIMessage[], keepRecentTokens: number): CompactionBoundary {
  if (messages.length === 0) {
    return { firstKeptMessageIndex: 0, turnStartIndex: -1, isSplitTurn: false };
  }

  let accumulated = 0;
  let cutIndex = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    accumulated += estimateMessageTokens(messages[index]!);
    if (accumulated >= keepRecentTokens) {
      cutIndex = index;
      break;
    }
  }

  if (accumulated < keepRecentTokens) {
    cutIndex = 0;
  }

  const isSplitTurn = messages[cutIndex]?.role === "assistant";
  const turnStartIndex = isSplitTurn ? findTurnStartIndex(messages, cutIndex) : -1;

  return {
    firstKeptMessageIndex: cutIndex,
    turnStartIndex,
    isSplitTurn: isSplitTurn && turnStartIndex !== -1,
  };
}

export function shouldRefreshCheckpoint(messageCount: number, estimatedTokens: number): boolean {
  return messageCount > CHECKPOINT_MESSAGE_THRESHOLD || estimatedTokens > CHECKPOINT_SOFT_TOKEN_THRESHOLD;
}

export function shouldInlineCompact(estimatedTokens: number): boolean {
  return estimatedTokens > CHECKPOINT_HARD_TOKEN_THRESHOLD;
}

export function buildConversationTranscript(messages: UIMessage[]): string {
  return messages
    .map((message) => {
      const prefix = message.role === "user" ? "User" : "Assistant";
      const text = (message.parts as Array<MessagePartRecord>)
        .map((part) => {
          if (part.type === "text") {
            return String(part.text ?? "");
          }

          if (isRequestInputToolPart(part)) {
            const input = part.input as { question?: string } | undefined;
            const output = part.output as
              | { selectedKeys?: string[]; customText?: string; skipped?: boolean }
              | undefined;
            const answer = output?.skipped
              ? "Skipped"
              : output?.customText ?? (output?.selectedKeys ?? []).join(", ");
            return `Question: ${input?.question ?? ""}\nAnswer: ${answer}`;
          }

          return "";
        })
        .filter(Boolean)
        .join("\n")
        .trim();

      return text ? `${prefix}: ${text}` : `${prefix}: (no visible content)`;
    })
    .join("\n\n");
}

export function shouldAttemptChatMemoryDistillation(params: {
  latestUserText: string;
  toolNames?: string[];
}): boolean {
  if (params.toolNames?.some((toolName) => toolName === "update_config" || toolName === "add_provider")) {
    return true;
  }

  const text = params.latestUserText.toLowerCase();
  if (text.length === 0) {
    return false;
  }

  return /(prefer|always|never|actually|i meant|don't|do not|remember|my name is|call me|from now on|use\b)/i.test(
    text,
  );
}

export function classifyRunLessonWrites(params: {
  headline?: string;
  finalText?: string;
  details?: string[];
  findingCount: number;
  toolCallCount: number;
}): RunLessonWrite[] {
  const finalText = params.finalText?.trim() ?? "";
  const headline = params.headline?.trim() ?? "";
  const details = params.details ?? [];
  const combined = [headline, finalText, ...details].filter(Boolean).join(" ").trim();

  if (params.findingCount > 0 || (combined && !looksLikeNoFinding(combined))) {
    return [
      {
        scope: "memory:run-summary",
        confidence: params.findingCount > 0 ? "high" : "medium",
        content: (finalText || combined).slice(0, 2_000),
      },
    ];
  }

  if (params.toolCallCount > 0 && combined) {
    return [
      {
        scope: "episode:no-finding",
        confidence: "low",
        content: combined.slice(0, 600),
        expiresInMs: EPISODIC_NO_FINDING_TTL_MS,
      },
    ];
  }

  if (params.toolCallCount > 0) {
    return [
      {
        scope: "episode:attempted",
        confidence: "low",
        content: headline || "The agent investigated this task but did not produce a durable finding.",
        expiresInMs: EPISODIC_ATTEMPTED_TTL_MS,
      },
    ];
  }

  return [];
}

function isRequestInputToolPart(part: MessagePartRecord): boolean {
  return part.type === "tool-request_input" || (part.type === "dynamic-tool" && part.toolName === "request_input");
}

function getToolInvocation(part: MessagePartRecord):
  | {
      toolName: string;
      toolCallId: string;
      state: string;
      input: unknown;
      output: unknown;
    }
  | undefined {
  const type = part.type;
  const toolName =
    type === "dynamic-tool"
      ? String(part.toolName ?? "")
      : typeof type === "string" && type.startsWith("tool-")
        ? type.slice(5)
        : "";

  const toolCallId = String(part.toolCallId ?? "");
  if (!toolName || !toolCallId) {
    return undefined;
  }

  return {
    toolName,
    toolCallId,
    state: String(part.state ?? ""),
    input: part.input,
    output: part.output,
  };
}

function buildRequestInputParts(events: ConversationEvent[]): Array<MessagePartRecord> {
  const byToolCallId = new Map<
    string,
    {
      input?: unknown;
      output?: unknown;
      hasCall: boolean;
    }
  >();

  for (const event of events) {
    const toolName = String((event.payload as Record<string, unknown>).toolName ?? "");
    const toolCallId = String((event.payload as Record<string, unknown>).toolCallId ?? "");
    if (toolName !== "request_input" || toolCallId.length === 0) {
      continue;
    }

    const record = byToolCallId.get(toolCallId) ?? { hasCall: false };
    if (event.eventType === "tool_call") {
      record.input = (event.payload as Record<string, unknown>).input;
      record.hasCall = true;
    }
    if (event.eventType === "tool_output") {
      record.input = (event.payload as Record<string, unknown>).input ?? record.input;
      record.output = (event.payload as Record<string, unknown>).output;
      record.hasCall = true;
    }
    byToolCallId.set(toolCallId, record);
  }

  return [...byToolCallId.entries()].map(([toolCallId, record]) => ({
    type: "tool-request_input",
    toolCallId,
    state: record.output != null ? "output-available" : "input-available",
    input: record.input,
    ...(record.output != null ? { output: record.output } : {}),
  }));
}

function findTurnStartIndex(messages: UIMessage[], entryIndex: number): number {
  for (let index = entryIndex; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") {
      return index;
    }
  }

  return -1;
}

function looksLikeNoFinding(text: string): boolean {
  return /(no (actionable )?(issue|issues|finding|findings|change|changes|anomal(y|ies)|problem|problems)|nothing (important|actionable)|did not find|no significant)/i.test(
    text,
  );
}
