import type { UIMessage } from "ai";
import type { ConversationEvent } from "../types";

export type MessagePartRecord = Record<string, unknown>;

export interface StructuredConversationEventSpec {
  role: "assistant" | "tool" | "system";
  eventType: "tool_call" | "tool_output";
  eventKey: string;
  messageId?: string;
  payload: Record<string, unknown>;
}

export function isRequestInputToolPart(part: MessagePartRecord): boolean {
  return part.type === "tool-request_input" || (part.type === "dynamic-tool" && part.toolName === "request_input");
}

export function getToolInvocation(part: MessagePartRecord):
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

export function sanitizeConversationMessage(message: UIMessage): UIMessage | null {
  const parts = sanitizeMessageParts(message.parts as Array<MessagePartRecord>);
  if (parts.length === 0) {
    if (
      message.role === "assistant" &&
      (message.parts as Array<MessagePartRecord>).some((part) => isRequestInputToolPart(part))
    ) {
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

export function rehydrateConversationMessages(
  messages: UIMessage[],
  structuredEvents: ConversationEvent[],
): UIMessage[] {
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
      existingParts.filter((part) => isRequestInputToolPart(part)).map((part) => String(part.toolCallId ?? "")),
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
