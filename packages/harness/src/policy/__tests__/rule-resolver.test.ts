import { describe, expect, it } from "vitest";
import type { LearnedPolicyRule, ToolConfigEntry } from "../../types";
import { findMatchingLearnedRule, resolveDecision } from "../rule-resolver";

function makeToolConfig(patch: Partial<ToolConfigEntry> = {}): ToolConfigEntry {
  return {
    toolName: "googleads_adjust_budget",
    slug: "GOOGLEADS_ADJUST_BUDGET",
    provider: "googleads",
    title: "Adjust Budget",
    description: "Update a campaign budget.",
    mode: "write",
    enabled: true,
    approvalMode: "approval",
    ...patch,
  };
}

function makeLearnedRule(patch: Partial<LearnedPolicyRule> = {}): LearnedPolicyRule {
  return {
    id: "rule_001",
    agentId: "agent_001",
    toolName: "googleads_adjust_budget",
    learnedDecision: "auto",
    conditions: null,
    evidenceCount: 6,
    consistencyRate: 1,
    status: "accepted",
    suggestedAt: new Date("2026-03-30T00:00:00Z"),
    acceptedAt: new Date("2026-03-31T00:00:00Z"),
    sourceApprovalIds: ["approval_001"],
    ...patch,
  };
}

describe("resolveDecision", () => {
  it("returns blocked when static policy is blocked, regardless of learned rule", () => {
    const result = resolveDecision(makeToolConfig({ approvalMode: "blocked" }), "auto");
    expect(result.result).toBe("blocked");
  });

  it("returns auto when learned decision is auto and static is not blocked", () => {
    const result = resolveDecision(makeToolConfig({ approvalMode: "approval" }), "auto");
    expect(result.result).toBe("auto");
  });

  it("returns approval when learned decision is approval", () => {
    const result = resolveDecision(makeToolConfig({ approvalMode: "auto" }), "approval");
    expect(result.result).toBe("approval");
  });

  it("caps learned blocked at approval when static is approval", () => {
    const result = resolveDecision(makeToolConfig({ approvalMode: "approval" }), "blocked");
    expect(result.result).toBe("approval");
    expect(result.reason).toMatch(/escalates/i);
  });

  it("caps learned blocked at approval when static is auto", () => {
    const result = resolveDecision(makeToolConfig({ approvalMode: "auto" }), "blocked");
    expect(result.result).toBe("approval");
  });

  it("never returns blocked from a learned rule alone", () => {
    for (const approvalMode of ["auto", "approval"] as const) {
      const result = resolveDecision(makeToolConfig({ approvalMode }), "blocked");
      expect(result.result).not.toBe("blocked");
    }
  });
});

describe("findMatchingLearnedRule", () => {
  it("returns null when no rules match the tool", () => {
    const rules = [makeLearnedRule({ toolName: "other_tool" })];
    expect(findMatchingLearnedRule("googleads_adjust_budget", {}, rules)).toBeNull();
  });

  it("matches a rule with no conditions", () => {
    const rules = [makeLearnedRule({ conditions: null })];
    const match = findMatchingLearnedRule("googleads_adjust_budget", { amount: 50 }, rules);
    expect(match).toBe(rules[0]);
  });

  it("matches eq condition", () => {
    const rules = [
      makeLearnedRule({
        conditions: { campaignId: { operator: "eq", value: "camp_123" } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { campaignId: "camp_123" }, rules)).toBe(rules[0]);
    expect(findMatchingLearnedRule("googleads_adjust_budget", { campaignId: "camp_999" }, rules)).toBeNull();
  });

  it("matches lte condition", () => {
    const rules = [
      makeLearnedRule({
        conditions: { amount: { operator: "lte", value: 100 } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 100 }, rules)).toBe(rules[0]);
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 101 }, rules)).toBeNull();
  });

  it("matches gte condition", () => {
    const rules = [
      makeLearnedRule({
        conditions: { amount: { operator: "gte", value: 50 } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 50 }, rules)).toBe(rules[0]);
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 49 }, rules)).toBeNull();
  });

  it("matches lt condition", () => {
    const rules = [
      makeLearnedRule({
        conditions: { amount: { operator: "lt", value: 100 } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 99 }, rules)).toBe(rules[0]);
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 100 }, rules)).toBeNull();
  });

  it("matches gt condition", () => {
    const rules = [
      makeLearnedRule({
        conditions: { amount: { operator: "gt", value: 100 } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 101 }, rules)).toBe(rules[0]);
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: 100 }, rules)).toBeNull();
  });

  it("matches in condition", () => {
    const rules = [
      makeLearnedRule({
        conditions: { status: { operator: "in", value: ["active", "paused"] } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { status: "active" }, rules)).toBe(rules[0]);
    expect(findMatchingLearnedRule("googleads_adjust_budget", { status: "removed" }, rules)).toBeNull();
  });

  it("rejects non-numeric values for numeric operators", () => {
    const rules = [
      makeLearnedRule({
        conditions: { amount: { operator: "lte", value: 100 } },
      }),
    ];
    expect(findMatchingLearnedRule("googleads_adjust_budget", { amount: "fifty" }, rules)).toBeNull();
  });

  it("prefers more specific rules (more conditions)", () => {
    const broad = makeLearnedRule({
      id: "broad",
      learnedDecision: "auto",
      conditions: null,
    });
    const specific = makeLearnedRule({
      id: "specific",
      learnedDecision: "approval",
      conditions: {
        amount: { operator: "lte", value: 100 },
        campaignId: { operator: "eq", value: "camp_123" },
      },
    });

    const match = findMatchingLearnedRule(
      "googleads_adjust_budget",
      { amount: 50, campaignId: "camp_123" },
      [broad, specific],
    );
    expect(match?.id).toBe("specific");
  });

  it("falls back to broader rule when specific conditions don't match", () => {
    const broad = makeLearnedRule({
      id: "broad",
      conditions: null,
    });
    const specific = makeLearnedRule({
      id: "specific",
      conditions: { amount: { operator: "lte", value: 100 } },
    });

    const match = findMatchingLearnedRule("googleads_adjust_budget", { amount: 200 }, [broad, specific]);
    expect(match?.id).toBe("broad");
  });

  it("requires all conditions to match", () => {
    const rules = [
      makeLearnedRule({
        conditions: {
          amount: { operator: "lte", value: 100 },
          campaignId: { operator: "eq", value: "camp_123" },
        },
      }),
    ];
    // amount matches, campaignId doesn't
    expect(
      findMatchingLearnedRule("googleads_adjust_budget", { amount: 50, campaignId: "camp_999" }, rules),
    ).toBeNull();
  });

  it("returns null for empty rules array", () => {
    expect(findMatchingLearnedRule("googleads_adjust_budget", {}, [])).toBeNull();
  });

  it("returns null for undefined rules", () => {
    expect(findMatchingLearnedRule("googleads_adjust_budget", {})).toBeNull();
  });
});
