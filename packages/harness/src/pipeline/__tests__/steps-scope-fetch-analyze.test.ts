import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillDefinition } from "../../types/skill";
import type { AgentConfig } from "../../types/agent-config";
import type { TriggerEvent, StepOutput } from "../../types/run";
import type { AssembledContext } from "../../context/assembler";
import { SkillRegistry } from "../../skills/registry";
import { StubConnectionManager } from "../../connections/stub";

// ---------------------------------------------------------------------------
// Mock the AI SDK for scope LLM path
// ---------------------------------------------------------------------------
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  jsonSchema: vi.fn((schema: unknown) => schema),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: vi.fn(() =>
    vi.fn((modelId: string) => ({ modelId, provider: "anthropic" })),
  ),
}));

import { resolveScope } from "../steps/scope";
import { fetchData } from "../steps/fetch";
import { analyzeSkills, type SkillOutput } from "../steps/analyze";
import { generateObject } from "ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "agent_001",
    projectId: "project_001",
    name: "Test Agent",
    description: "A test agent",
    intent: "Find wasteful ad spend",
    workspacePath: "/tmp/test-agent",
    skills: ["search_terms", "quality_score"],
    skillKnowledge: {},
    triggers: [],
    policyRules: [],
    policyOverrides: [],
    globalApprovalRequired: false,
    operationalConstraints: [],
    connectionIds: [],
    memoryEnabled: false,
    lessonDistillationInterval: 86400,
    scopeStrategy: "static",
    model: undefined,
    ...overrides,
  };
}

function makeTrigger(overrides: Partial<TriggerEvent> = {}): TriggerEvent {
  return {
    type: "manual",
    timestamp: new Date("2026-03-21T10:00:00Z"),
    metadata: {},
    ...overrides,
  };
}

function makeContext(overrides: Partial<AssembledContext> = {}): AssembledContext {
  return {
    systemPrompt: "You are a campaign analysis agent.",
    metadata: { step: "scope", agentId: "agent_001" },
    ...overrides,
  };
}

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test_skill",
    name: "Test Skill",
    description: "A test skill",
    consumes: ["test_data"],
    outputSchema: {
      type: "object",
      properties: { result: { type: "string" } },
    },
    ...overrides,
  };
}

function makeRegistry(skills: SkillDefinition[]): SkillRegistry {
  const registry = new SkillRegistry();
  for (const skill of skills) {
    registry.register(skill);
  }
  return registry;
}

// ===========================================================================
// resolveScope
// ===========================================================================
describe("resolveScope", () => {
  // -------------------------------------------------------------------------
  // Static strategy
  // -------------------------------------------------------------------------
  describe("static strategy", () => {
    it("returns config.skills unchanged", async () => {
      const config = makeConfig({ skills: ["search_terms", "quality_score"], scopeStrategy: "static" });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
        makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger: makeTrigger(),
        context: makeContext(),
        skillRegistry: registry,
      });

      expect(result.skillIds).toEqual(["search_terms", "quality_score"]);
      expect(result.stepOutput.step).toBe("scope");
      expect(result.stepOutput.data).toEqual({
        skillIds: ["search_terms", "quality_score"],
        strategy: "static",
      });
    });

    it("respects trigger.metadata.skills override", async () => {
      const config = makeConfig({
        skills: ["search_terms", "quality_score"],
        scopeStrategy: "static",
      });
      const trigger = makeTrigger({
        metadata: { skills: ["quality_score"] },
      });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
        makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger,
        context: makeContext(),
        skillRegistry: registry,
      });

      expect(result.skillIds).toEqual(["quality_score"]);
      expect(result.stepOutput.data).toEqual({
        skillIds: ["quality_score"],
        strategy: "override",
      });
    });

    it("includes duration in stepOutput", async () => {
      const config = makeConfig({ scopeStrategy: "static" });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
        makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger: makeTrigger(),
        context: makeContext(),
        skillRegistry: registry,
      });

      expect(result.stepOutput.duration).toBeGreaterThanOrEqual(0);
      expect(typeof result.stepOutput.duration).toBe("number");
    });
  });

  // -------------------------------------------------------------------------
  // LLM strategy
  // -------------------------------------------------------------------------
  describe("llm strategy", () => {
    const mockedGenerateObject = vi.mocked(generateObject);

    beforeEach(() => {
      mockedGenerateObject.mockReset();
    });

    it("calls generateObject with system prompt and available skills", async () => {
      mockedGenerateObject.mockResolvedValue({
        object: { selectedSkills: ["search_terms"], reasoning: "Focus on search" },
        usage: { promptTokens: 100, completionTokens: 50 },
      } as any);

      const config = makeConfig({
        skills: ["search_terms", "quality_score"],
        scopeStrategy: "llm",
      });
      const context = makeContext({ systemPrompt: "You are a test agent." });
      const trigger = makeTrigger({ type: "cron", metadata: { schedule: "daily" } });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
        makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger,
        context,
        skillRegistry: registry,
      });

      expect(mockedGenerateObject).toHaveBeenCalledOnce();
      const callArgs = mockedGenerateObject.mock.calls[0]![0];
      expect(callArgs.system).toBe("You are a test agent.");
      const parsedPrompt = JSON.parse(callArgs.prompt as string);
      expect(parsedPrompt.availableSkills).toEqual(["search_terms", "quality_score"]);
      expect(parsedPrompt.triggerType).toBe("cron");
      expect(parsedPrompt.triggerMetadata).toEqual({ schedule: "daily" });

      expect(result.skillIds).toEqual(["search_terms"]);
      expect(result.stepOutput.step).toBe("scope");
      expect(result.stepOutput.data).toEqual({
        skillIds: ["search_terms"],
        strategy: "llm",
      });
    });

    it("filters out invalid skill IDs from LLM response", async () => {
      mockedGenerateObject.mockResolvedValue({
        object: {
          selectedSkills: ["search_terms", "nonexistent_skill", "quality_score"],
          reasoning: "Selected all",
        },
        usage: { promptTokens: 100, completionTokens: 50 },
      } as any);

      const config = makeConfig({
        skills: ["search_terms", "quality_score"],
        scopeStrategy: "llm",
      });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
        makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger: makeTrigger(),
        context: makeContext(),
        skillRegistry: registry,
      });

      expect(result.skillIds).toEqual(["search_terms", "quality_score"]);
      expect(result.skillIds).not.toContain("nonexistent_skill");
    });

    it("includes llmUsage in stepOutput when available", async () => {
      mockedGenerateObject.mockResolvedValue({
        object: { selectedSkills: ["search_terms"], reasoning: "test" },
        usage: { promptTokens: 150, completionTokens: 30 },
      } as any);

      const config = makeConfig({
        skills: ["search_terms"],
        scopeStrategy: "llm",
      });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger: makeTrigger(),
        context: makeContext(),
        skillRegistry: registry,
      });

      expect(result.stepOutput.llmUsage).toBeDefined();
      expect(result.stepOutput.llmUsage!.inputTokens).toBe(150);
      expect(result.stepOutput.llmUsage!.outputTokens).toBe(30);
    });

    it("trigger override takes precedence over llm strategy", async () => {
      const config = makeConfig({
        skills: ["search_terms", "quality_score"],
        scopeStrategy: "llm",
      });
      const trigger = makeTrigger({
        metadata: { skills: ["quality_score"] },
      });
      const registry = makeRegistry([
        makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
        makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
      ]);

      const result = await resolveScope({
        config,
        trigger,
        context: makeContext(),
        skillRegistry: registry,
      });

      // LLM should NOT be called when trigger has override
      expect(mockedGenerateObject).not.toHaveBeenCalled();
      expect(result.skillIds).toEqual(["quality_score"]);
    });
  });
});

// ===========================================================================
// fetchData
// ===========================================================================
describe("fetchData", () => {
  it("fetches all data types consumed by selected skills", async () => {
    const skills = [
      makeSkill({ id: "search_terms", consumes: ["search_terms_data"] }),
      makeSkill({ id: "quality_score", consumes: ["quality_score_data"] }),
    ];
    const registry = makeRegistry(skills);
    const cm = new StubConnectionManager({
      data: {
        search_terms_data: { keywords: ["brand"] },
        quality_score_data: { score: 7 },
      },
    });

    const result = await fetchData({
      skillIds: ["search_terms", "quality_score"],
      skillRegistry: registry,
      connectionManager: cm,
    });

    expect(result.data).toEqual({
      search_terms_data: { keywords: ["brand"] },
      quality_score_data: { score: 7 },
    });
    expect(result.stepOutput.step).toBe("fetch");
  });

  it("deduplicates data types shared by multiple skills", async () => {
    const skills = [
      makeSkill({ id: "skill_a", consumes: ["shared_data", "data_a"] }),
      makeSkill({ id: "skill_b", consumes: ["shared_data", "data_b"] }),
    ];
    const registry = makeRegistry(skills);

    // Track fetch calls to verify deduplication
    let fetchCallCount = 0;
    const cm = new StubConnectionManager({
      data: {
        shared_data: { shared: true },
        data_a: { a: 1 },
        data_b: { b: 2 },
      },
    });
    const originalFetch = cm.fetch.bind(cm);
    cm.fetch = async (id: string) => {
      fetchCallCount++;
      return originalFetch(id);
    };

    const result = await fetchData({
      skillIds: ["skill_a", "skill_b"],
      skillRegistry: registry,
      connectionManager: cm,
    });

    // shared_data should only be fetched once
    expect(fetchCallCount).toBe(3); // shared_data, data_a, data_b
    expect(result.data).toHaveProperty("shared_data");
    expect(result.data).toHaveProperty("data_a");
    expect(result.data).toHaveProperty("data_b");
  });

  it("handles partial failures (one data type fails, others succeed)", async () => {
    const skills = [
      makeSkill({ id: "skill_a", consumes: ["good_data"] }),
      makeSkill({ id: "skill_b", consumes: ["bad_data"] }),
    ];
    const registry = makeRegistry(skills);
    const cm = new StubConnectionManager({
      data: {
        good_data: { value: 42 },
        // bad_data is not configured, so fetch will throw
      },
    });
    // Override availableDataTypes to return both so the filter doesn't remove bad_data
    cm.availableDataTypes = () => ["good_data", "bad_data"];

    const result = await fetchData({
      skillIds: ["skill_a", "skill_b"],
      skillRegistry: registry,
      connectionManager: cm,
    });

    expect(result.data).toEqual({ good_data: { value: 42 } });
    expect(result.stepOutput.data).toEqual({
      requested: 2,
      fetched: 1,
      failed: 1,
    });
  });

  it("filters out unavailable data types", async () => {
    const skills = [
      makeSkill({ id: "skill_a", consumes: ["available_data", "unavailable_data"] }),
    ];
    const registry = makeRegistry(skills);
    const cm = new StubConnectionManager({
      data: {
        available_data: { value: "yes" },
        // unavailable_data is not in the data store, so availableDataTypes won't include it
      },
    });

    const result = await fetchData({
      skillIds: ["skill_a"],
      skillRegistry: registry,
      connectionManager: cm,
    });

    expect(result.data).toEqual({ available_data: { value: "yes" } });
    // Only 1 requested because unavailable_data was filtered before fetching
    expect(result.stepOutput.data).toEqual({
      requested: 1,
      fetched: 1,
      failed: 0,
    });
  });

  it("returns correct stepOutput with timing", async () => {
    const skills = [
      makeSkill({ id: "skill_a", consumes: ["data_a"] }),
    ];
    const registry = makeRegistry(skills);
    const cm = new StubConnectionManager({
      data: { data_a: { ok: true } },
    });

    const result = await fetchData({
      skillIds: ["skill_a"],
      skillRegistry: registry,
      connectionManager: cm,
    });

    expect(result.stepOutput.step).toBe("fetch");
    expect(result.stepOutput.duration).toBeGreaterThanOrEqual(0);
    expect(typeof result.stepOutput.duration).toBe("number");
  });
});

// ===========================================================================
// analyzeSkills
// ===========================================================================
describe("analyzeSkills", () => {
  it("runs skills in parallel and returns results", async () => {
    const computeA = vi.fn(async (data: any) => ({ found: data.search_data.keywords.length }));
    const computeB = vi.fn(async (data: any) => ({ score: data.score_data.score }));

    const skills = [
      makeSkill({
        id: "skill_a",
        consumes: ["search_data"],
        compute: computeA,
      }),
      makeSkill({
        id: "skill_b",
        consumes: ["score_data"],
        compute: computeB,
      }),
    ];
    const registry = makeRegistry(skills);

    const result = await analyzeSkills({
      skillIds: ["skill_a", "skill_b"],
      data: {
        search_data: { keywords: ["brand", "generic"] },
        score_data: { score: 8 },
      },
      skillRegistry: registry,
      skillKnowledge: {},
    });

    expect(result.outputs).toHaveLength(2);

    const outputA = result.outputs.find((o) => o.skillId === "skill_a");
    expect(outputA).toBeDefined();
    expect(outputA!.result).toEqual({ found: 2 });
    expect(outputA!.error).toBeUndefined();

    const outputB = result.outputs.find((o) => o.skillId === "skill_b");
    expect(outputB).toBeDefined();
    expect(outputB!.result).toEqual({ score: 8 });
    expect(outputB!.error).toBeUndefined();
  });

  it("passes correct data subset to each skill (only consumes keys)", async () => {
    const computeFn = vi.fn(async (data: any) => ({ keys: Object.keys(data) }));

    const skills = [
      makeSkill({
        id: "selective_skill",
        consumes: ["needed_data"],
        compute: computeFn,
      }),
    ];
    const registry = makeRegistry(skills);

    await analyzeSkills({
      skillIds: ["selective_skill"],
      data: {
        needed_data: { value: 1 },
        extra_data: { value: 2 },
        another_data: { value: 3 },
      },
      skillRegistry: registry,
      skillKnowledge: {},
    });

    // compute should only receive needed_data
    expect(computeFn).toHaveBeenCalledOnce();
    const passedData = computeFn.mock.calls[0]![0];
    expect(passedData).toEqual({ needed_data: { value: 1 } });
    expect(passedData).not.toHaveProperty("extra_data");
    expect(passedData).not.toHaveProperty("another_data");
  });

  it("passes knowledge from skillKnowledge map", async () => {
    const computeFn = vi.fn(async (data: any, knowledge?: string) => ({
      hasKnowledge: !!knowledge,
      knowledgeContent: knowledge,
    }));

    const skills = [
      makeSkill({
        id: "knowledge_skill",
        consumes: ["some_data"],
        compute: computeFn,
        knowledgeKey: "my_knowledge_key",
      }),
    ];
    const registry = makeRegistry(skills);

    await analyzeSkills({
      skillIds: ["knowledge_skill"],
      data: { some_data: { value: 1 } },
      skillRegistry: registry,
      skillKnowledge: {
        my_knowledge_key: "Brand X never bids on competitor terms",
      },
    });

    expect(computeFn).toHaveBeenCalledOnce();
    // executeSkill passes knowledge in options, which then passes to compute
    // The compute function receives (data, knowledge)
    expect(computeFn.mock.calls[0]![1]).toBe(
      "Brand X never bids on competitor terms",
    );
  });

  it("handles skill execution failure gracefully", async () => {
    const goodCompute = vi.fn(async () => ({ status: "ok" }));
    const badCompute = vi.fn(async () => {
      throw new Error("Skill crashed unexpectedly");
    });

    const skills = [
      makeSkill({
        id: "good_skill",
        consumes: ["data_a"],
        compute: goodCompute,
      }),
      makeSkill({
        id: "bad_skill",
        consumes: ["data_b"],
        compute: badCompute,
      }),
    ];
    const registry = makeRegistry(skills);

    const result = await analyzeSkills({
      skillIds: ["good_skill", "bad_skill"],
      data: {
        data_a: { value: 1 },
        data_b: { value: 2 },
      },
      skillRegistry: registry,
      skillKnowledge: {},
    });

    expect(result.outputs).toHaveLength(2);

    const goodOutput = result.outputs.find((o) => o.skillId === "good_skill");
    expect(goodOutput!.result).toEqual({ status: "ok" });
    expect(goodOutput!.error).toBeUndefined();

    const badOutput = result.outputs.find((o) => o.skillId === "bad_skill");
    expect(badOutput!.result).toBeNull();
    expect(badOutput!.error).toBe("Skill crashed unexpectedly");
  });

  it("returns correct stepOutput with counts", async () => {
    const goodCompute = vi.fn(async () => ({ ok: true }));
    const badCompute = vi.fn(async () => {
      throw new Error("fail");
    });

    const skills = [
      makeSkill({ id: "s1", consumes: ["d1"], compute: goodCompute }),
      makeSkill({ id: "s2", consumes: ["d2"], compute: goodCompute }),
      makeSkill({ id: "s3", consumes: ["d3"], compute: badCompute }),
    ];
    const registry = makeRegistry(skills);

    const result = await analyzeSkills({
      skillIds: ["s1", "s2", "s3"],
      data: { d1: {}, d2: {}, d3: {} },
      skillRegistry: registry,
      skillKnowledge: {},
    });

    expect(result.stepOutput.step).toBe("analyze");
    expect(result.stepOutput.duration).toBeGreaterThanOrEqual(0);
    expect(result.stepOutput.data).toEqual({
      total: 3,
      succeeded: 2,
      failed: 1,
    });
  });

  it("passes model option through to executeSkill", async () => {
    const computeFn = vi.fn(async () => ({ done: true }));

    const skills = [
      makeSkill({ id: "model_skill", consumes: ["data_x"], compute: computeFn }),
    ];
    const registry = makeRegistry(skills);

    const result = await analyzeSkills({
      skillIds: ["model_skill"],
      data: { data_x: { value: 1 } },
      skillRegistry: registry,
      skillKnowledge: {},
      model: "claude-opus-4-20250514",
    });

    // Compute skills don't use model, but it should still succeed
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs[0]!.result).toEqual({ done: true });
  });
});
