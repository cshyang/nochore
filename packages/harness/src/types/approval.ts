import { z } from "zod";

export const ApprovalStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "blocked",
  "expired",
]);
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
  decisionReason: z.string().optional(),
  createdAt: z.date(),
  resolvedAt: z.date().optional(),
});
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
