import type { ApprovalRecord, LearnedRuleConditions } from "../types";

export function extractConditions(
  approvals: ApprovalRecord[],
  decision: "approved" | "rejected",
): LearnedRuleConditions | null {
  if (approvals.length === 0) return null;

  const candidateKeys = collectCandidateKeys(approvals);
  const conditions: LearnedRuleConditions = {};

  for (const key of candidateKeys) {
    const values = approvals.map((approval) => approval.toolInput[key]);
    if (values.some((value) => value == null)) continue;

    if (values.every((value) => typeof value === "number")) {
      const numericValues = values as number[];
      conditions[key] =
        decision === "approved"
          ? { operator: "lte", value: Math.max(...numericValues) }
          : { operator: "gte", value: Math.min(...numericValues) };
      continue;
    }

    if (values.every((value) => typeof value === "string")) {
      const [first] = values as string[];
      if (values.every((value) => value === first)) {
        conditions[key] = { operator: "eq", value: first };
      }
      continue;
    }

    if (values.every((value) => typeof value === "boolean")) {
      const [first] = values as boolean[];
      if (values.every((value) => value === first)) {
        conditions[key] = { operator: "eq", value: first };
      }
    }
  }

  return Object.keys(conditions).length > 0 ? conditions : null;
}

function collectCandidateKeys(approvals: ApprovalRecord[]): string[] {
  const keys = new Set<string>();
  for (const approval of approvals) {
    for (const [key, value] of Object.entries(approval.toolInput)) {
      if (isPrimitive(value)) {
        keys.add(key);
      }
    }
  }

  return [...keys];
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}
