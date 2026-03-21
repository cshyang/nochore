import { eq, and, gte, inArray, asc } from "drizzle-orm";
import { agentEvents } from "../db/schema";
import type { AgentEvent, EventFilter } from "../types/memory";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

export class EventRepository {
  constructor(private db: Db) {}

  /**
   * Append an event, generating an id. Returns the generated id.
   */
  async append(event: Omit<AgentEvent, "id">): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(agentEvents)
      .values({
        id,
        runId: event.runId,
        agentId: event.agentId,
        timestamp: event.timestamp.getTime(),
        type: event.type,
        data: JSON.stringify(event.data),
      })
      .run();
    return id;
  }

  /**
   * Query events matching the given filter. Results ordered by timestamp ASC.
   */
  async query(filter: EventFilter): Promise<AgentEvent[]> {
    const conditions = [];

    if (filter.agentId) {
      conditions.push(eq(agentEvents.agentId, filter.agentId));
    }
    if (filter.runId) {
      conditions.push(eq(agentEvents.runId, filter.runId));
    }
    if (filter.type) {
      if (Array.isArray(filter.type)) {
        conditions.push(inArray(agentEvents.type, filter.type));
      } else {
        conditions.push(eq(agentEvents.type, filter.type));
      }
    }
    if (filter.since) {
      conditions.push(gte(agentEvents.timestamp, filter.since.getTime()));
    }

    let query = this.db
      .select()
      .from(agentEvents)
      .orderBy(asc(agentEvents.timestamp));

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as typeof query;
    }

    if (filter.limit) {
      query = query.limit(filter.limit) as typeof query;
    }

    const rows = query.all();
    return rows.map(toAgentEvent);
  }
}

function toAgentEvent(row: typeof agentEvents.$inferSelect): AgentEvent {
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    timestamp: new Date(row.timestamp),
    type: row.type as AgentEvent["type"],
    data: JSON.parse(row.data) as Record<string, unknown>,
  };
}
