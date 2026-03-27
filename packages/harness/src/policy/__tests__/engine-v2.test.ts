import { describe, expect, it } from "vitest";
import { evaluatePolicy } from "../engine";
import type { ToolConfigEntry } from "../../types";

function makeToolConfig(
  patch: Partial<ToolConfigEntry> = {},
): ToolConfigEntry {
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
      },
    );

    expect(decision.result).toBe("auto");
  });
});
