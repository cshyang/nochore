import { desc, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { contextSnapshots } from "../db/schema";
import { type ContextSnapshotKind, type ContextSnapshotRecord, ContextSnapshotSchema } from "../types";
import { parseJson } from "./marshaling";

type Db = HarnessDb;

export interface CreateContextSnapshotInput {
  id?: string;
  sessionId: string;
  agentId: string;
  workItemId?: string;
  conversationThreadId?: string;
  kind: ContextSnapshotKind;
  messagesVersion?: string;
  memoryVersion?: string;
  toolBindingsVersion?: string;
  policyVersion?: string;
  promptHash: string;
  payload: Record<string, unknown>;
  createdAt?: Date;
}

export class ContextSnapshotRepository {
  constructor(private db: Db) {}

  async create(input: CreateContextSnapshotInput): Promise<string> {
    const id = input.id ?? crypto.randomUUID();
    const now = input.createdAt ?? new Date();
    this.db
      .insert(contextSnapshots)
      .values({
        id,
        sessionId: input.sessionId,
        agentId: input.agentId,
        workItemId: input.workItemId ?? null,
        conversationThreadId: input.conversationThreadId ?? null,
        kind: input.kind,
        messagesVersion: input.messagesVersion ?? null,
        memoryVersion: input.memoryVersion ?? null,
        toolBindingsVersion: input.toolBindingsVersion ?? null,
        policyVersion: input.policyVersion ?? null,
        promptHash: input.promptHash,
        payload: JSON.stringify(input.payload),
        createdAt: now.getTime(),
      })
      .run();
    return id;
  }

  async getById(id: string): Promise<ContextSnapshotRecord | null> {
    const row = this.db.select().from(contextSnapshots).where(eq(contextSnapshots.id, id)).get();
    return row ? toContextSnapshotRecord(row) : null;
  }

  async listBySession(sessionId: string, limit?: number): Promise<ContextSnapshotRecord[]> {
    let query = this.db
      .select()
      .from(contextSnapshots)
      .where(eq(contextSnapshots.sessionId, sessionId))
      .orderBy(desc(contextSnapshots.createdAt));
    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }
    return query.all().map(toContextSnapshotRecord);
  }

  async listByWorkItem(workItemId: string, limit?: number): Promise<ContextSnapshotRecord[]> {
    let query = this.db
      .select()
      .from(contextSnapshots)
      .where(eq(contextSnapshots.workItemId, workItemId))
      .orderBy(desc(contextSnapshots.createdAt));
    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }
    return query.all().map(toContextSnapshotRecord);
  }
}

function toContextSnapshotRecord(row: typeof contextSnapshots.$inferSelect): ContextSnapshotRecord {
  return ContextSnapshotSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    agentId: row.agentId,
    workItemId: row.workItemId ?? undefined,
    conversationThreadId: row.conversationThreadId ?? undefined,
    kind: row.kind,
    messagesVersion: row.messagesVersion ?? undefined,
    memoryVersion: row.memoryVersion ?? undefined,
    toolBindingsVersion: row.toolBindingsVersion ?? undefined,
    policyVersion: row.policyVersion ?? undefined,
    promptHash: row.promptHash,
    payload: parseJson<Record<string, unknown>>(row.payload, {}),
    createdAt: new Date(row.createdAt),
  });
}
