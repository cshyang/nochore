import { describe, expect, it } from "vitest";
import type { ToolConfigEntry } from "../../types";
import { evaluatePolicy } from "../engine";
import { buildToolConfigEntry } from "../tool-catalog";

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

describe("simplified policy engine", () => {
  it("blocks disabled tools", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: {},
        toolConfig: makeToolConfig({ enabled: false }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [],
      },
    );

    expect(decision.result).toBe("blocked");
  });

  it("blocks tools explicitly configured as blocked", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: {},
        toolConfig: makeToolConfig({ approvalMode: "blocked" }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [],
      },
    );

    expect(decision.result).toBe("blocked");
  });

  it("enforces cooldown windows", () => {
    const now = new Date("2026-03-24T10:00:00Z");
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: {},
        toolConfig: makeToolConfig({ cooldownMinutes: 30 }),
      },
      {
        now,
        globalApprovalRequired: false,
        recentToolCalls: [
          {
            toolName: "googleads_adjust_budget",
            timestamp: new Date("2026-03-24T09:45:00Z"),
          },
        ],
        learnedRules: [],
      },
    );

    expect(decision.result).toBe("blocked");
    expect(decision.reason).toMatch(/cooldown/i);
  });

  it("requires approval when a request exceeds budget threshold", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: { amount: 200 },
        toolConfig: makeToolConfig({
          approvalMode: "auto",
          budgetThreshold: 100,
        }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [],
      },
    );

    expect(decision.result).toBe("approval");
  });

  it("upgrades write tools to approval when global approval is enabled", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: {},
        toolConfig: makeToolConfig({ approvalMode: "auto" }),
      },
      {
        now: new Date(),
        globalApprovalRequired: true,
        recentToolCalls: [],
        learnedRules: [],
      },
    );

    expect(decision.result).toBe("approval");
  });

  it("returns auto for read tools that are enabled and within policy", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_campaign_performance",
        toolInput: { limit: 10 },
        toolConfig: makeToolConfig({
          toolName: "googleads_campaign_performance",
          slug: "GOOGLEADS_CAMPAIGN_PERFORMANCE",
          title: "Campaign Performance",
          description: "Read campaign metrics.",
          mode: "read",
          approvalMode: "auto",
        }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [],
      },
    );

    expect(decision.result).toBe("auto");
  });

  it("uses learned auto rules after static checks pass", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: { amount: 75 },
        toolConfig: makeToolConfig({ approvalMode: "approval" }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [
          {
            id: "rule_001",
            agentId: "agent_001",
            toolName: "googleads_adjust_budget",
            learnedDecision: "auto",
            conditions: { amount: { operator: "lte", value: 100 } },
            evidenceCount: 6,
            consistencyRate: 1,
            status: "accepted",
            suggestedAt: new Date("2026-03-30T00:00:00Z"),
            acceptedAt: new Date("2026-03-31T00:00:00Z"),
            sourceApprovalIds: ["approval_001"],
          },
        ],
      },
    );

    expect(decision.result).toBe("auto");
  });

  it("defaults uncatalogued read tools to auto", () => {
    const tool = buildToolConfigEntry({
      toolName: "googleads_list_campaigns",
      provider: "googleads",
      title: "List Campaigns",
      description: "List campaign metrics.",
    });

    expect(tool.mode).toBe("read");
    expect(tool.approvalMode).toBe("auto");
  });

  it("defaults uncatalogued write tools to approval", () => {
    const tool = buildToolConfigEntry({
      toolName: "googleads_adjust_budget",
      provider: "googleads",
      title: "Adjust Budget",
      description: "Update campaign budget.",
    });

    expect(tool.mode).toBe("write");
    expect(tool.approvalMode).toBe("approval");
  });

  it("caps learned blocked at approval, never fully blocks", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: { amount: 75 },
        toolConfig: makeToolConfig({ approvalMode: "approval" }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [
          {
            id: "rule_003",
            agentId: "agent_001",
            toolName: "googleads_adjust_budget",
            learnedDecision: "blocked",
            conditions: null,
            evidenceCount: 6,
            consistencyRate: 1,
            status: "accepted",
            suggestedAt: new Date("2026-03-30T00:00:00Z"),
            acceptedAt: new Date("2026-03-31T00:00:00Z"),
            sourceApprovalIds: ["approval_001"],
          },
        ],
      },
    );

    // Learned blocked should cap at approval, not fully block
    expect(decision.result).toBe("approval");
  });

  it("keeps blocked static policy stricter than learned auto rules", () => {
    const decision = evaluatePolicy(
      {
        toolName: "googleads_adjust_budget",
        toolInput: { amount: 75 },
        toolConfig: makeToolConfig({ approvalMode: "blocked" }),
      },
      {
        now: new Date(),
        globalApprovalRequired: false,
        recentToolCalls: [],
        learnedRules: [
          {
            id: "rule_002",
            agentId: "agent_001",
            toolName: "googleads_adjust_budget",
            learnedDecision: "auto",
            conditions: { amount: { operator: "lte", value: 100 } },
            evidenceCount: 6,
            consistencyRate: 1,
            status: "accepted",
            suggestedAt: new Date("2026-03-30T00:00:00Z"),
            acceptedAt: new Date("2026-03-31T00:00:00Z"),
            sourceApprovalIds: ["approval_001"],
          },
        ],
      },
    );

    expect(decision.result).toBe("blocked");
  });
});
