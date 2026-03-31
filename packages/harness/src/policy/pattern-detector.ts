import type { ApprovalRecord, LearnedRuleConditions } from "../types";
import { extractConditions } from "./condition-extractor";

export interface DetectionConfig {
  minDecisions: number;
  consistencyThreshold: number;
  windowDays: number;
}

export interface ApprovalPattern {
  agentId: string;
  toolName: string;
  decision: "approved" | "rejected";
  count: number;
  consistencyRate: number;
  windowDays: number;
  commonConditions: LearnedRuleConditions | null;
  sourceApprovalIds: string[];
}

export const DEFAULT_DETECTION_CONFIG: DetectionConfig = {
  minDecisions: 5,
  consistencyThreshold: 0.9,
  windowDays: 30,
};

export function detectApprovalPatterns(
  approvals: ApprovalRecord[],
  config: DetectionConfig,
  now: Date = new Date(),
): ApprovalPattern[] {
  const windowStart = now.getTime() - config.windowDays * 24 * 60 * 60 * 1000;
  const relevantApprovals = approvals.filter(
    (approval) =>
      approval.resolvedAt &&
      approval.resolvedAt.getTime() >= windowStart &&
      (approval.status === "approved" || approval.status === "rejected"),
  );

  const byTool = groupBy(relevantApprovals, (approval) => approval.toolName);
  const patterns: ApprovalPattern[] = [];

  for (const [toolName, toolApprovals] of byTool.entries()) {
    const approved = toolApprovals.filter((approval) => approval.status === "approved");
    const rejected = toolApprovals.filter((approval) => approval.status === "rejected");
    const dominant =
      approved.length >= rejected.length
        ? { decision: "approved" as const, approvals: approved }
        : { decision: "rejected" as const, approvals: rejected };

    if (dominant.approvals.length < config.minDecisions) continue;

    const consistencyRate = dominant.approvals.length / toolApprovals.length;
    if (consistencyRate < config.consistencyThreshold) continue;

    patterns.push({
      agentId: dominant.approvals[0]?.agentId ?? "",
      toolName,
      decision: dominant.decision,
      count: dominant.approvals.length,
      consistencyRate,
      windowDays: config.windowDays,
      commonConditions: extractConditions(dominant.approvals, dominant.decision),
      sourceApprovalIds: dominant.approvals.map((approval) => approval.id),
    });
  }

  return patterns;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, [...(map.get(key) ?? []), item]);
  }
  return map;
}
