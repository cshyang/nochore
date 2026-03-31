import type { LearnedDecision, LearnedPolicyRule, PolicyDecision, ToolConfigEntry } from "../types";

export function resolveDecision(toolConfig: ToolConfigEntry, learnedDecision: LearnedDecision): PolicyDecision {
  if (toolConfig.approvalMode === "blocked") {
    return {
      result: "blocked",
      reason: "Tool is blocked by agent policy",
    };
  }

  switch (learnedDecision) {
    case "auto":
      return {
        result: "auto",
        reason: "Learned rule auto-approves this action based on prior operator decisions",
      };
    case "approval":
      return {
        result: "approval",
        reason: "Learned rule requires approval for this action based on prior operator decisions",
      };
    case "blocked":
      return {
        result: toolConfig.approvalMode === "auto" ? "approval" : "blocked",
        reason:
          toolConfig.approvalMode === "auto"
            ? "Learned rule tightens this action to approval based on prior operator decisions"
            : "Learned rule blocks this action based on prior operator decisions",
      };
  }
}

export function findMatchingLearnedRule(
  toolName: string,
  toolInput: Record<string, unknown>,
  learnedRules: LearnedPolicyRule[] = [],
): LearnedPolicyRule | null {
  const candidates = learnedRules
    .filter((rule) => rule.toolName === toolName)
    .sort((a, b) => getConditionCount(b) - getConditionCount(a));

  for (const rule of candidates) {
    if (!rule.conditions || matchesConditions(toolInput, rule.conditions)) {
      return rule;
    }
  }

  return null;
}

function getConditionCount(rule: LearnedPolicyRule): number {
  return rule.conditions ? Object.keys(rule.conditions).length : 0;
}

function matchesConditions(
  input: Record<string, unknown>,
  conditions: NonNullable<LearnedPolicyRule["conditions"]>,
): boolean {
  return Object.entries(conditions).every(([key, condition]) => {
    const value = input[key];

    switch (condition.operator) {
      case "eq":
        return value === condition.value;
      case "lt":
        return typeof value === "number" && typeof condition.value === "number" && value < condition.value;
      case "gt":
        return typeof value === "number" && typeof condition.value === "number" && value > condition.value;
      case "lte":
        return typeof value === "number" && typeof condition.value === "number" && value <= condition.value;
      case "gte":
        return typeof value === "number" && typeof condition.value === "number" && value >= condition.value;
      case "in":
        return Array.isArray(condition.value) && condition.value.includes(value);
      default:
        return false;
    }
  });
}
