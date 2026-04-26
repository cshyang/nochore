import { z } from "zod";

export const ApprovalStatusSchema = z.enum(["pending", "approved", "rejected", "blocked", "expired"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalRecordSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  approvalId: z.string(),
  waitTokenId: z.string(),
  toolName: z.string(),
  toolInput: z.record(z.string(), z.unknown()),
  status: ApprovalStatusSchema,
  requestReason: z.string().optional(),
  requestEventId: z.string().optional(),
  decisionReason: z.string().optional(),
  taskId: z.string().optional(),
  createdAt: z.date(),
  expiresAt: z.date().optional(),
  resolvedAt: z.date().optional(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
