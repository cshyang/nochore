import { desc, eq } from "drizzle-orm";
import type { createDb } from "../db/client";
import { runs } from "../db/schema";
import {
  type RunRecord,
  type RunStatus,
  RunStatusSchema,
  type RunSummary,
  RunSummarySchema,
  type RunTriggerType,
} from "../types";

type Db = ReturnType<typeof createDb>;

export interface CreateRunInput {
  id?: string;
  agentId: string;
  triggerType: RunTriggerType;
  startedAt: Date;
  status?: RunStatus;
  triggerRunId?: string;
}

export class RunRepository {
  constructor(private db: Db) {}

  async create(input: CreateRunInput): Promise<string> {
    const id = input.id ?? crypto.randomUUID();
    this.db
      .insert(runs)
      .values({
        id,
        agentId: input.agentId,
        triggerType: input.triggerType,
        status: input.status ?? "queued",
        startedAt: input.startedAt.getTime(),
        triggerRunId: input.triggerRunId ?? null,
      })
      .run();
    return id;
  }

  async setTriggerRunId(id: string, triggerRunId: string): Promise<void> {
    this.db.update(runs).set({ triggerRunId }).where(eq(runs.id, id)).run();
  }

  async markRunning(id: string): Promise<void> {
    this.db.update(runs).set({ status: "running", error: null }).where(eq(runs.id, id)).run();
  }

  async markWaitingForApproval(id: string): Promise<void> {
    this.db.update(runs).set({ status: "waiting_for_approval" }).where(eq(runs.id, id)).run();
  }

  async complete(id: string, completedAt: Date, summary: RunSummary): Promise<void> {
    this.db
      .update(runs)
      .set({
        status: "completed",
        completedAt: completedAt.getTime(),
        error: null,
        summary: JSON.stringify(RunSummarySchema.parse(summary)),
      })
      .where(eq(runs.id, id))
      .run();
  }

  async fail(id: string, completedAt: Date, error: string, summary?: RunSummary): Promise<void> {
    this.db
      .update(runs)
      .set({
        status: "failed",
        completedAt: completedAt.getTime(),
        error,
        summary: summary ? JSON.stringify(RunSummarySchema.parse(summary)) : null,
      })
      .where(eq(runs.id, id))
      .run();
  }

  async getById(id: string): Promise<RunRecord | null> {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    return row ? toRunRecord(row) : null;
  }

  async getByAgent(agentId: string, limit?: number): Promise<RunRecord[]> {
    let query = this.db.select().from(runs).where(eq(runs.agentId, agentId)).orderBy(desc(runs.startedAt));

    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }

    return query.all().map(toRunRecord);
  }
}

function toRunRecord(row: typeof runs.$inferSelect): RunRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    triggerType: row.triggerType as RunRecord["triggerType"],
    status: RunStatusSchema.parse(row.status),
    startedAt: new Date(row.startedAt),
    completedAt: row.completedAt != null ? new Date(row.completedAt) : undefined,
    error: row.error ?? undefined,
    summary: row.summary ? RunSummarySchema.parse(JSON.parse(row.summary)) : undefined,
    triggerRunId: row.triggerRunId ?? undefined,
  };
}
