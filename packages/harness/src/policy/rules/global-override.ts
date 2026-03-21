import type { PolicyRule } from "../../types/policy";

/**
 * Global Override Rule — when enabled, every action requires human review.
 *
 * This is the "require approval for everything" switch. It evaluates last
 * (priority 100) so other rules can block first — but if everything else
 * approves and global override is on, the result is upgraded to needs_review.
 */
export const globalOverrideRule: PolicyRule = {
  id: "global_override",
  name: "Global Approval Override",
  description: "Requires human approval for all actions when enabled",
  priority: 100,
  evaluate(_proposal, context) {
    if (context.globalOverrideEnabled) {
      return { result: "needs_review", reason: "Global approval required" };
    }
    return { result: "approved", reason: "No global override" };
  },
};
