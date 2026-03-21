import type { ActionProposal } from "../types/action";
import type { PolicyOverride } from "../types/agent-config";
import type {
  PolicyRule,
  PolicyDecision,
  PolicyContext,
  OperationalConstraint,
} from "../types/policy";

// ---------------------------------------------------------------------------
// PolicyEvalConfig — input configuration for a policy evaluation pass
// ---------------------------------------------------------------------------

export interface PolicyEvalConfig {
  /** Per-action decision overrides (checked first, bypass all rules). */
  policyOverrides: PolicyOverride[];
  /** When true, any "approved" result is upgraded to "needs_review". */
  globalApprovalRequired: boolean;
  /** Operational constraints passed into PolicyContext for rules. */
  operationalConstraints: OperationalConstraint[];
}

// ---------------------------------------------------------------------------
// Severity ranking — used to pick the strictest result
// ---------------------------------------------------------------------------

const SEVERITY: Record<PolicyDecision["result"], number> = {
  approved: 0,
  needs_review: 1,
  blocked: 2,
};

/**
 * Return whichever decision is stricter (higher severity).
 * On equal severity, the first decision wins (preserving earlier reason).
 */
function strictest(a: PolicyDecision, b: PolicyDecision): PolicyDecision {
  return SEVERITY[b.result] > SEVERITY[a.result] ? b : a;
}

// ---------------------------------------------------------------------------
// Override resolution
// ---------------------------------------------------------------------------

const OVERRIDE_RESULT: Record<PolicyOverride["decision"], PolicyDecision["result"]> = {
  always_approve: "approved",
  always_ask: "needs_review",
  always_block: "blocked",
};

/**
 * Check whether any override pattern matches the proposal's action.
 * Returns the corresponding PolicyDecision if matched, or null.
 */
function resolveOverride(
  proposal: ActionProposal,
  overrides: PolicyOverride[],
): PolicyDecision | null {
  for (const override of overrides) {
    if (proposal.action === override.pattern) {
      return {
        result: OVERRIDE_RESULT[override.decision],
        reason: "Per-action override",
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// evaluatePolicy — the main entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate a batch of proposals against a set of policy rules.
 *
 * Pure function. No side effects. No LLM.
 *
 * For each proposal:
 *   1. Check per-action overrides (short-circuit if matched).
 *   2. Build a PolicyContext.
 *   3. Sort rules by priority (ascending — lower = first).
 *   4. Run every rule, tracking the strictest result.
 *   5. If globalApprovalRequired and final result is "approved", upgrade to
 *      "needs_review".
 *   6. Store the final decision keyed by proposal id.
 *
 * @returns A Map from proposal id to its PolicyDecision.
 */
export function evaluatePolicy(
  proposals: ActionProposal[],
  rules: PolicyRule[],
  config: PolicyEvalConfig,
): Map<string, PolicyDecision> {
  const results = new Map<string, PolicyDecision>();

  // Sort rules once (stable sort — lower priority number first)
  const sorted = [...rules].sort((a, b) => a.priority - b.priority);

  for (const proposal of proposals) {
    // 1. Per-action overrides — bypass everything
    const overrideDecision = resolveOverride(proposal, config.policyOverrides);
    if (overrideDecision) {
      results.set(proposal.id, overrideDecision);
      continue;
    }

    // 2. Build PolicyContext
    const context: PolicyContext = {
      recentActions: [],
      operationalConstraints: config.operationalConstraints,
      globalOverrideEnabled: config.globalApprovalRequired,
      currentTime: new Date(),
    };

    // 3–4. Run every rule, tracking strictest
    let decision: PolicyDecision = {
      result: "approved",
      reason: "No rules matched",
    };
    for (const rule of sorted) {
      const ruleDecision = rule.evaluate(proposal, context);
      decision = strictest(decision, ruleDecision);
    }

    // 5. Global approval gate
    if (config.globalApprovalRequired && decision.result === "approved") {
      decision = { result: "needs_review", reason: "Global approval required" };
    }

    results.set(proposal.id, decision);
  }

  return results;
}
