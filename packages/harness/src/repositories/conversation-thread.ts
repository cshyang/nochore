import { and, desc, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { conversationThreads } from "../db/schema";
import {
  type ConversationChannelKind,
  ConversationChannelKindSchema,
  type ConversationThread,
  ConversationThreadSchema,
  type ConversationThreadScope,
  ConversationThreadScopeSchema,
} from "../types";

type Db = HarnessDb;

export interface CreateConversationThreadInput {
  id?: string;
  agentId: string;
  scope: ConversationThreadScope;
  channelKind: ConversationChannelKind;
  channelKey?: string;
  title?: string;
  createdAt?: Date;
}

export class ConversationThreadRepository {
  constructor(private db: Db) {}

  async getById(id: string): Promise<ConversationThread | null> {
    const row = this.db.select().from(conversationThreads).where(eq(conversationThreads.id, id)).get();
    return row ? toConversationThread(row) : null;
  }

  async getPrimaryByAgent(agentId: string): Promise<ConversationThread | null> {
    const row = this.db
      .select()
      .from(conversationThreads)
      .where(and(eq(conversationThreads.agentId, agentId), eq(conversationThreads.scope, "primary")))
      .orderBy(desc(conversationThreads.updatedAt))
      .get();
    return row ? toConversationThread(row) : null;
  }

  async create(input: CreateConversationThreadInput): Promise<string> {
    const now = input.createdAt ?? new Date();
    const id = input.id ?? crypto.randomUUID();

    this.db
      .insert(conversationThreads)
      .values({
        id,
        agentId: input.agentId,
        scope: ConversationThreadScopeSchema.parse(input.scope),
        channelKind: ConversationChannelKindSchema.parse(input.channelKind),
        channelKey: input.channelKey ?? null,
        title: input.title ?? "",
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        lastMessageAt: null,
      })
      .run();

    return id;
  }

  async getOrCreatePrimary(agentId: string): Promise<ConversationThread> {
    const existing = await this.getPrimaryByAgent(agentId);
    if (existing) {
      return existing;
    }

    const id = await this.create({
      agentId,
      scope: "primary",
      channelKind: "web",
      title: "Main chat",
    });

    return (await this.getById(id))!;
  }

  async touch(id: string, messageAt: Date): Promise<void> {
    this.db
      .update(conversationThreads)
      .set({
        updatedAt: Date.now(),
        lastMessageAt: messageAt.getTime(),
      })
      .where(eq(conversationThreads.id, id))
      .run();
  }

  async recordUsage(
    id: string,
    usage: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    },
  ): Promise<void> {
    this.db
      .update(conversationThreads)
      .set({
        updatedAt: Date.now(),
        lastInputTokens: usage.inputTokens ?? null,
        lastOutputTokens: usage.outputTokens ?? null,
        lastTotalTokens: usage.totalTokens ?? null,
      })
      .where(eq(conversationThreads.id, id))
      .run();
  }

  async markCompactionSuccess(id: string, compactedAt: Date): Promise<void> {
    this.db
      .update(conversationThreads)
      .set({
        updatedAt: Date.now(),
        lastCompactedAt: compactedAt.getTime(),
        consecutiveCompactionFailures: 0,
      })
      .where(eq(conversationThreads.id, id))
      .run();
  }

  async incrementCompactionFailures(id: string): Promise<void> {
    const existing = await this.getById(id);
    if (!existing) {
      return;
    }

    this.db
      .update(conversationThreads)
      .set({
        updatedAt: Date.now(),
        consecutiveCompactionFailures: existing.consecutiveCompactionFailures + 1,
      })
      .where(eq(conversationThreads.id, id))
      .run();
  }

  async resetCompactionFailures(id: string): Promise<void> {
    this.db
      .update(conversationThreads)
      .set({
        updatedAt: Date.now(),
        consecutiveCompactionFailures: 0,
      })
      .where(eq(conversationThreads.id, id))
      .run();
  }
}

function toConversationThread(row: typeof conversationThreads.$inferSelect): ConversationThread {
  return ConversationThreadSchema.parse({
    id: row.id,
    agentId: row.agentId,
    scope: row.scope,
    channelKind: row.channelKind,
    channelKey: row.channelKey ?? undefined,
    title: row.title,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    lastMessageAt: row.lastMessageAt != null ? new Date(row.lastMessageAt) : undefined,
    lastInputTokens: row.lastInputTokens ?? undefined,
    lastOutputTokens: row.lastOutputTokens ?? undefined,
    lastTotalTokens: row.lastTotalTokens ?? undefined,
    lastCompactedAt: row.lastCompactedAt != null ? new Date(row.lastCompactedAt) : undefined,
    consecutiveCompactionFailures: row.consecutiveCompactionFailures,
  });
}
