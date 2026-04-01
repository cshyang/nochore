import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { UIMessage } from "ai";
import type { HarnessDb } from "../db/client";
import { conversationEvents } from "../db/schema";
import {
  type ConversationEvent,
  type ConversationEventPayload,
  ConversationEventRoleSchema,
  type ConversationEventSource,
  ConversationEventSchema,
  ConversationEventTypeSchema,
  ConversationMessagePayloadSchema,
} from "../types";

type Db = HarnessDb;

export interface UpsertConversationMessageInput {
  threadId: string;
  agentId: string;
  source: ConversationEventSource;
  message: UIMessage;
  createdAt: Date;
}

export interface UpsertConversationStructuredEventInput {
  threadId: string;
  agentId: string;
  source: ConversationEventSource;
  role: "user" | "assistant" | "tool" | "system";
  eventType: "tool_call" | "tool_output" | "run_result" | "checkpoint_marker" | "memory_write" | "memory_superseded";
  payload: ConversationEventPayload;
  eventKey: string;
  messageId?: string;
  createdAt: Date;
}

export class ConversationEventRepository {
  constructor(private db: Db) {}

  async append(input: {
    threadId: string;
    agentId: string;
    source: ConversationEventSource;
    role: "user" | "assistant" | "tool" | "system";
    eventType: "message" | "tool_call" | "tool_output" | "run_result" | "checkpoint_marker" | "memory_write" | "memory_superseded";
    payload: ConversationEventPayload;
    eventKey?: string;
    messageId?: string;
    createdAt: Date;
  }): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(conversationEvents)
      .values({
        id,
        threadId: input.threadId,
        agentId: input.agentId,
        source: input.source,
        role: ConversationEventRoleSchema.parse(input.role),
        eventType: ConversationEventTypeSchema.parse(input.eventType),
        messageId: input.messageId ?? null,
        eventKey: input.eventKey ?? null,
        payload: JSON.stringify(input.payload),
        createdAt: input.createdAt.getTime(),
      })
      .run();
    return id;
  }

  async upsertMessages(inputs: UpsertConversationMessageInput[]): Promise<ConversationEvent[]> {
    if (inputs.length === 0) return [];

    for (const input of inputs) {
      const role = ConversationEventRoleSchema.parse(input.message.role);
      const payload = JSON.stringify({
        messageId: input.message.id,
        parts: input.message.parts as Array<Record<string, unknown>>,
      } satisfies ConversationEventPayload);

      this.db
        .insert(conversationEvents)
        .values({
          id: crypto.randomUUID(),
          threadId: input.threadId,
          agentId: input.agentId,
          source: input.source,
          role,
          eventType: "message",
          messageId: input.message.id,
          eventKey: null,
          payload,
          createdAt: input.createdAt.getTime(),
        })
        .onConflictDoUpdate({
          target: [conversationEvents.threadId, conversationEvents.messageId],
          set: {
            source: input.source,
            role,
            eventType: "message",
            payload,
          },
        })
        .run();
    }

    return this.listMessageEventsByMessageIds(
      inputs[0].threadId,
      inputs.map((input) => input.message.id),
    );
  }

  async upsertStructuredEvents(inputs: UpsertConversationStructuredEventInput[]): Promise<ConversationEvent[]> {
    if (inputs.length === 0) return [];

    for (const input of inputs) {
      this.db
        .insert(conversationEvents)
        .values({
          id: crypto.randomUUID(),
          threadId: input.threadId,
          agentId: input.agentId,
          source: input.source,
          role: ConversationEventRoleSchema.parse(input.role),
          eventType: ConversationEventTypeSchema.parse(input.eventType),
          messageId: null,
          eventKey: input.eventKey,
          payload: JSON.stringify(input.payload),
          createdAt: input.createdAt.getTime(),
        })
        .onConflictDoUpdate({
          target: [conversationEvents.threadId, conversationEvents.eventKey],
          set: {
            source: input.source,
            role: ConversationEventRoleSchema.parse(input.role),
            eventType: ConversationEventTypeSchema.parse(input.eventType),
            messageId: null,
            payload: JSON.stringify(input.payload),
          },
        })
        .run();
    }

    return this.listStructuredEventsByEventKeys(
      inputs[0].threadId,
      inputs.map((input) => input.eventKey),
    );
  }

  async listByThread(threadId: string, limit?: number): Promise<ConversationEvent[]> {
    let query = this.db
      .select()
      .from(conversationEvents)
      .where(eq(conversationEvents.threadId, threadId))
      .orderBy(asc(conversationEvents.createdAt));

    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }

    return query.all().map(toConversationEvent);
  }

  async listMessagesByThread(threadId: string, limit?: number): Promise<ConversationEvent[]> {
    let query = this.db
      .select()
      .from(conversationEvents)
      .where(and(eq(conversationEvents.threadId, threadId), eq(conversationEvents.eventType, "message")))
      .orderBy(desc(conversationEvents.createdAt));

    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }

    return query.all().reverse().map(toConversationEvent);
  }

  async listAllMessagesByThread(threadId: string): Promise<ConversationEvent[]> {
    return this.db
      .select()
      .from(conversationEvents)
      .where(and(eq(conversationEvents.threadId, threadId), eq(conversationEvents.eventType, "message")))
      .orderBy(asc(conversationEvents.createdAt))
      .all()
      .map(toConversationEvent);
  }

  async listMessageEventsByMessageIds(threadId: string, messageIds: string[]): Promise<ConversationEvent[]> {
    if (messageIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(conversationEvents)
      .where(
        and(
          eq(conversationEvents.threadId, threadId),
          eq(conversationEvents.eventType, "message"),
          inArray(conversationEvents.messageId, messageIds),
        ),
      )
      .orderBy(asc(conversationEvents.createdAt))
      .all()
      .map(toConversationEvent);
  }

  async listStructuredEventsByThread(threadId: string): Promise<ConversationEvent[]> {
    return this.db
      .select()
      .from(conversationEvents)
      .where(and(eq(conversationEvents.threadId, threadId), ne(conversationEvents.eventType, "message")))
      .orderBy(asc(conversationEvents.createdAt))
      .all()
      .map(toConversationEvent);
  }

  async listStructuredEventsByMessageIds(threadId: string, messageIds: string[]): Promise<ConversationEvent[]> {
    if (messageIds.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(conversationEvents)
      .where(and(eq(conversationEvents.threadId, threadId), ne(conversationEvents.eventType, "message")))
      .orderBy(asc(conversationEvents.createdAt))
      .all()
      .map(toConversationEvent)
      .filter((event: ConversationEvent) => {
        const payloadMessageId = (event.payload as Record<string, unknown>).messageId;
        return typeof payloadMessageId === "string" && messageIds.includes(payloadMessageId);
      });
  }

  async listStructuredEventsByEventKeys(threadId: string, eventKeys: string[]): Promise<ConversationEvent[]> {
    if (eventKeys.length === 0) {
      return [];
    }

    return this.db
      .select()
      .from(conversationEvents)
      .where(
        and(
          eq(conversationEvents.threadId, threadId),
          ne(conversationEvents.eventType, "message"),
          inArray(conversationEvents.eventKey, eventKeys),
        ),
      )
      .orderBy(asc(conversationEvents.createdAt))
      .all()
      .map(toConversationEvent);
  }

  toUIMessage(event: ConversationEvent): UIMessage | null {
    if (event.eventType !== "message") {
      return null;
    }

    const payload = ConversationMessagePayloadSchema.safeParse(event.payload);
    if (!payload.success) {
      return null;
    }

    return {
      id: payload.data.messageId,
      role: event.role === "system" || event.role === "tool" ? "assistant" : event.role,
      parts: payload.data.parts as UIMessage["parts"],
    };
  }
}

function toConversationEvent(row: typeof conversationEvents.$inferSelect): ConversationEvent {
  return ConversationEventSchema.parse({
    id: row.id,
    threadId: row.threadId,
    agentId: row.agentId,
    source: row.source,
    role: row.role,
    eventType: row.eventType,
    messageId: row.messageId ?? undefined,
    eventKey: row.eventKey ?? undefined,
    payload: JSON.parse(row.payload),
    createdAt: new Date(row.createdAt),
  });
}
