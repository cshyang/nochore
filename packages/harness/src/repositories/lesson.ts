import { and, eq, gt, isNull, or } from "drizzle-orm";
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
  sourceRunEventIds: string[];
  createdAt: Date;
  expiresAt?: Date;
}

export interface CreateLessonInput {
  agentId: string;
  content: string;
  scope: string;
  confidence: LessonConfidence;
  sourceRunEventIds: string[];
  createdAt: Date;
  expiresAt?: Date;
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
        sourceRunEventIds: JSON.stringify(input.sourceRunEventIds),
        createdAt: input.createdAt.getTime(),
        expiresAt: input.expiresAt?.getTime() ?? null,
      })
      .run();
    return id;
  }

  async listByAgent(agentId: string): Promise<LessonRecord[]> {
    const now = Date.now();
    return this.db
      .select()
      .from(lessons)
      .where(and(eq(lessons.agentId, agentId), or(isNull(lessons.expiresAt), gt(lessons.expiresAt, now))))
      .all()
      .map((row: typeof lessons.$inferSelect) => ({
        id: row.id,
        agentId: row.agentId,
        content: row.content,
        scope: row.scope,
        confidence: row.confidence as LessonConfidence,
        sourceRunEventIds: JSON.parse(row.sourceRunEventIds) as string[],
        createdAt: new Date(row.createdAt),
        expiresAt: row.expiresAt != null ? new Date(row.expiresAt) : undefined,
      }));
  }
}
