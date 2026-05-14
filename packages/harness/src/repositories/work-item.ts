import { and, desc, eq, inArray } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { workItems } from "../db/schema";
import { type WorkItemKind, type WorkItemRecord, WorkItemSchema, type WorkItemStatus } from "../types";
import { parseJson } from "./marshaling";

type Db = HarnessDb;

export interface CreateWorkItemInput {
  id?: string;
  sessionId: string;
  agentId: string;
  kind: WorkItemKind;
  status?: WorkItemStatus;
  parentWorkItemId?: string;
  runId?: string;
  agentTaskId?: string;
  triggerRunId?: string;
  title?: string;
  input?: Record<string, unknown>;
  createdAt?: Date;
}

export class WorkItemRepository {
  constructor(private db: Db) {}

  async create(input: CreateWorkItemInput): Promise<string> {
    const id = input.id ?? crypto.randomUUID();
    const now = input.createdAt ?? new Date();
    this.db
      .insert(workItems)
      .values({
        id,
        sessionId: input.sessionId,
        agentId: input.agentId,
        kind: input.kind,
        status: input.status ?? "queued",
        parentWorkItemId: input.parentWorkItemId ?? null,
        runId: input.runId ?? null,
        agentTaskId: input.agentTaskId ?? null,
        triggerRunId: input.triggerRunId ?? null,
        title: input.title ?? null,
        input: input.input ? JSON.stringify(input.input) : null,
        createdAt: now.getTime(),
        startedAt: input.status === "running" ? now.getTime() : null,
      })
      .run();
    return id;
  }

  async getById(id: string): Promise<WorkItemRecord | null> {
    const row = this.db.select().from(workItems).where(eq(workItems.id, id)).get();
    return row ? toWorkItemRecord(row) : null;
  }

  async getByRunId(runId: string): Promise<WorkItemRecord | null> {
    const row = this.db.select().from(workItems).where(eq(workItems.runId, runId)).get();
    return row ? toWorkItemRecord(row) : null;
  }

  async getByAgentTaskId(agentTaskId: string): Promise<WorkItemRecord | null> {
    const row = this.db.select().from(workItems).where(eq(workItems.agentTaskId, agentTaskId)).get();
    return row ? toWorkItemRecord(row) : null;
  }

  async listByAgent(agentId: string, limit?: number): Promise<WorkItemRecord[]> {
    let query = this.db
      .select()
      .from(workItems)
      .where(eq(workItems.agentId, agentId))
      .orderBy(desc(workItems.createdAt));
    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }
    return query.all().map(toWorkItemRecord);
  }

  async listBySession(sessionId: string): Promise<WorkItemRecord[]> {
    return this.db
      .select()
      .from(workItems)
      .where(eq(workItems.sessionId, sessionId))
      .orderBy(desc(workItems.createdAt))
      .all()
      .map(toWorkItemRecord);
  }

  async listChildren(parentWorkItemId: string): Promise<WorkItemRecord[]> {
    return this.db
      .select()
      .from(workItems)
      .where(eq(workItems.parentWorkItemId, parentWorkItemId))
      .orderBy(desc(workItems.createdAt))
      .all()
      .map(toWorkItemRecord);
  }

  async listChildrenByParents(parentWorkItemIds: string[]): Promise<WorkItemRecord[]> {
    if (parentWorkItemIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(workItems)
      .where(inArray(workItems.parentWorkItemId, parentWorkItemIds))
      .orderBy(desc(workItems.createdAt))
      .all()
      .map(toWorkItemRecord);
  }

  async markRunning(id: string, startedAt = new Date()): Promise<void> {
    this.db
      .update(workItems)
      .set({ status: "running", startedAt: startedAt.getTime(), error: null })
      .where(eq(workItems.id, id))
      .run();
  }

  async updateLinks(
    id: string,
    patch: {
      runId?: string;
      agentTaskId?: string;
      triggerRunId?: string;
    },
  ): Promise<void> {
    const updateData: Partial<typeof workItems.$inferInsert> = {};
    if (patch.runId !== undefined) updateData.runId = patch.runId;
    if (patch.agentTaskId !== undefined) updateData.agentTaskId = patch.agentTaskId;
    if (patch.triggerRunId !== undefined) updateData.triggerRunId = patch.triggerRunId;
    if (Object.keys(updateData).length === 0) return;
    this.db.update(workItems).set(updateData).where(eq(workItems.id, id)).run();
  }

  async complete(id: string, completedAt: Date, result?: Record<string, unknown>): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "completed",
        completedAt: completedAt.getTime(),
        result: result ? JSON.stringify(result) : null,
        error: null,
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async fail(id: string, completedAt: Date, error: string, result?: Record<string, unknown>): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "failed",
        completedAt: completedAt.getTime(),
        result: result ? JSON.stringify(result) : null,
        error,
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async cancel(id: string, completedAt: Date, error: string): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "cancelled",
        completedAt: completedAt.getTime(),
        error,
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async setStatus(id: string, status: WorkItemStatus): Promise<void> {
    this.db.update(workItems).set({ status }).where(eq(workItems.id, id)).run();
  }

  async clearActiveBySession(sessionId: string, activeWorkItemId: string): Promise<void> {
    this.db
      .update(workItems)
      .set({ status: "cancelled", completedAt: Date.now(), error: "Cancelled by user" })
      .where(and(eq(workItems.sessionId, sessionId), eq(workItems.id, activeWorkItemId)))
      .run();
  }
}

function toWorkItemRecord(row: typeof workItems.$inferSelect): WorkItemRecord {
  return WorkItemSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    agentId: row.agentId,
    kind: row.kind,
    status: row.status,
    parentWorkItemId: row.parentWorkItemId ?? undefined,
    runId: row.runId ?? undefined,
    agentTaskId: row.agentTaskId ?? undefined,
    triggerRunId: row.triggerRunId ?? undefined,
    title: row.title ?? undefined,
    input: parseJson<Record<string, unknown> | undefined>(row.input, undefined),
    result: parseJson<Record<string, unknown> | undefined>(row.result, undefined),
    error: row.error ?? undefined,
    createdAt: new Date(row.createdAt),
    startedAt: row.startedAt != null ? new Date(row.startedAt) : undefined,
    completedAt: row.completedAt != null ? new Date(row.completedAt) : undefined,
  });
}
