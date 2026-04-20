import type { ApprovalRecord } from "@nochore/harness";
import { describe, expect, it } from "vitest";
import { deriveActivityVersion, derivePrimaryStatus, isActionableApproval } from "./activity-core";
import { isSyntheticMessageId } from "./chat-memory";

function makeApproval(status: ApprovalRecord["status"]): ApprovalRecord {
  return {
    id: "approval_1",
    runId: "run_1",
    agentId: "agent_1",
    approvalId: "approval_1",
    waitTokenId: "token_1",
    toolName: "tool",
    toolInput: {},
    status,
    createdAt: new Date(),
  };
}

describe("activity projection helpers", () => {
  it("treats pending approvals as actionable", () => {
    expect(isActionableApproval(makeApproval("pending"))).toBe(true);
  });

  it("does not treat expired approvals as actionable", () => {
    expect(isActionableApproval(makeApproval("expired"))).toBe(false);
  });

  it("does not treat resolved approvals as actionable", () => {
    expect(isActionableApproval(makeApproval("approved"))).toBe(false);
    expect(isActionableApproval(makeApproval("rejected"))).toBe(false);
  });

  it("prioritizes attention over running and error", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 1,
        activeRunCount: 2,
        latestRunStatus: "failed",
      }),
    ).toBe("attention");
  });

  it("treats concurrent active runs as running", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 0,
        activeRunCount: 2,
        latestRunStatus: "failed",
      }),
    ).toBe("running");
  });

  it("falls back to error when there are no active runs and the latest run failed", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 0,
        activeRunCount: 0,
        latestRunStatus: "failed",
      }),
    ).toBe("error");
  });

  it("treats stopped runs as non-errors once approvals are resolved", () => {
    expect(
      derivePrimaryStatus({
        pendingApprovalCount: 0,
        activeRunCount: 0,
        latestRunStatus: "stopped",
      }),
    ).toBe("idle");
  });

  it("changes version when a fresher timestamp is present", () => {
    const earlier = deriveActivityVersion([1_000, 2_000, 3_000]);
    const later = deriveActivityVersion([1_000, 2_000, 4_000]);

    expect(later).not.toBe(earlier);
    expect(later).toBeGreaterThan(earlier);
  });
});

describe("isSyntheticMessageId", () => {
  it("flags the initial greeting id", () => {
    expect(isSyntheticMessageId("greeting")).toBe(true);
  });

  it("flags any system-prefixed id", () => {
    expect(isSyntheticMessageId("system:run-completed:1712345678900")).toBe(true);
    expect(isSyntheticMessageId("system:anything")).toBe(true);
  });

  it("does not flag user-authored ids", () => {
    expect(isSyntheticMessageId("msg_abc123")).toBe(false);
    expect(isSyntheticMessageId("b5f8c3a1-2e7d-4f6b-9c8a-1d3e5f7a9b2c")).toBe(false);
  });

  it("does not flag undefined ids", () => {
    expect(isSyntheticMessageId(undefined)).toBe(false);
  });
});
