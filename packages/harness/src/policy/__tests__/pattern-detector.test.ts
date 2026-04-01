import { describe, expect, it } from "vitest";
import type { ApprovalRecord } from "../../types";
import { DEFAULT_DETECTION_CONFIG, detectApprovalPatterns } from "../pattern-detector";

function makeApproval(patch: Partial<ApprovalRecord> = {}): ApprovalRecord {
  return {
    id: crypto.randomUUID(),
    runId: "run_001",
    agentId: "agent_001",
    approvalId: crypto.randomUUID(),
    waitTokenId: "wait_001",
    toolName: "googleads_adjust_budget",
    toolInput: { amount: 50 },
    status: "approved",
    createdAt: new Date("2026-03-15T00:00:00Z"),
    resolvedAt: new Date("2026-03-15T00:00:00Z"),
    ...patch,
  };
}

const NOW = new Date("2026-03-31T00:00:00Z");

describe("detectApprovalPatterns", () => {
  it("returns empty when no approvals exist", () => {
    expect(detectApprovalPatterns([], DEFAULT_DETECTION_CONFIG, NOW)).toEqual([]);
  });

  it("returns empty when below minimum decision threshold", () => {
    const approvals = Array.from({ length: 4 }, () => makeApproval());
    expect(detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW)).toEqual([]);
  });

  it("detects approved pattern when 5+ consistent approvals", () => {
    const approvals = Array.from({ length: 6 }, () => makeApproval());
    const patterns = detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].decision).toBe("approved");
    expect(patterns[0].toolName).toBe("googleads_adjust_budget");
    expect(patterns[0].count).toBe(6);
    expect(patterns[0].consistencyRate).toBe(1);
  });

  it("detects rejected pattern when 5+ consistent rejections", () => {
    const approvals = Array.from({ length: 5 }, () => makeApproval({ status: "rejected" }));
    const patterns = detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].decision).toBe("rejected");
    expect(patterns[0].count).toBe(5);
  });

  it("filters out approvals outside the time window", () => {
    const old = Array.from({ length: 5 }, () =>
      makeApproval({
        resolvedAt: new Date("2026-02-01T00:00:00Z"), // > 30 days ago
      }),
    );
    expect(detectApprovalPatterns(old, DEFAULT_DETECTION_CONFIG, NOW)).toEqual([]);
  });

  it("rejects patterns below consistency threshold", () => {
    // 5 approved + 2 rejected = 71% consistency, below 90%
    const approvals = [
      ...Array.from({ length: 5 }, () => makeApproval()),
      ...Array.from({ length: 2 }, () => makeApproval({ status: "rejected" })),
    ];
    expect(detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW)).toEqual([]);
  });

  it("groups by tool name", () => {
    const budgetApprovals = Array.from({ length: 5 }, () => makeApproval());
    const listApprovals = Array.from({ length: 5 }, () =>
      makeApproval({ toolName: "googleads_list_campaigns" }),
    );
    const patterns = detectApprovalPatterns([...budgetApprovals, ...listApprovals], DEFAULT_DETECTION_CONFIG, NOW);

    expect(patterns).toHaveLength(2);
    const toolNames = patterns.map((p) => p.toolName).sort();
    expect(toolNames).toEqual(["googleads_adjust_budget", "googleads_list_campaigns"]);
  });

  it("ignores approvals without resolvedAt", () => {
    const approvals = Array.from({ length: 5 }, () =>
      makeApproval({ resolvedAt: undefined }),
    );
    expect(detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW)).toEqual([]);
  });

  it("ignores pending/blocked/expired statuses", () => {
    const approvals = Array.from({ length: 5 }, () =>
      makeApproval({ status: "pending" }),
    );
    expect(detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW)).toEqual([]);
  });

  it("extracts common conditions from tool inputs", () => {
    const approvals = Array.from({ length: 5 }, (_, i) =>
      makeApproval({ toolInput: { amount: 50 + i * 10 } }),
    );
    const patterns = detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW);

    expect(patterns).toHaveLength(1);
    expect(patterns[0].commonConditions).not.toBeNull();
    // For approved numeric values, should extract lte with max value
    expect(patterns[0].commonConditions?.amount?.operator).toBe("lte");
    expect(patterns[0].commonConditions?.amount?.value).toBe(90); // max of 50,60,70,80,90
  });

  it("respects custom config", () => {
    const approvals = Array.from({ length: 3 }, () => makeApproval());
    const customConfig = { minDecisions: 3, consistencyThreshold: 0.8, windowDays: 30 };
    const patterns = detectApprovalPatterns(approvals, customConfig, NOW);

    expect(patterns).toHaveLength(1);
  });

  it("collects source approval IDs", () => {
    const approvals = Array.from({ length: 5 }, (_, i) =>
      makeApproval({ id: `approval_${i}` }),
    );
    const patterns = detectApprovalPatterns(approvals, DEFAULT_DETECTION_CONFIG, NOW);

    expect(patterns[0].sourceApprovalIds).toEqual(
      Array.from({ length: 5 }, (_, i) => `approval_${i}`),
    );
  });
});
