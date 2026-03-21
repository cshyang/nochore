import type { PolicyRule } from "../../types/policy";

/** Default cooldown window: 24 hours in milliseconds. */
const COOLDOWN_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Cooldown Rule — enforces a minimum wait between same-type actions on the
 * same target.
 *
 * Scans `context.recentActions` for events where:
 *   1. Same action type (event.data.action === proposal.action)
 *   2. Same target (if the proposal specifies one)
 *   3. Within the 24-hour cooldown window
 *
 * If any match → blocked. Otherwise → approved.
 */
export const cooldownRule: PolicyRule = {
  id: "cooldown",
  name: "Action Cooldown",
  description: "Enforces minimum time between same-type actions on the same target",
  priority: 20,
  evaluate(proposal, context) {
    const cutoff = new Date(context.currentTime.getTime() - COOLDOWN_WINDOW_MS);
    const proposalTarget = proposal.args.target as string | undefined;

    const conflict = context.recentActions.some((event) => {
      // Must be same action type
      if (event.data.action !== proposal.action) return false;

      // Must be within cooldown window
      if (event.timestamp < cutoff) return false;

      // If proposal has a target, event must match
      if (proposalTarget !== undefined) {
        const eventTarget = event.data.target as string | undefined;
        if (eventTarget !== proposalTarget) return false;
      }

      return true;
    });

    if (conflict) {
      return {
        result: "blocked",
        reason: "Cooldown period active for this action",
      };
    }
    return { result: "approved", reason: "No cooldown conflict" };
  },
};
