import { asc, desc, eq } from "drizzle-orm";
import { runEvents } from "../db/schema";
import type { createDb } from "../db/client";
import { RunEventSchema, type RunEvent, type RunEventType } from "../types";

type Db = ReturnType<typeof createDb>;

export interface CreateRunEventInput {
  runId: string;
  agentId: string;
  timestamp: Date;
  type: RunEventType;
  payload: Record<string, unknown>;
}

export class RunEventRepository {
  constructor(private db: Db) {}

  async append(input: CreateRunEventInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db.insert(runEvents).values({
      id,
      runId: input.runId,
      agentId: input.agentId,
      timestamp: input.timestamp.getTime(),
      type: input.type,
      payload: JSON.stringify(input.payload),
    }).run();
    return id;
  }

  async appendMany(inputs: CreateRunEventInput[]): Promise<void> {
    if (inputs.length === 0) return;
    this.db.insert(runEvents).values(
      inputs.map((input) => ({
        id: crypto.randomUUID(),
        runId: input.runId,
        agentId: input.agentId,
        timestamp: input.timestamp.getTime(),
        type: input.type,
        payload: JSON.stringify(input.payload),
      })),
    ).run();
  }

  async listByRun(runId: string): Promise<RunEvent[]> {
    return this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, runId))
      .orderBy(asc(runEvents.timestamp))
      .all()
      .map(toRunEvent);
  }

  async listByAgent(agentId: string, limit?: number): Promise<RunEvent[]> {
    let query = this.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.agentId, agentId))
      .orderBy(desc(runEvents.timestamp));

    if (typeof limit === "number") {
      query = query.limit(limit) as typeof query;
    }

    return query.all().map(toRunEvent);
  }
}

function toRunEvent(row: typeof runEvents.$inferSelect): RunEvent {
  return RunEventSchema.parse({
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    timestamp: new Date(row.timestamp),
    type: row.type,
    payload: JSON.parse(row.payload),
  });
}
