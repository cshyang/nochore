import { z } from "zod";

export const LearnedDecisionSchema = z.enum(["auto", "approval", "blocked"]);
export type LearnedDecision = z.infer<typeof LearnedDecisionSchema>;

export const LearnedRuleStatusSchema = z.enum(["suggested", "accepted", "revoked", "expired", "dismissed"]);
export type LearnedRuleStatus = z.infer<typeof LearnedRuleStatusSchema>;

export const LearnedRuleConditionOperatorSchema = z.enum(["eq", "lt", "gt", "lte", "gte", "in"]);
export type LearnedRuleConditionOperator = z.infer<typeof LearnedRuleConditionOperatorSchema>;

export const LearnedRuleConditionSchema = z.object({
  operator: LearnedRuleConditionOperatorSchema,
  value: z.unknown(),
});
export type LearnedRuleCondition = z.infer<typeof LearnedRuleConditionSchema>;

export const LearnedRuleConditionsSchema = z.record(z.string(), LearnedRuleConditionSchema);
export type LearnedRuleConditions = z.infer<typeof LearnedRuleConditionsSchema>;

export const LearnedPolicyRuleSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  toolName: z.string(),
  learnedDecision: LearnedDecisionSchema,
  conditions: LearnedRuleConditionsSchema.nullable(),
  evidenceCount: z.number().int().nonnegative(),
  consistencyRate: z.number().min(0).max(1),
  status: LearnedRuleStatusSchema,
  suggestedAt: z.date(),
  acceptedAt: z.date().optional(),
  revokedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  userNote: z.string().optional(),
  sourceApprovalIds: z.array(z.string()),
});
export type LearnedPolicyRule = z.infer<typeof LearnedPolicyRuleSchema>;

export const SuggestionSuppressionSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  toolName: z.string(),
  suppressedAt: z.date(),
});
export type SuggestionSuppression = z.infer<typeof SuggestionSuppressionSchema>;
