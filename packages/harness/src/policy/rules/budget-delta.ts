import type { PolicyRule } from "../../types/policy";

/**
 * Budget Change Limit — limits the percentage a budget can change in one action.
 *
 * Thresholds:
 *   <= 5%   → approved
 *   5–20%   → needs_review
 *   > 20%   → blocked
 *
 * Non-budget actions pass through automatically.
 */
export const budgetDeltaRule: PolicyRule = {
  id: "budget_delta",
  name: "Budget Change Limit",
  description: "Limits the percentage a budget can change in one action",
  priority: 10,
  evaluate(proposal, _context) {
    if (proposal.action !== "adjust_budget") {
      return { result: "approved", reason: "Not a budget action" };
    }
    const deltaPct = Math.abs(proposal.args.deltaPct as number);
    if (deltaPct <= 5) {
      return { result: "approved", reason: "Under 5% threshold" };
    }
    if (deltaPct <= 20) {
      return {
        result: "needs_review",
        reason: `${deltaPct}% change requires approval`,
      };
    }
    return {
      result: "blocked",
      reason: `${deltaPct}% exceeds maximum 20% change`,
    };
  },
};
