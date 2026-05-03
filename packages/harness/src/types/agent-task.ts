import { z } from "zod";

export const AgentTaskStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_external",
  "stopped",
  "completed",
  "failed",
  "cancelled",
]);
export type AgentTaskStatus = z.infer<typeof AgentTaskStatusSchema>;

export const AgentTaskBlockingReasonSchema = z.enum(["approval", "dependency", "external", "policy"]);
export type AgentTaskBlockingReason = z.infer<typeof AgentTaskBlockingReasonSchema>;

export const AgentTaskRecordSchema = z.object({
  id: z.string(),
  parentRunId: z.string(),
  rootRunId: z.string(),
  agentId: z.string(),
  kind: z.string(),
  role: z.string(),
  title: z.string(),
  status: AgentTaskStatusSchema,
  blockingReason: AgentTaskBlockingReasonSchema.optional(),
  error: z.string().optional(),
  result: z.string().optional(),
  triggerTaskRunId: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});
export type AgentTaskRecord = z.infer<typeof AgentTaskRecordSchema>;
