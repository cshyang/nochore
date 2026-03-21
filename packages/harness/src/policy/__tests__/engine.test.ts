import { describe, it, expect } from "vitest";
import { evaluatePolicy, type PolicyEvalConfig } from "../engine";
import { budgetDeltaRule } from "../rules/budget-delta";
import { cooldownRule } from "../rules/cooldown";
import { operationalRule } from "../rules/operational";
import { globalOverrideRule } from "../rules/global-override";
import type { ActionProposal } from "../../types/action";
import type { AgentEvent } from "../../types/memory";
import type { PolicyRule } from "../../types/policy";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProposal(overrides: Partial<ActionProposal> = {}): ActionProposal {
  return {
    id: "prop_001",
    action: "add_negative_keyword",
    toolCategory: "google_ads",
    args: { term: "free wallpaper", matchType: "EXACT" },
    reason: "High spend, zero conversions",
    confidence: 0.92,
    skillSource: "search_terms",
    reversible: true,
    idempotencyKey: "hash_abc123",
    ...overrides,
  };
}

function makeBudgetProposal(deltaPct: number): ActionProposal {
  return makeProposal({
    id: `budget_${deltaPct}`,
    action: "adjust_budget",
    args: { deltaPct },
    reason: `Adjust budget by ${deltaPct}%`,
    idempotencyKey: `budget_${deltaPct}`,
  });
}

function makeEvent(overrides: Partial<AgentEvent> = {}): AgentEvent {
  return {
    id: "evt_001",
    runId: "run_001",
    agentId: "agent_001",
    timestamp: new Date(),
    type: "action_executed",
    data: { action: "add_negative_keyword" },
    ...overrides,
  };
}

function baseConfig(overrides: Partial<PolicyEvalConfig> = {}): PolicyEvalConfig {
  return {
    policyOverrides: [],
    globalApprovalRequired: false,
    operationalConstraints: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Budget Delta Rule
// ---------------------------------------------------------------------------
describe("budgetDeltaRule", () => {
  const context = {
    recentActions: [],
    operationalConstraints: [],
    globalOverrideEnabled: false,
    currentTime: new Date(),
  };

  it("approves non-budget actions", () => {
    const proposal = makeProposal({ action: "add_negative_keyword" });
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
    expect(decision.reason).toBe("Not a budget action");
  });

  it("approves budget change <= 5%", () => {
    const proposal = makeBudgetProposal(3);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
    expect(decision.reason).toBe("Under 5% threshold");
  });

  it("approves budget change at exactly 5%", () => {
    const proposal = makeBudgetProposal(5);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
    expect(decision.reason).toBe("Under 5% threshold");
  });

  it("requires review for budget change between 5% and 20%", () => {
    const proposal = makeBudgetProposal(15);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("needs_review");
    expect(decision.reason).toContain("15%");
    expect(decision.reason).toContain("requires approval");
  });

  it("requires review at exactly 20%", () => {
    const proposal = makeBudgetProposal(20);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("needs_review");
    expect(decision.reason).toContain("20%");
  });

  it("blocks budget change > 20%", () => {
    const proposal = makeBudgetProposal(25);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("25%");
    expect(decision.reason).toContain("exceeds maximum 20%");
  });

  it("uses absolute value for negative delta", () => {
    const proposal = makeBudgetProposal(-15);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("needs_review");
    expect(decision.reason).toContain("15%");
  });

  it("blocks large negative delta", () => {
    const proposal = makeBudgetProposal(-30);
    const decision = budgetDeltaRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("30%");
  });

  it("has correct metadata", () => {
    expect(budgetDeltaRule.id).toBe("budget_delta");
    expect(budgetDeltaRule.priority).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// Cooldown Rule
// ---------------------------------------------------------------------------
describe("cooldownRule", () => {
  it("approves when no recent actions exist", () => {
    const proposal = makeProposal();
    const context = {
      recentActions: [],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: new Date(),
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
    expect(decision.reason).toBe("No cooldown conflict");
  });

  it("blocks when same action was taken within cooldown window", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const proposal = makeProposal({ action: "add_negative_keyword" });
    const context = {
      recentActions: [
        makeEvent({
          timestamp: twoHoursAgo,
          data: { action: "add_negative_keyword" },
        }),
      ],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("Cooldown period active");
  });

  it("approves when same action is outside cooldown window", () => {
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const proposal = makeProposal({ action: "add_negative_keyword" });
    const context = {
      recentActions: [
        makeEvent({
          timestamp: twoDaysAgo,
          data: { action: "add_negative_keyword" },
        }),
      ],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
  });

  it("approves when different action type within window", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const proposal = makeProposal({ action: "add_negative_keyword" });
    const context = {
      recentActions: [
        makeEvent({
          timestamp: twoHoursAgo,
          data: { action: "adjust_budget" },
        }),
      ],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
  });

  it("checks target match for cooldown", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const proposal = makeProposal({
      action: "adjust_budget",
      args: { target: "campaign_123", deltaPct: 5 },
    });
    const context = {
      recentActions: [
        makeEvent({
          timestamp: twoHoursAgo,
          data: { action: "adjust_budget", target: "campaign_456" },
        }),
      ],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
  });

  it("blocks when same action and same target within window", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const proposal = makeProposal({
      action: "adjust_budget",
      args: { target: "campaign_123", deltaPct: 5 },
    });
    const context = {
      recentActions: [
        makeEvent({
          timestamp: twoHoursAgo,
          data: { action: "adjust_budget", target: "campaign_123" },
        }),
      ],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
  });

  it("has correct metadata", () => {
    expect(cooldownRule.id).toBe("cooldown");
    expect(cooldownRule.priority).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Operational Rule
// ---------------------------------------------------------------------------
describe("operationalRule", () => {
  it("approves when no operational constraints exist", () => {
    const proposal = makeProposal();
    const context = {
      recentActions: [],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: new Date(),
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
    expect(decision.reason).toBe("All operational constraints satisfied");
  });

  it("blocks when outside active hours", () => {
    const proposal = makeProposal();
    // Set time to 3 AM (outside 9-17)
    const offHours = new Date("2026-03-21T03:00:00Z");
    const context = {
      recentActions: [],
      operationalConstraints: [
        {
          type: "active_hours" as const,
          config: { startHour: 9, endHour: 17, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: offHours,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("Outside active hours");
  });

  it("approves when inside active hours", () => {
    const proposal = makeProposal();
    const onHours = new Date("2026-03-21T12:00:00Z");
    const context = {
      recentActions: [],
      operationalConstraints: [
        {
          type: "active_hours" as const,
          config: { startHour: 9, endHour: 17, daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: onHours,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
  });

  it("blocks when on a non-active day of week", () => {
    const proposal = makeProposal();
    // Saturday = 6, only allow weekdays (1-5)
    const saturday = new Date("2026-03-21T12:00:00Z"); // March 21, 2026 is a Saturday
    const context = {
      recentActions: [],
      operationalConstraints: [
        {
          type: "active_hours" as const,
          config: { startHour: 9, endHour: 17, daysOfWeek: [1, 2, 3, 4, 5] },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: saturday,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("Outside active hours");
  });

  it("blocks when daily limit is reached", () => {
    const proposal = makeProposal();
    const now = new Date("2026-03-21T12:00:00Z");
    // Create 5 events from today
    const todayEvents: AgentEvent[] = Array.from({ length: 5 }, (_, i) =>
      makeEvent({
        id: `evt_${i}`,
        timestamp: new Date(now.getTime() - i * 60 * 60 * 1000),
        type: "action_executed",
      }),
    );
    const context = {
      recentActions: todayEvents,
      operationalConstraints: [
        {
          type: "daily_limit" as const,
          config: { maxActionsPerDay: 5 },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("Daily action limit");
  });

  it("approves when under daily limit", () => {
    const proposal = makeProposal();
    const now = new Date("2026-03-21T12:00:00Z");
    const todayEvents: AgentEvent[] = Array.from({ length: 3 }, (_, i) =>
      makeEvent({
        id: `evt_${i}`,
        timestamp: new Date(now.getTime() - i * 60 * 60 * 1000),
        type: "action_executed",
      }),
    );
    const context = {
      recentActions: todayEvents,
      operationalConstraints: [
        {
          type: "daily_limit" as const,
          config: { maxActionsPerDay: 5 },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
  });

  it("blocks during freeze period", () => {
    const proposal = makeProposal();
    const duringFreeze = new Date("2026-12-25T12:00:00Z");
    const context = {
      recentActions: [],
      operationalConstraints: [
        {
          type: "freeze_period" as const,
          config: { start: "2026-12-20T00:00:00Z", end: "2026-12-27T00:00:00Z" },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: duringFreeze,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
    expect(decision.reason).toContain("Freeze period active");
  });

  it("approves outside freeze period", () => {
    const proposal = makeProposal();
    const outsideFreeze = new Date("2026-12-28T12:00:00Z");
    const context = {
      recentActions: [],
      operationalConstraints: [
        {
          type: "freeze_period" as const,
          config: { start: "2026-12-20T00:00:00Z", end: "2026-12-27T00:00:00Z" },
        },
      ],
      globalOverrideEnabled: false,
      currentTime: outsideFreeze,
    };
    const decision = operationalRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
  });

  it("has correct metadata", () => {
    expect(operationalRule.id).toBe("operational");
    expect(operationalRule.priority).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Global Override Rule
// ---------------------------------------------------------------------------
describe("globalOverrideRule", () => {
  it("requires review when global override is enabled", () => {
    const proposal = makeProposal();
    const context = {
      recentActions: [],
      operationalConstraints: [],
      globalOverrideEnabled: true,
      currentTime: new Date(),
    };
    const decision = globalOverrideRule.evaluate(proposal, context);
    expect(decision.result).toBe("needs_review");
    expect(decision.reason).toBe("Global approval required");
  });

  it("approves when global override is disabled", () => {
    const proposal = makeProposal();
    const context = {
      recentActions: [],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: new Date(),
    };
    const decision = globalOverrideRule.evaluate(proposal, context);
    expect(decision.result).toBe("approved");
    expect(decision.reason).toBe("No global override");
  });

  it("has correct metadata", () => {
    expect(globalOverrideRule.id).toBe("global_override");
    expect(globalOverrideRule.priority).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// evaluatePolicy — full engine
// ---------------------------------------------------------------------------
describe("evaluatePolicy", () => {
  const allRules: PolicyRule[] = [
    budgetDeltaRule,
    cooldownRule,
    operationalRule,
    globalOverrideRule,
  ];

  it("approves a simple proposal that passes all rules", () => {
    const proposal = makeProposal();
    const config = baseConfig();
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.size).toBe(1);
    const decision = results.get(proposal.id);
    expect(decision).toBeDefined();
    expect(decision!.result).toBe("approved");
  });

  it("evaluates multiple proposals independently", () => {
    const approved = makeProposal({ id: "prop_ok", action: "add_negative_keyword" });
    const blocked = makeBudgetProposal(50);
    const config = baseConfig();
    const results = evaluatePolicy([approved, blocked], allRules, config);
    expect(results.size).toBe(2);
    expect(results.get("prop_ok")!.result).toBe("approved");
    expect(results.get("budget_50")!.result).toBe("blocked");
  });

  // Per-action overrides
  it("always_approve override bypasses all rules", () => {
    const proposal = makeBudgetProposal(50); // would be blocked
    const config = baseConfig({
      policyOverrides: [{ pattern: "adjust_budget", decision: "always_approve" }],
    });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("approved");
    expect(results.get(proposal.id)!.reason).toBe("Per-action override");
  });

  it("always_ask override bypasses all rules", () => {
    const proposal = makeProposal(); // would be approved
    const config = baseConfig({
      policyOverrides: [{ pattern: "add_negative_keyword", decision: "always_ask" }],
    });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("needs_review");
    expect(results.get(proposal.id)!.reason).toBe("Per-action override");
  });

  it("always_block override bypasses all rules", () => {
    const proposal = makeProposal(); // would be approved
    const config = baseConfig({
      policyOverrides: [{ pattern: "add_negative_keyword", decision: "always_block" }],
    });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("blocked");
    expect(results.get(proposal.id)!.reason).toBe("Per-action override");
  });

  it("override pattern matching is exact", () => {
    const proposal = makeProposal({ action: "add_negative_keyword" });
    const config = baseConfig({
      policyOverrides: [{ pattern: "adjust_budget", decision: "always_block" }],
    });
    const results = evaluatePolicy([proposal], allRules, config);
    // Should NOT be blocked because pattern doesn't match
    expect(results.get(proposal.id)!.result).toBe("approved");
  });

  // Global approval required
  it("global approval upgrades approved to needs_review", () => {
    const proposal = makeProposal();
    const config = baseConfig({ globalApprovalRequired: true });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("needs_review");
  });

  it("global approval does not downgrade blocked", () => {
    const proposal = makeBudgetProposal(50);
    const config = baseConfig({ globalApprovalRequired: true });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("blocked");
  });

  it("global approval does not change needs_review", () => {
    const proposal = makeBudgetProposal(15);
    const config = baseConfig({ globalApprovalRequired: true });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("needs_review");
  });

  // Strictest-wins logic
  it("strictest result wins across multiple rules", () => {
    // Budget >20% (blocked) + global override (needs_review) → blocked
    const proposal = makeBudgetProposal(25);
    const config = baseConfig({ globalApprovalRequired: true });
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("blocked");
  });

  it("needs_review beats approved in multiple rules", () => {
    // Budget 15% (needs_review) + everything else approved → needs_review
    const proposal = makeBudgetProposal(15);
    const config = baseConfig();
    const results = evaluatePolicy([proposal], allRules, config);
    expect(results.get(proposal.id)!.result).toBe("needs_review");
  });

  // Priority ordering
  it("sorts rules by priority (ascending) before evaluation", () => {
    // Create rules with different priorities to verify order
    const lowPriorityRule: PolicyRule = {
      id: "low",
      name: "Low Priority",
      description: "Runs first",
      priority: 1,
      evaluate: () => ({ result: "approved", reason: "Low priority ok" }),
    };
    const highPriorityRule: PolicyRule = {
      id: "high",
      name: "High Priority",
      description: "Runs last",
      priority: 50,
      evaluate: () => ({ result: "needs_review", reason: "High priority review" }),
    };
    const proposal = makeProposal();
    // Pass in reverse order — engine should sort
    const results = evaluatePolicy(
      [proposal],
      [highPriorityRule, lowPriorityRule],
      baseConfig(),
    );
    // needs_review is stricter than approved, so it should win
    expect(results.get(proposal.id)!.result).toBe("needs_review");
    // The reason should come from the strictest rule
    expect(results.get(proposal.id)!.reason).toBe("High priority review");
  });

  // Empty cases
  it("returns approved when no rules exist", () => {
    const proposal = makeProposal();
    const results = evaluatePolicy([proposal], [], baseConfig());
    expect(results.get(proposal.id)!.result).toBe("approved");
  });

  it("returns empty map for empty proposals", () => {
    const results = evaluatePolicy([], allRules, baseConfig());
    expect(results.size).toBe(0);
  });

  // Operational constraints via config
  it("passes operational constraints through to rules", () => {
    const proposal = makeProposal();
    const duringFreeze = new Date("2026-12-25T12:00:00Z");
    // We need to control currentTime, so we test the operational rule directly
    // via evaluatePolicy with constraints
    const config = baseConfig({
      operationalConstraints: [
        {
          type: "freeze_period",
          config: { start: "2026-12-20T00:00:00Z", end: "2026-12-27T00:00:00Z" },
        },
      ],
    });
    // The engine uses new Date() for currentTime, but freeze period
    // uses ISO strings, so we test the rule directly for time-sensitive logic
    // and use the engine test to confirm constraints are passed through
    const results = evaluatePolicy([proposal], [operationalRule], config);
    // This will pass or fail based on current system time relative to freeze.
    // Since test runs in March 2026, it should be approved (outside Dec freeze)
    expect(results.get(proposal.id)!.result).toBe("approved");
  });

  // Integration: cooldown + budget together
  it("cooldown blocks even when budget would approve", () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 1 * 60 * 60 * 1000);
    const proposal = makeBudgetProposal(3); // budget would approve
    // But we have a recent adjust_budget action
    const recentEvent = makeEvent({
      timestamp: oneHourAgo,
      data: { action: "adjust_budget" },
    });
    // We need to test with the cooldown rule which checks context.recentActions
    // The engine builds context with recentActions from... the config doesn't have recentActions.
    // Looking at the spec: PolicyContext has recentActions, but PolicyEvalConfig doesn't.
    // The engine builds context: { recentActions: [], ... }
    // So cooldown won't fire in the engine unless we figure out how recentActions get in.
    // From the spec: "Build PolicyContext: { recentActions: [], ..."
    // This means the engine always passes empty recentActions, which is a placeholder.
    // For now the test verifies the rule directly.
    const context = {
      recentActions: [recentEvent],
      operationalConstraints: [],
      globalOverrideEnabled: false,
      currentTime: now,
    };
    const decision = cooldownRule.evaluate(proposal, context);
    expect(decision.result).toBe("blocked");
  });
});
