import { z } from "zod";

// ---------------------------------------------------------------------------
// Run status & trigger
// ---------------------------------------------------------------------------

export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_tasks",
  "stopped",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunTriggerTypeSchema = z.enum(["cron", "manual", "chat", "webhook"]);
export type RunTriggerType = z.infer<typeof RunTriggerTypeSchema>;

export const RunTriggerSchema = z.object({
  type: RunTriggerTypeSchema,
  timestamp: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type RunTrigger = z.infer<typeof RunTriggerSchema>;

// ---------------------------------------------------------------------------
// Run summary (stored as JSON in runs.summary)
// ---------------------------------------------------------------------------

export const RunSummarySchema = z.object({
  status: z.enum(["completed", "failed"]),
  headline: z.string(),
  details: z.array(z.string()),
  finalText: z.string().optional(),
});
export type RunSummary = z.infer<typeof RunSummarySchema>;

// ---------------------------------------------------------------------------
// Run record (hydrated from DB row)
// ---------------------------------------------------------------------------

export interface RunRecord {
  id: string;
  agentId: string;
  triggerType: RunTriggerType;
  status: RunStatus;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  summary?: RunSummary;
  triggerRunId?: string;
}

// ---------------------------------------------------------------------------
// Run events
// ---------------------------------------------------------------------------

export const RunEventTypeSchema = z.enum([
  "run_started",
  "prompt_built",
  "tool_called",
  "tool_approval_requested",
  "tool_approval_resolved",
  "tool_approval_expired",
  "policy_rule_suggested",
  "policy_rule_accepted",
  "tool_executed",
  "agent_message",
  "finding_recorded",
  "notification_sent",
  "lesson_distilled",
  "task_started",
  "task_completed",
  "metric_observed",
  "run_completed",
  "run_stopped",
  "run_cancelled",
  "run_failed",
]);
export type RunEventType = z.infer<typeof RunEventTypeSchema>;

export const RunEventSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  timestamp: z.date(),
  type: RunEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
});
export type RunEvent = z.infer<typeof RunEventSchema>;

// ---------------------------------------------------------------------------
// Metric observations (emitted by agents during runs)
// ---------------------------------------------------------------------------

export const MetricObservationSchema = z.object({
  name: z.string(),
  value: z.number(),
  unit: z.string().optional(),
  window: z.string().optional(),
  scope: z.string().optional(),
  source: z.string().optional(),
  observedAt: z.string(),
  comparabilityKey: z.string(),
});
export type MetricObservation = z.infer<typeof MetricObservationSchema>;
