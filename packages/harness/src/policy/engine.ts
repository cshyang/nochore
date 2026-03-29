import type { PolicyContext, PolicyDecision, PolicyRequest } from "../types";

export function evaluatePolicy(request: PolicyRequest, context: PolicyContext): PolicyDecision {
  const toolConfig = request.toolConfig;
  const cooldownMinutes = toolConfig?.cooldownMinutes;
  const budgetThreshold = toolConfig?.budgetThreshold;

  if (!toolConfig?.enabled) {
    return {
      result: "blocked",
      reason: "Tool is disabled for this agent",
    };
  }

  if (toolConfig.approvalMode === "blocked") {
    return {
      result: "blocked",
      reason: "Tool is blocked by agent policy",
    };
  }

  if (
    typeof cooldownMinutes === "number" &&
    context.recentToolCalls.some(
      (call) =>
        call.toolName === request.toolName &&
        context.now.getTime() - call.timestamp.getTime() < cooldownMinutes * 60_000,
    )
  ) {
    return {
      result: "blocked",
      reason: `Tool is on cooldown for ${cooldownMinutes} minutes`,
    };
  }

  const budgetValue = extractBudgetLikeValue(request.toolInput);
  if (typeof budgetThreshold === "number" && typeof budgetValue === "number" && budgetValue > budgetThreshold) {
    return {
      result: "approval",
      reason: `Requested value exceeds budget threshold of ${budgetThreshold}`,
    };
  }

  if (context.globalApprovalRequired && toolConfig.mode === "write") {
    return {
      result: "approval",
      reason: "Global approval is required for write actions",
    };
  }

  return {
    result: toolConfig.approvalMode,
    reason:
      toolConfig.approvalMode === "auto"
        ? "Tool is auto-approved by configuration"
        : "Tool requires human approval by configuration",
  };
}

function extractBudgetLikeValue(input: Record<string, unknown>): number | undefined {
  const candidates = ["amount", "budget", "percentage"];
  for (const key of candidates) {
    const value = input[key];
    if (typeof value === "number") {
      return value;
    }
  }

  return undefined;
}
