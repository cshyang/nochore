import { asc, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { workItems } from "../db/schema";
import { type WorkItemRecord, type WorkItemStatus, WorkItemStatusSchema } from "../types";

type Db = HarnessDb;

export interface CreateWorkItemInput {
  parentRunId: string;
  rootRunId: string;
  agentId: string;
  kind?: string;
  role: string;
  title: string;
}

export class WorkItemRepository {
  constructor(private db: Db) {}

  async create(input: CreateWorkItemInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(workItems)
      .values({
        id,
        parentRunId: input.parentRunId,
        rootRunId: input.rootRunId,
        agentId: input.agentId,
        kind: input.kind ?? "worker_run",
        role: input.role,
        title: input.title,
        status: "queued",
        createdAt: Date.now(),
      })
      .run();
    return id;
  }

  async markRunning(id: string, triggerTaskRunId?: string): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "running",
        startedAt: Date.now(),
        ...(triggerTaskRunId ? { triggerTaskRunId } : {}),
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async markWaitingForApproval(id: string): Promise<void> {
    this.db
      .update(workItems)
      .set({ status: "waiting_for_approval", blockingReason: "approval" })
      .where(eq(workItems.id, id))
      .run();
  }

  async complete(id: string, completedAt: Date, result?: string): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "completed",
        completedAt: completedAt.getTime(),
        result: result ?? null,
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async fail(id: string, completedAt: Date, error: string): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "failed",
        completedAt: completedAt.getTime(),
        error,
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async cancel(id: string, completedAt: Date): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "cancelled",
        completedAt: completedAt.getTime(),
      })
      .where(eq(workItems.id, id))
      .run();
  }

  async getById(id: string): Promise<WorkItemRecord | null> {
    const row = this.db.select().from(workItems).where(eq(workItems.id, id)).get();
    return row ? toWorkItemRecord(row) : null;
  }

  async listByParentRun(parentRunId: string): Promise<WorkItemRecord[]> {
    return this.db
      .select()
      .from(workItems)
      .where(eq(workItems.parentRunId, parentRunId))
      .orderBy(asc(workItems.createdAt))
      .all()
      .map(toWorkItemRecord);
  }

  async listByRootRun(rootRunId: string): Promise<WorkItemRecord[]> {
    return this.db
      .select()
      .from(workItems)
      .where(eq(workItems.rootRunId, rootRunId))
      .orderBy(asc(workItems.createdAt))
      .all()
      .map(toWorkItemRecord);
  }

  async countByParentRun(parentRunId: string): Promise<number> {
    return this.db
      .select()
      .from(workItems)
      .where(eq(workItems.parentRunId, parentRunId))
      .all().length;
  }
}

function toWorkItemRecord(row: typeof workItems.$inferSelect): WorkItemRecord {
  return {
    id: row.id,
    parentRunId: row.parentRunId,
    rootRunId: row.rootRunId,
    agentId: row.agentId,
    kind: row.kind,
    role: row.role,
    title: row.title,
    status: WorkItemStatusSchema.parse(row.status),
    blockingReason: row.blockingReason as WorkItemRecord["blockingReason"],
    error: row.error ?? undefined,
    result: row.result ?? undefined,
    triggerTaskRunId: row.triggerTaskRunId ?? undefined,
    inputTokens: row.inputTokens ?? undefined,
    outputTokens: row.outputTokens ?? undefined,
    createdAt: new Date(row.createdAt),
    startedAt: row.startedAt != null ? new Date(row.startedAt) : undefined,
    completedAt: row.completedAt != null ? new Date(row.completedAt) : undefined,
  };
}
