import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SkillDefinition } from "../../types/skill";

// ---------------------------------------------------------------------------
// Mock the `ai` module before importing the executor
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

import { executeSkill } from "../executor";
import { generateObject } from "ai";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "test_skill",
    name: "Test Skill",
    description: "A test skill",
    consumes: ["test_data"],
    outputSchema: {
      type: "object",
      properties: {
        result: { type: "string" },
      },
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Deterministic path (compute function)
// ---------------------------------------------------------------------------
describe("executeSkill — deterministic path", () => {
  it("calls compute with data and returns result", async () => {
    const computeFn = vi.fn((data) => ({ negatives: ["free", "cheap"] }));
    const skill = makeSkill({ compute: computeFn });
    const data = { terms: ["free wallpaper", "cheap wallpaper"] };

    const result = await executeSkill(skill, data);

    expect(computeFn).toHaveBeenCalledWith(data, undefined);
    expect(result).toEqual({ negatives: ["free", "cheap"] });
  });

  it("passes knowledge to compute function", async () => {
    const computeFn = vi.fn((data, knowledge) => ({
      analysis: "done",
      usedKnowledge: !!knowledge,
    }));
    const skill = makeSkill({ compute: computeFn });
    const data = { terms: ["test"] };
    const knowledge = "Brand-specific exclusions: competitor names";

    const result = await executeSkill(skill, data, { knowledge });

    expect(computeFn).toHaveBeenCalledWith(data, knowledge);
    expect(result).toEqual({ analysis: "done", usedKnowledge: true });
  });

  it("handles async compute functions", async () => {
    const computeFn = vi.fn(async (data) => {
      return { processed: true };
    });
    const skill = makeSkill({ compute: computeFn });
    const data = { input: "test" };

    const result = await executeSkill(skill, data);

    expect(result).toEqual({ processed: true });
  });

  it("validates output against outputSchema (Zod)", async () => {
    // When outputSchema has a _def property (Zod schema), executor should validate
    const { z } = await import("zod");
    const zodSchema = z.object({ count: z.number() });
    const computeFn = vi.fn(() => ({ count: "not a number" }));
    const skill = makeSkill({
      compute: computeFn,
      outputSchema: zodSchema as unknown as Record<string, unknown>,
    });

    await expect(executeSkill(skill, {})).rejects.toThrow();
  });

  it("passes validation when output matches Zod schema", async () => {
    const { z } = await import("zod");
    const zodSchema = z.object({ count: z.number() });
    const computeFn = vi.fn(() => ({ count: 42 }));
    const skill = makeSkill({
      compute: computeFn,
      outputSchema: zodSchema as unknown as Record<string, unknown>,
    });

    const result = await executeSkill(skill, {});
    expect(result).toEqual({ count: 42 });
  });
});

// ---------------------------------------------------------------------------
// LLM path (systemPrompt + generateObject)
// ---------------------------------------------------------------------------
describe("executeSkill — LLM path", () => {
  const mockedGenerateObject = vi.mocked(generateObject);

  beforeEach(() => {
    mockedGenerateObject.mockReset();
  });

  it("calls generateObject with correct parameters", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { sentiment: "positive" },
    } as any);

    const skill = makeSkill({
      systemPrompt: "Analyze sentiment of the following data.",
      outputSchema: {
        type: "object",
        properties: { sentiment: { type: "string" } },
      },
    });
    const data = { text: "Great campaign performance!" };

    const result = await executeSkill(skill, data);

    expect(mockedGenerateObject).toHaveBeenCalledOnce();
    const callArgs = mockedGenerateObject.mock.calls[0][0];
    expect(callArgs.system).toBe(
      "Analyze sentiment of the following data.",
    );
    expect(callArgs.prompt).toBe(JSON.stringify(data));
    expect(result).toEqual({ sentiment: "positive" });
  });

  it("includes knowledge in system prompt when provided", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { recommendation: "pause" },
    } as any);

    const skill = makeSkill({
      systemPrompt: "Analyze campaign data.",
    });
    const data = { spend: 1000 };
    const knowledge = "Client prefers conservative spending.";

    await executeSkill(skill, data, { knowledge });

    const callArgs = mockedGenerateObject.mock.calls[0][0];
    expect(callArgs.system).toBe(
      "Analyze campaign data.\n\nDomain knowledge:\nClient prefers conservative spending.",
    );
  });

  it("does not append knowledge section when knowledge is not provided", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { ok: true },
    } as any);

    const skill = makeSkill({
      systemPrompt: "Do analysis.",
    });

    await executeSkill(skill, {});

    const callArgs = mockedGenerateObject.mock.calls[0][0];
    expect(callArgs.system).toBe("Do analysis.");
    expect(callArgs.system).not.toContain("Domain knowledge");
  });

  it("passes the output schema via jsonSchema()", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { items: [] },
    } as any);

    const schema = {
      type: "object",
      properties: { items: { type: "array" } },
    };
    const skill = makeSkill({
      systemPrompt: "Analyze.",
      outputSchema: schema,
    });

    await executeSkill(skill, {});

    const callArgs = mockedGenerateObject.mock.calls[0][0];
    // jsonSchema is mocked to pass through, so schema should be the same object
    expect(callArgs.schema).toEqual(schema);
  });

  it("uses custom model when provided", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { result: "ok" },
    } as any);

    const skill = makeSkill({
      systemPrompt: "Analyze.",
    });

    await executeSkill(skill, {}, { model: "claude-sonnet-4-20250514" });

    const callArgs = mockedGenerateObject.mock.calls[0][0];
    // The model should be set (we verify it was called with a model object)
    expect(callArgs.model).toBeDefined();
  });

  it("returns the object from generateObject result", async () => {
    const expected = { keywords: ["free", "cheap"], confidence: 0.95 };
    mockedGenerateObject.mockResolvedValue({
      object: expected,
    } as any);

    const skill = makeSkill({ systemPrompt: "Analyze." });
    const result = await executeSkill(skill, { terms: ["free wallpaper"] });

    expect(result).toEqual(expected);
  });
});

// ---------------------------------------------------------------------------
// Error cases
// ---------------------------------------------------------------------------
describe("executeSkill — error cases", () => {
  it("throws when skill has neither compute nor systemPrompt", async () => {
    const skill = makeSkill({
      compute: undefined,
      systemPrompt: undefined,
    });

    await expect(executeSkill(skill, {})).rejects.toThrow(
      'Skill "test_skill" has neither compute nor systemPrompt',
    );
  });

  it("prefers compute over systemPrompt when both are present", async () => {
    const computeFn = vi.fn(() => ({ fromCompute: true }));
    const skill = makeSkill({
      compute: computeFn,
      systemPrompt: "This should not be used.",
    });

    const result = await executeSkill(skill, {});

    expect(computeFn).toHaveBeenCalled();
    expect(result).toEqual({ fromCompute: true });
  });
});
