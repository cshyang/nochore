import { eq, and, gte, inArray, asc, desc, or, gt, isNull } from "drizzle-orm";
import { agentEvents, lessons } from "../db/schema";
import type {
  MemoryStore,
  AgentEvent,
  Lesson,
  EventFilter,
  LessonConfidence,
} from "../types/memory";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

/**
 * SQLite-backed implementation of the MemoryStore interface.
 *
 * Handles two layers of agent memory:
 *   Layer 1 — Event log (append-only agent_events table)
 *   Layer 2 — Distilled lessons (lessons table with soft-delete via expiresAt)
 *
 * All Date ↔ integer (ms) and object ↔ JSON string conversions happen here,
 * so callers work with the clean domain types from types/memory.ts.
 */
export class SqliteMemoryStore implements MemoryStore {
  constructor(private db: Db) {}

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  async appendEvent(event: Omit<AgentEvent, "id">): Promise<string> {
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

  async queryEvents(filter: EventFilter): Promise<AgentEvent[]> {
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

  async getRecentEvents(
    agentId: string,
    limit: number = 50
  ): Promise<AgentEvent[]> {
    const rows = this.db
      .select()
      .from(agentEvents)
      .where(eq(agentEvents.agentId, agentId))
      .orderBy(desc(agentEvents.timestamp))
      .limit(limit)
      .all();

    return rows.map(toAgentEvent);
  }

  // -------------------------------------------------------------------------
  // Lessons
  // -------------------------------------------------------------------------

  async getLessons(agentId: string, scope?: string): Promise<Lesson[]> {
    const now = Date.now();
    const conditions = [eq(lessons.agentId, agentId)];

    if (scope) {
      conditions.push(eq(lessons.scope, scope));
    }

    // Active = expiresAt is null OR expiresAt > now
    conditions.push(or(isNull(lessons.expiresAt), gt(lessons.expiresAt, now))!);

    const rows = this.db
      .select()
      .from(lessons)
      .where(and(...conditions))
      .all();

    return rows.map(toLesson);
  }

  async saveLessons(inputs: Omit<Lesson, "id">[]): Promise<void> {
    if (inputs.length === 0) return;

    const values = inputs.map((input) => ({
      id: crypto.randomUUID(),
      agentId: input.agentId,
      content: input.content,
      scope: input.scope,
      confidence: input.confidence,
      sourceEventIds: JSON.stringify(input.sourceEventIds),
      createdAt: input.createdAt.getTime(),
      expiresAt: input.expiresAt ? input.expiresAt.getTime() : null,
    }));

    this.db.insert(lessons).values(values).run();
  }

  async expireLesson(lessonId: string): Promise<void> {
    this.db
      .update(lessons)
      .set({ expiresAt: Date.now() })
      .where(eq(lessons.id, lessonId))
      .run();
  }
}

// ---------------------------------------------------------------------------
// Row → domain type converters
// ---------------------------------------------------------------------------

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

function toLesson(row: typeof lessons.$inferSelect): Lesson {
  return {
    id: row.id,
    agentId: row.agentId,
    content: row.content,
    scope: row.scope,
    confidence: row.confidence as LessonConfidence,
    sourceEventIds: JSON.parse(row.sourceEventIds) as string[],
    createdAt: new Date(row.createdAt),
    expiresAt: row.expiresAt != null ? new Date(row.expiresAt) : undefined,
  };
}
