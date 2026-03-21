import type { PolicyRule, PolicyContext, PolicyDecision, OperationalConstraint } from "../../types/policy";
import type { ActionProposal } from "../../types/action";

/**
 * Check whether `currentTime` falls within the active hours window on an
 * allowed day of the week.
 */
function checkActiveHours(
  constraint: OperationalConstraint,
  currentTime: Date,
): PolicyDecision | null {
  const { startHour, endHour, daysOfWeek } = constraint.config as {
    startHour: number;
    endHour: number;
    daysOfWeek: number[];
  };

  const hour = currentTime.getUTCHours();
  const day = currentTime.getUTCDay();

  if (!daysOfWeek.includes(day) || hour < startHour || hour >= endHour) {
    return {
      result: "blocked",
      reason: "Outside active hours",
    };
  }
  return null;
}

/**
 * Count today's `action_executed` events and compare against the daily cap.
 */
function checkDailyLimit(
  constraint: OperationalConstraint,
  context: PolicyContext,
): PolicyDecision | null {
  const { maxActionsPerDay } = constraint.config as { maxActionsPerDay: number };

  // Count actions that share the same UTC date as currentTime
  const todayStr = context.currentTime.toISOString().slice(0, 10);
  const todayCount = context.recentActions.filter((event) => {
    if (event.type !== "action_executed") return false;
    return event.timestamp.toISOString().slice(0, 10) === todayStr;
  }).length;

  if (todayCount >= maxActionsPerDay) {
    return {
      result: "blocked",
      reason: `Daily action limit reached (${todayCount}/${maxActionsPerDay})`,
    };
  }
  return null;
}

/**
 * Check whether `currentTime` falls within a freeze period.
 */
function checkFreezePeriod(
  constraint: OperationalConstraint,
  currentTime: Date,
): PolicyDecision | null {
  const { start, end } = constraint.config as { start: string; end: string };
  const freezeStart = new Date(start);
  const freezeEnd = new Date(end);

  if (currentTime >= freezeStart && currentTime <= freezeEnd) {
    return {
      result: "blocked",
      reason: "Freeze period active",
    };
  }
  return null;
}

/**
 * Operational Rule — enforces time-based and rate-based constraints.
 *
 * Constraint types:
 *   - `active_hours`: blocks outside configured hours/days
 *   - `daily_limit`: blocks after N actions in the same UTC day
 *   - `freeze_period`: blocks during configured ISO date range
 *
 * Any single violation → blocked. All pass → approved.
 */
export const operationalRule: PolicyRule = {
  id: "operational",
  name: "Operational Constraints",
  description: "Enforces active hours, daily limits, and freeze periods",
  priority: 5,
  evaluate(_proposal: ActionProposal, context: PolicyContext): PolicyDecision {
    for (const constraint of context.operationalConstraints) {
      let violation: PolicyDecision | null = null;

      switch (constraint.type) {
        case "active_hours":
          violation = checkActiveHours(constraint, context.currentTime);
          break;
        case "daily_limit":
          violation = checkDailyLimit(constraint, context);
          break;
        case "freeze_period":
          violation = checkFreezePeriod(constraint, context.currentTime);
          break;
      }

      if (violation) return violation;
    }

    return { result: "approved", reason: "All operational constraints satisfied" };
  },
};
