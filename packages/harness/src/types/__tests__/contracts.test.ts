import { describe, it, expect } from "vitest";
import { ActionProposalSchema, ExecutionResultSchema } from "../action";
import { PolicyDecisionSchema, PolicyRuleSchema, OperationalConstraintSchema } from "../policy";
import { SkillDefinitionSchema } from "../skill";
import { DataTypeSchema, DataTypeRegistry } from "../data-types";

// ---------------------------------------------------------------------------
// ActionProposal
// ---------------------------------------------------------------------------
describe("ActionProposal", () => {
  const validProposal = {
    id: "prop_001",
    action: "add_negative_keyword",
    toolCategory: "google_ads",
    args: { term: "free wallpaper", matchType: "EXACT" },
    reason: "High spend, zero conversions",
    confidence: 0.92,
    skillSource: "search_terms",
    reversible: true,
    idempotencyKey: "hash_abc123",
  };

  it("validates a well-formed proposal", () => {
    expect(ActionProposalSchema.safeParse(validProposal).success).toBe(true);
  });

  it("accepts confidence of exactly 0", () => {
    const proposal = { ...validProposal, confidence: 0 };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it("accepts confidence of exactly 1", () => {
    const proposal = { ...validProposal, confidence: 1 };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it("rejects proposal with confidence > 1", () => {
    const proposal = { ...validProposal, id: "prop_002", confidence: 1.5 };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects proposal with confidence < 0", () => {
    const proposal = { ...validProposal, id: "prop_003", confidence: -0.1 };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects proposal missing required fields", () => {
    const partial = { id: "prop_004", action: "test" };
    expect(ActionProposalSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects proposal with empty id", () => {
    const proposal = { ...validProposal, id: "" };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("rejects proposal with empty action", () => {
    const proposal = { ...validProposal, action: "" };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("accepts proposal with empty args object", () => {
    const proposal = { ...validProposal, args: {} };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ExecutionResult
// ---------------------------------------------------------------------------
describe("ExecutionResult", () => {
  it("validates a successful execution", () => {
    const result = {
      proposalId: "prop_001",
      status: "executed" as const,
      output: { keywordId: "kw_123" },
      executedAt: new Date(),
    };
    expect(ExecutionResultSchema.safeParse(result).success).toBe(true);
  });

  it("validates a failed execution with error", () => {
    const result = {
      proposalId: "prop_001",
      status: "failed" as const,
      error: "API rate limit exceeded",
      executedAt: new Date(),
    };
    expect(ExecutionResultSchema.safeParse(result).success).toBe(true);
  });

  it("validates a skipped execution", () => {
    const result = {
      proposalId: "prop_001",
      status: "skipped" as const,
      executedAt: new Date(),
    };
    expect(ExecutionResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects invalid status", () => {
    const result = {
      proposalId: "prop_001",
      status: "pending",
      executedAt: new Date(),
    };
    expect(ExecutionResultSchema.safeParse(result).success).toBe(false);
  });

  it("rejects missing executedAt", () => {
    const result = {
      proposalId: "prop_001",
      status: "executed",
    };
    expect(ExecutionResultSchema.safeParse(result).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PolicyDecision
// ---------------------------------------------------------------------------
describe("PolicyDecision", () => {
  it("validates approved decision", () => {
    const decision = { result: "approved" as const, reason: "Under threshold" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it("validates needs_review decision", () => {
    const decision = { result: "needs_review" as const, reason: "15% exceeds 5% limit" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it("validates blocked decision", () => {
    const decision = { result: "blocked" as const, reason: "Exceeds max change" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(true);
  });

  it("rejects invalid decision result", () => {
    const decision = { result: "maybe", reason: "test" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(false);
  });

  it("rejects decision without reason", () => {
    const decision = { result: "approved" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(false);
  });

  it("rejects empty reason", () => {
    const decision = { result: "approved", reason: "" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// OperationalConstraint
// ---------------------------------------------------------------------------
describe("OperationalConstraint", () => {
  it("validates active_hours constraint", () => {
    const constraint = {
      type: "active_hours" as const,
      config: { startHour: 9, endHour: 17, timezone: "America/New_York" },
    };
    expect(OperationalConstraintSchema.safeParse(constraint).success).toBe(true);
  });

  it("validates daily_limit constraint", () => {
    const constraint = {
      type: "daily_limit" as const,
      config: { maxActions: 50 },
    };
    expect(OperationalConstraintSchema.safeParse(constraint).success).toBe(true);
  });

  it("validates freeze_period constraint", () => {
    const constraint = {
      type: "freeze_period" as const,
      config: { start: "2024-12-20", end: "2024-12-27" },
    };
    expect(OperationalConstraintSchema.safeParse(constraint).success).toBe(true);
  });

  it("rejects invalid constraint type", () => {
    const constraint = {
      type: "unknown_type",
      config: {},
    };
    expect(OperationalConstraintSchema.safeParse(constraint).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PolicyRule (schema-only — evaluate is a function, validated at interface level)
// ---------------------------------------------------------------------------
describe("PolicyRule", () => {
  it("validates a well-formed policy rule", () => {
    const rule = {
      id: "pol_001",
      name: "Budget Guard",
      description: "Blocks changes exceeding 10% of daily budget",
      priority: 1,
    };
    expect(PolicyRuleSchema.safeParse(rule).success).toBe(true);
  });

  it("rejects rule with empty id", () => {
    const rule = {
      id: "",
      name: "Budget Guard",
      description: "test",
      priority: 1,
    };
    expect(PolicyRuleSchema.safeParse(rule).success).toBe(false);
  });

  it("rejects rule with negative priority", () => {
    const rule = {
      id: "pol_002",
      name: "test",
      description: "test",
      priority: -1,
    };
    expect(PolicyRuleSchema.safeParse(rule).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SkillDefinition
// ---------------------------------------------------------------------------
describe("SkillDefinition", () => {
  it("validates an LLM-powered skill definition", () => {
    const skill = {
      id: "skill_search_terms",
      name: "Search Term Analyzer",
      description: "Analyzes search terms for wasted spend",
      consumes: ["search_terms", "ad_metrics"],
      outputSchema: { type: "object" as const },
      systemPrompt: "You are an expert Google Ads analyst...",
    };
    expect(SkillDefinitionSchema.safeParse(skill).success).toBe(true);
  });

  it("validates a deterministic skill definition", () => {
    const skill = {
      id: "skill_quality_score",
      name: "Quality Score Calculator",
      description: "Computes quality score from components",
      consumes: ["quality_score_data"],
      outputSchema: { type: "object" as const },
      hasDeterministicCompute: true,
    };
    expect(SkillDefinitionSchema.safeParse(skill).success).toBe(true);
  });

  it("validates a skill with knowledgeKey", () => {
    const skill = {
      id: "skill_brand",
      name: "Brand Analyzer",
      description: "Analyzes brand vs non-brand performance",
      consumes: ["campaign_data"],
      outputSchema: { type: "object" as const },
      knowledgeKey: "brand_terms",
    };
    expect(SkillDefinitionSchema.safeParse(skill).success).toBe(true);
  });

  it("rejects skill with empty id", () => {
    const skill = {
      id: "",
      name: "test",
      description: "test",
      consumes: [],
      outputSchema: { type: "object" as const },
    };
    expect(SkillDefinitionSchema.safeParse(skill).success).toBe(false);
  });

  it("rejects skill with empty name", () => {
    const skill = {
      id: "skill_001",
      name: "",
      description: "test",
      consumes: [],
      outputSchema: { type: "object" as const },
    };
    expect(SkillDefinitionSchema.safeParse(skill).success).toBe(false);
  });

  it("validates skill with empty consumes array", () => {
    const skill = {
      id: "skill_standalone",
      name: "Standalone Skill",
      description: "Needs no external data",
      consumes: [],
      outputSchema: { type: "object" as const },
    };
    expect(SkillDefinitionSchema.safeParse(skill).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// DataType
// ---------------------------------------------------------------------------
describe("DataType", () => {
  it("validates a data type declaration", () => {
    const dataType = {
      id: "search_terms",
      description: "Search query performance data from Google Ads",
      schema: { type: "object" as const },
    };
    expect(DataTypeSchema.safeParse(dataType).success).toBe(true);
  });

  it("rejects data type with empty id", () => {
    const dataType = {
      id: "",
      description: "test",
      schema: { type: "object" as const },
    };
    expect(DataTypeSchema.safeParse(dataType).success).toBe(false);
  });

  it("rejects data type without schema", () => {
    const dataType = {
      id: "search_terms",
      description: "test",
    };
    expect(DataTypeSchema.safeParse(dataType).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DataTypeRegistry
// ---------------------------------------------------------------------------
describe("DataTypeRegistry", () => {
  it("registers and retrieves a data type", () => {
    const registry = new DataTypeRegistry();
    const dt = {
      id: "search_terms",
      description: "Search query performance data",
      schema: { type: "object" as const },
    };
    registry.register(dt);
    expect(registry.get("search_terms")).toEqual(dt);
  });

  it("returns undefined for unregistered type", () => {
    const registry = new DataTypeRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("lists all registered types", () => {
    const registry = new DataTypeRegistry();
    registry.register({
      id: "search_terms",
      description: "Search terms",
      schema: { type: "object" as const },
    });
    registry.register({
      id: "ad_metrics",
      description: "Ad metrics",
      schema: { type: "object" as const },
    });
    expect(registry.list()).toHaveLength(2);
    expect(registry.list().map((d) => d.id)).toContain("search_terms");
    expect(registry.list().map((d) => d.id)).toContain("ad_metrics");
  });

  it("throws when registering duplicate id", () => {
    const registry = new DataTypeRegistry();
    const dt = {
      id: "search_terms",
      description: "Search terms",
      schema: { type: "object" as const },
    };
    registry.register(dt);
    expect(() => registry.register(dt)).toThrow();
  });

  it("checks existence with has()", () => {
    const registry = new DataTypeRegistry();
    registry.register({
      id: "search_terms",
      description: "Search terms",
      schema: { type: "object" as const },
    });
    expect(registry.has("search_terms")).toBe(true);
    expect(registry.has("nonexistent")).toBe(false);
  });
});
