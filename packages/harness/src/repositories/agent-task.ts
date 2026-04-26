import { asc, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { agentTasks } from "../db/schema";
import { type AgentTaskRecord, AgentTaskStatusSchema } from "../types";

type Db = HarnessDb;

export interface CreateAgentTaskInput {
  parentRunId: string;
  rootRunId: string;
  agentId: string;
  kind?: string;
  role: string;
  title: string;
}

export class AgentTaskRepository {
  constructor(private db: Db) {}

  async create(input: CreateAgentTaskInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(agentTasks)
      .values({
        id,
        parentRunId: input.parentRunId,
        rootRunId: input.rootRunId,
        agentId: input.agentId,
        kind: input.kind ?? "agent_task_run",
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
      .update(agentTasks)
      .set({
        status: "running",
        startedAt: Date.now(),
        blockingReason: null,
        ...(triggerTaskRunId ? { triggerTaskRunId } : {}),
      })
      .where(eq(agentTasks.id, id))
      .run();
  }

  async markWaitingForApproval(id: string): Promise<void> {
    this.db
      .update(agentTasks)
      .set({ status: "waiting_for_approval", blockingReason: "approval" })
      .where(eq(agentTasks.id, id))
      .run();
  }

  async complete(
    id: string,
    completedAt: Date,
    result?: string,
    tokens?: { inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    this.db
      .update(agentTasks)
      .set({
        status: "completed",
        completedAt: completedAt.getTime(),
        blockingReason: null,
        result: result ?? null,
        ...(tokens?.inputTokens != null ? { inputTokens: tokens.inputTokens } : {}),
        ...(tokens?.outputTokens != null ? { outputTokens: tokens.outputTokens } : {}),
      })
      .where(eq(agentTasks.id, id))
      .run();
  }

  async fail(id: string, completedAt: Date, error: string): Promise<void> {
    this.db
      .update(agentTasks)
      .set({
        status: "failed",
        completedAt: completedAt.getTime(),
        blockingReason: null,
        error,
      })
      .where(eq(agentTasks.id, id))
      .run();
  }

  async stop(id: string, completedAt: Date, error: string): Promise<void> {
    this.db
      .update(agentTasks)
      .set({
        status: "stopped",
        completedAt: completedAt.getTime(),
        blockingReason: null,
        error,
      })
      .where(eq(agentTasks.id, id))
      .run();
  }

  async cancel(id: string, completedAt: Date): Promise<void> {
    this.db
      .update(agentTasks)
      .set({
        status: "cancelled",
        completedAt: completedAt.getTime(),
        blockingReason: null,
      })
      .where(eq(agentTasks.id, id))
      .run();
  }

  async getById(id: string): Promise<AgentTaskRecord | null> {
    const row = this.db.select().from(agentTasks).where(eq(agentTasks.id, id)).get();
    return row ? toAgentTaskRecord(row) : null;
  }

  async listByParentRun(parentRunId: string): Promise<AgentTaskRecord[]> {
    return this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.parentRunId, parentRunId))
      .orderBy(asc(agentTasks.createdAt))
      .all()
      .map(toAgentTaskRecord);
  }

  async listByRootRun(rootRunId: string): Promise<AgentTaskRecord[]> {
    return this.db
      .select()
      .from(agentTasks)
      .where(eq(agentTasks.rootRunId, rootRunId))
      .orderBy(asc(agentTasks.createdAt))
      .all()
      .map(toAgentTaskRecord);
  }

  async countByParentRun(parentRunId: string): Promise<number> {
    return this.db.select().from(agentTasks).where(eq(agentTasks.parentRunId, parentRunId)).all().length;
  }
}

function toAgentTaskRecord(row: typeof agentTasks.$inferSelect): AgentTaskRecord {
  return {
    id: row.id,
    parentRunId: row.parentRunId,
    rootRunId: row.rootRunId,
    agentId: row.agentId,
    kind: row.kind,
    role: row.role,
    title: row.title,
    status: AgentTaskStatusSchema.parse(row.status),
    blockingReason: (row.blockingReason ?? undefined) as AgentTaskRecord["blockingReason"],
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
