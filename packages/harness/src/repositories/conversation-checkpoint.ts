import { and, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { conversationCheckpoints } from "../db/schema";
import {
  type ConversationCheckpoint,
  type ConversationCheckpointKind,
  ConversationCheckpointKindSchema,
  ConversationCheckpointSchema,
} from "../types";

type Db = HarnessDb;

export class ConversationCheckpointRepository {
  constructor(private db: Db) {}

  async getByThread(threadId: string, kind: ConversationCheckpointKind = "rolling_summary"): Promise<ConversationCheckpoint | null> {
    const row = this.db
      .select()
      .from(conversationCheckpoints)
      .where(and(eq(conversationCheckpoints.threadId, threadId), eq(conversationCheckpoints.kind, kind)))
      .get();
    return row ? toConversationCheckpoint(row) : null;
  }

  async upsert(input: {
    threadId: string;
    kind?: ConversationCheckpointKind;
    summary: string;
    messageCount: number;
    estimatedTokens?: number;
    coversThroughMessageId?: string;
    summaryVersion?: number;
  }): Promise<void> {
    const now = Date.now();
    const kind = ConversationCheckpointKindSchema.parse(input.kind ?? "rolling_summary");
    const existing = await this.getByThread(input.threadId, kind);

    if (existing) {
      this.db
        .update(conversationCheckpoints)
        .set({
          summary: input.summary,
          messageCount: input.messageCount,
          estimatedTokens: input.estimatedTokens ?? null,
          coversThroughMessageId: input.coversThroughMessageId ?? null,
          summaryVersion: input.summaryVersion ?? existing.summaryVersion + 1,
          updatedAt: now,
        })
        .where(eq(conversationCheckpoints.id, existing.id))
        .run();
      return;
    }

    this.db
      .insert(conversationCheckpoints)
      .values({
        id: crypto.randomUUID(),
        threadId: input.threadId,
        kind,
        summary: input.summary,
        messageCount: input.messageCount,
        estimatedTokens: input.estimatedTokens ?? null,
        coversThroughMessageId: input.coversThroughMessageId ?? null,
        summaryVersion: input.summaryVersion ?? 1,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  }

  async deleteByThread(threadId: string, kind: ConversationCheckpointKind = "rolling_summary"): Promise<void> {
    this.db
      .delete(conversationCheckpoints)
      .where(and(eq(conversationCheckpoints.threadId, threadId), eq(conversationCheckpoints.kind, kind)))
      .run();
  }
}

function toConversationCheckpoint(row: typeof conversationCheckpoints.$inferSelect): ConversationCheckpoint {
  return ConversationCheckpointSchema.parse({
    id: row.id,
    threadId: row.threadId,
    kind: row.kind,
    summary: row.summary,
    messageCount: row.messageCount,
    estimatedTokens: row.estimatedTokens ?? undefined,
    coversThroughMessageId: row.coversThroughMessageId ?? undefined,
    summaryVersion: row.summaryVersion,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  });
}
