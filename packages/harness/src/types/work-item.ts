import { z } from "zod";

export const WorkItemStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_external",
  "completed",
  "failed",
  "cancelled",
]);
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

export const WorkItemBlockingReasonSchema = z.enum(["approval", "dependency", "external", "policy"]);
export type WorkItemBlockingReason = z.infer<typeof WorkItemBlockingReasonSchema>;

export const WorkItemRecordSchema = z.object({
  id: z.string(),
  parentRunId: z.string(),
  rootRunId: z.string(),
  agentId: z.string(),
  kind: z.string(),
  role: z.string(),
  title: z.string(),
  status: WorkItemStatusSchema,
  blockingReason: WorkItemBlockingReasonSchema.optional(),
  error: z.string().optional(),
  result: z.string().optional(),
  triggerTaskRunId: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});
export type WorkItemRecord = z.infer<typeof WorkItemRecordSchema>;
