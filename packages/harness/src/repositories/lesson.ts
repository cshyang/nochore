import { eq, and, or, gt, isNull } from "drizzle-orm";
import { lessons } from "../db/schema";
import type { Lesson, LessonConfidence } from "../types/memory";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

/** Fields accepted when creating a lesson (id is generated). */
export type CreateLessonInput = Omit<Lesson, "id">;

/** Fields that can be updated on an existing lesson. */
export type UpdateLessonInput = Partial<
  Pick<Lesson, "content" | "confidence" | "scope" | "expiresAt">
>;

export class LessonRepository {
  constructor(private db: Db) {}

  /**
   * Create a lesson, generating an id. Returns the generated id.
   */
  async create(input: CreateLessonInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(lessons)
      .values({
        id,
        agentId: input.agentId,
        content: input.content,
        scope: input.scope,
        confidence: input.confidence,
        sourceEventIds: JSON.stringify(input.sourceEventIds),
        createdAt: input.createdAt.getTime(),
        expiresAt: input.expiresAt ? input.expiresAt.getTime() : null,
      })
      .run();
    return id;
  }

  /**
   * Get a lesson by id. Returns null if not found.
   */
  async getById(id: string): Promise<Lesson | null> {
    const row = this.db
      .select()
      .from(lessons)
      .where(eq(lessons.id, id))
      .get();
    return row ? toLesson(row) : null;
  }

  /**
   * Update fields on an existing lesson.
   */
  async update(id: string, updates: UpdateLessonInput): Promise<void> {
    const values: Record<string, unknown> = {};
    if (updates.content !== undefined) values.content = updates.content;
    if (updates.confidence !== undefined) values.confidence = updates.confidence;
    if (updates.scope !== undefined) values.scope = updates.scope;
    if (updates.expiresAt !== undefined)
      values.expiresAt = updates.expiresAt ? updates.expiresAt.getTime() : null;

    if (Object.keys(values).length > 0) {
      this.db
        .update(lessons)
        .set(values)
        .where(eq(lessons.id, id))
        .run();
    }
  }

  /**
   * Delete a lesson by id.
   */
  async delete(id: string): Promise<void> {
    this.db.delete(lessons).where(eq(lessons.id, id)).run();
  }

  /**
   * Get active (non-expired) lessons for an agent, optionally filtered by scope.
   * Excludes lessons where expiresAt is not null AND expiresAt < now.
   */
  async getActive(agentId: string, scope?: string): Promise<Lesson[]> {
    const now = Date.now();

    const conditions = [eq(lessons.agentId, agentId)];

    if (scope) {
      conditions.push(eq(lessons.scope, scope));
    }

    // Active = expiresAt is null OR expiresAt >= now
    conditions.push(or(isNull(lessons.expiresAt), gt(lessons.expiresAt, now))!);

    const rows = this.db
      .select()
      .from(lessons)
      .where(and(...conditions))
      .all();

    return rows.map(toLesson);
  }
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
