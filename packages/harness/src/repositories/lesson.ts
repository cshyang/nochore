import { and, desc, eq, gt, isNull, or } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { lessons } from "../db/schema";

type Db = HarnessDb;

export type LessonConfidence = "high" | "medium" | "low";

export interface LessonRecord {
  id: string;
  agentId: string;
  content: string;
  scope: string;
  confidence: LessonConfidence;
  sourceEventIds: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface CreateLessonInput {
  agentId: string;
  content: string;
  scope: string;
  confidence: LessonConfidence;
  sourceEventIds: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export function isEpisodicLessonScope(scope: string): boolean {
  return scope.startsWith("episode:");
}

export function isDurableLessonScope(scope: string): boolean {
  return !isEpisodicLessonScope(scope);
}

export class LessonRepository {
  constructor(private db: Db) {}

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
        expiresAt: input.expiresAt?.getTime() ?? null,
      })
      .run();
    return id;
  }

  async listByAgent(agentId: string): Promise<LessonRecord[]> {
    return this.listInternal(agentId);
  }

  async listDurableByAgent(agentId: string): Promise<LessonRecord[]> {
    return (await this.listInternal(agentId)).filter((lesson) => isDurableLessonScope(lesson.scope));
  }

  async listEpisodicByAgent(agentId: string, limit = 3): Promise<LessonRecord[]> {
    return (await this.listInternal(agentId))
      .filter((lesson) => isEpisodicLessonScope(lesson.scope))
      .slice(0, limit);
  }

  private async listInternal(agentId: string): Promise<LessonRecord[]> {
    const now = Date.now();
    return this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.agentId, agentId), or(isNull(lessons.expiresAt), gt(lessons.expiresAt, now))))
      .orderBy(desc(lessons.createdAt))
      .all()
      .map((row: typeof lessons.$inferSelect) => ({
        id: row.id,
        agentId: row.agentId,
        content: row.content,
        scope: row.scope,
        confidence: row.confidence as LessonConfidence,
        sourceEventIds: JSON.parse(row.sourceEventIds) as string[],
        createdAt: new Date(row.createdAt),
        expiresAt: row.expiresAt != null ? new Date(row.expiresAt) : undefined,
      }));
  }
}
