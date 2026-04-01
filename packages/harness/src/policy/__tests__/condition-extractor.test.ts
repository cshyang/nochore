import { describe, expect, it } from "vitest";
import type { ApprovalRecord } from "../../types";
import { extractConditions } from "../condition-extractor";

function makeApproval(toolInput: Record<string, unknown>): ApprovalRecord {
  return {
    id: crypto.randomUUID(),
    runId: "run_001",
    agentId: "agent_001",
    approvalId: crypto.randomUUID(),
    waitTokenId: "wait_001",
    toolName: "googleads_adjust_budget",
    toolInput,
    status: "approved",
    createdAt: new Date("2026-03-15T00:00:00Z"),
    resolvedAt: new Date("2026-03-15T00:00:00Z"),
  };
}

describe("extractConditions", () => {
  it("returns null for empty approvals", () => {
    expect(extractConditions([], "approved")).toBeNull();
  });

  it("extracts lte for approved numeric fields (uses max)", () => {
    const approvals = [makeApproval({ amount: 50 }), makeApproval({ amount: 75 }), makeApproval({ amount: 100 })];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).not.toBeNull();
    expect(conditions?.amount?.operator).toBe("lte");
    expect(conditions?.amount?.value).toBe(100);
  });

  it("extracts gte for rejected numeric fields (uses min)", () => {
    const approvals = [makeApproval({ amount: 200 }), makeApproval({ amount: 300 }), makeApproval({ amount: 500 })];
    const conditions = extractConditions(approvals, "rejected");

    expect(conditions).not.toBeNull();
    expect(conditions?.amount?.operator).toBe("gte");
    expect(conditions?.amount?.value).toBe(200);
  });

  it("extracts eq for consistent string fields", () => {
    const approvals = [
      makeApproval({ campaignId: "camp_123" }),
      makeApproval({ campaignId: "camp_123" }),
      makeApproval({ campaignId: "camp_123" }),
    ];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions?.campaignId?.operator).toBe("eq");
    expect(conditions?.campaignId?.value).toBe("camp_123");
  });

  it("skips inconsistent string fields", () => {
    const approvals = [
      makeApproval({ campaignId: "camp_123" }),
      makeApproval({ campaignId: "camp_456" }),
    ];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).toBeNull();
  });

  it("extracts eq for consistent boolean fields", () => {
    const approvals = [
      makeApproval({ enabled: true }),
      makeApproval({ enabled: true }),
      makeApproval({ enabled: true }),
    ];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions?.enabled?.operator).toBe("eq");
    expect(conditions?.enabled?.value).toBe(true);
  });

  it("skips inconsistent boolean fields", () => {
    const approvals = [makeApproval({ enabled: true }), makeApproval({ enabled: false })];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).toBeNull();
  });

  it("skips fields with null values", () => {
    const approvals = [makeApproval({ amount: 50 }), makeApproval({ amount: null })];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).toBeNull();
  });

  it("skips non-primitive fields (objects, arrays)", () => {
    const approvals = [
      makeApproval({ nested: { deep: true }, tags: ["a", "b"] }),
      makeApproval({ nested: { deep: false }, tags: ["c"] }),
    ];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).toBeNull();
  });

  it("handles multiple field types together", () => {
    const approvals = [
      makeApproval({ amount: 50, campaignId: "camp_123", enabled: true }),
      makeApproval({ amount: 75, campaignId: "camp_123", enabled: true }),
      makeApproval({ amount: 100, campaignId: "camp_123", enabled: true }),
    ];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).not.toBeNull();
    expect(conditions?.amount).toEqual({ operator: "lte", value: 100 });
    expect(conditions?.campaignId).toEqual({ operator: "eq", value: "camp_123" });
    expect(conditions?.enabled).toEqual({ operator: "eq", value: true });
  });

  it("returns null when no extractable conditions found", () => {
    const approvals = [makeApproval({}), makeApproval({})];
    const conditions = extractConditions(approvals, "approved");

    expect(conditions).toBeNull();
  });
});
