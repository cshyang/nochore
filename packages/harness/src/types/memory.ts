import { z } from "zod";

// ---------------------------------------------------------------------------
// Event types emitted during agent runs
// ---------------------------------------------------------------------------

export const AgentEventTypeEnum = z.enum([
  "run_started",
  "scope_resolved",
  "data_fetched",
  "skill_output",
  "action_proposed",
  "policy_decision",
  "action_executed",
  "user_correction",
  "lesson_distilled",
]);

export type AgentEventType = z.infer<typeof AgentEventTypeEnum>;

export const AgentEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  timestamp: z.date(),
  type: AgentEventTypeEnum,
  data: z.record(z.string(), z.unknown()),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;

// ---------------------------------------------------------------------------
// Lessons — distilled knowledge from agent experience
// ---------------------------------------------------------------------------

export const LessonConfidenceEnum = z.enum(["high", "medium", "low"]);

export type LessonConfidence = z.infer<typeof LessonConfidenceEnum>;

export const LessonSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  content: z.string(),
  scope: z.string(),
  confidence: LessonConfidenceEnum,
  sourceEventIds: z.array(z.string()),
  createdAt: z.date(),
  expiresAt: z.date().optional(),
});

export type Lesson = z.infer<typeof LessonSchema>;

// ---------------------------------------------------------------------------
// EventFilter — query predicate for event retrieval
// ---------------------------------------------------------------------------

export const EventFilterSchema = z.object({
  agentId: z.string().optional(),
  runId: z.string().optional(),
  type: z
    .union([AgentEventTypeEnum, z.array(AgentEventTypeEnum)])
    .optional(),
  since: z.date().optional(),
  limit: z.number().optional(),
});

export type EventFilter = z.infer<typeof EventFilterSchema>;

// ---------------------------------------------------------------------------
// MemoryStore — contract for storage implementations (not a Zod schema)
// ---------------------------------------------------------------------------

export interface MemoryStore {
  /** Append a new event, returning the generated id. */
  appendEvent(event: Omit<AgentEvent, "id">): Promise<string>;

  /** Query events matching the given filter. */
  queryEvents(filter: EventFilter): Promise<AgentEvent[]>;

  /** Get the N most recent events for an agent. */
  getRecentEvents(agentId: string, limit?: number): Promise<AgentEvent[]>;

  /** Retrieve lessons for an agent, optionally scoped. */
  getLessons(agentId: string, scope?: string): Promise<Lesson[]>;

  /** Persist new lessons. */
  saveLessons(lessons: Omit<Lesson, "id">[]): Promise<void>;

  /** Mark a lesson as expired (soft-delete). */
  expireLesson(lessonId: string): Promise<void>;
}
