import { eq, desc } from "drizzle-orm";
import { runs } from "../db/schema";
import type { RunResult } from "../types/run";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

/** Input for creating a new run (id is generated). */
export interface CreateRunInput {
  agentId: string;
  triggerType: string;
  startedAt: Date;
}

/** A hydrated run record with Date objects and parsed JSON. */
export interface Run {
  id: string;
  agentId: string;
  triggerType: string;
  startedAt: Date;
  completedAt?: Date;
  result?: RunResult;
}

export class RunRepository {
  constructor(private db: Db) {}

  /**
   * Create a new run. Returns the generated id.
   */
  async create(input: CreateRunInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(runs)
      .values({
        id,
        agentId: input.agentId,
        triggerType: input.triggerType,
        startedAt: input.startedAt.getTime(),
      })
      .run();
    return id;
  }

  /**
   * Get a run by id. Returns null if not found.
   */
  async getById(id: string): Promise<Run | null> {
    const row = this.db.select().from(runs).where(eq(runs.id, id)).get();
    return row ? toRun(row) : null;
  }

  /**
   * Mark a run as completed with a result.
   */
  async complete(
    id: string,
    completedAt: Date,
    result: RunResult
  ): Promise<void> {
    this.db
      .update(runs)
      .set({
        completedAt: completedAt.getTime(),
        result: JSON.stringify(result),
      })
      .where(eq(runs.id, id))
      .run();
  }

  /**
   * Get runs for an agent, ordered by startedAt descending (most recent first).
   */
  async getByAgent(agentId: string, limit?: number): Promise<Run[]> {
    let query = this.db
      .select()
      .from(runs)
      .where(eq(runs.agentId, agentId))
      .orderBy(desc(runs.startedAt));

    if (limit) {
      query = query.limit(limit) as typeof query;
    }

    const rows = query.all();
    return rows.map(toRun);
  }
}

function toRun(row: typeof runs.$inferSelect): Run {
  return {
    id: row.id,
    agentId: row.agentId,
    triggerType: row.triggerType,
    startedAt: new Date(row.startedAt),
    completedAt:
      row.completedAt != null ? new Date(row.completedAt) : undefined,
    result: row.result ? (JSON.parse(row.result) as RunResult) : undefined,
  };
}
