import { z } from "zod";
import type { ActionProposal } from "./action";
import type { AgentEvent } from "./memory";

// ---------------------------------------------------------------------------
// PolicyDecision — the outcome of evaluating a proposal against a policy
// ---------------------------------------------------------------------------

export const PolicyDecisionSchema = z.object({
  /** The decision result */
  result: z.enum(["approved", "needs_review", "blocked"]),
  /** Human-readable explanation for the decision */
  reason: z.string().min(1),
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

// ---------------------------------------------------------------------------
// OperationalConstraint — runtime constraints on agent behavior
// ---------------------------------------------------------------------------

export const OperationalConstraintSchema = z.object({
  /** Constraint type */
  type: z.enum(["active_hours", "daily_limit", "freeze_period"]),
  /** Constraint-specific configuration */
  config: z.record(z.string(), z.unknown()),
});

export type OperationalConstraint = z.infer<typeof OperationalConstraintSchema>;

// ---------------------------------------------------------------------------
// PolicyContext — context available to policy rules during evaluation
// ---------------------------------------------------------------------------

export interface PolicyContext {
  /** Recent actions taken by the agent (from memory) */
  recentActions: AgentEvent[];
  /** Active operational constraints */
  operationalConstraints: OperationalConstraint[];
  /** Whether global override mode is enabled (bypasses non-critical policies) */
  globalOverrideEnabled: boolean;
  /** Current evaluation time */
  currentTime: Date;
}

// ---------------------------------------------------------------------------
// PolicyRule — a single policy rule that evaluates proposals
// ---------------------------------------------------------------------------

export const PolicyRuleSchema = z.object({
  /** Unique rule identifier */
  id: z.string().min(1),
  /** Human-readable rule name */
  name: z.string().min(1),
  /** What this rule checks */
  description: z.string().min(1),
  /** Evaluation priority — lower numbers are evaluated first */
  priority: z.number().int().min(0),
});

export type PolicyRuleData = z.infer<typeof PolicyRuleSchema>;

/**
 * Full PolicyRule interface — includes the evaluate function which cannot
 * be expressed as a Zod schema. Use PolicyRuleSchema for serialization
 * and this interface for implementation.
 */
export interface PolicyRule extends PolicyRuleData {
  evaluate(proposal: ActionProposal, context: PolicyContext): PolicyDecision;
}
