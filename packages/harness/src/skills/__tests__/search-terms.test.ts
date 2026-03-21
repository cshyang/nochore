import { describe, it, expect } from "vitest";
import { searchTermsSkill } from "../built-in/search-terms";
import { SkillDefinitionSchema } from "../../types/skill";
import { SkillRegistry } from "../registry";

describe("searchTermsSkill", () => {
  it("has a valid skill definition", () => {
    const result = SkillDefinitionSchema.safeParse({
      id: searchTermsSkill.id,
      name: searchTermsSkill.name,
      description: searchTermsSkill.description,
      consumes: searchTermsSkill.consumes,
      outputSchema: searchTermsSkill.outputSchema,
      systemPrompt: searchTermsSkill.systemPrompt,
      knowledgeKey: searchTermsSkill.knowledgeKey,
    });
    expect(result.success).toBe(true);
  });

  it("can be registered in a SkillRegistry", () => {
    const registry = new SkillRegistry();
    expect(() => registry.register(searchTermsSkill)).not.toThrow();
    expect(registry.get("search_terms")).toBe(searchTermsSkill);
  });

  it("has id 'search_terms'", () => {
    expect(searchTermsSkill.id).toBe("search_terms");
  });

  it("consumes search_terms and ad_metrics data types", () => {
    expect(searchTermsSkill.consumes).toContain("search_terms");
    expect(searchTermsSkill.consumes).toContain("ad_metrics");
  });

  it("is LLM-powered (has systemPrompt, no compute)", () => {
    expect(searchTermsSkill.systemPrompt).toBeDefined();
    expect(searchTermsSkill.systemPrompt!.length).toBeGreaterThan(100);
    expect(searchTermsSkill.compute).toBeUndefined();
  });

  it("has knowledgeKey for client-specific context", () => {
    expect(searchTermsSkill.knowledgeKey).toBe("search_terms");
  });

  it("has an outputSchema with expected top-level fields", () => {
    const schema = searchTermsSkill.outputSchema;
    expect(schema.type).toBe("object");

    const properties = schema.properties as Record<string, unknown>;
    expect(properties).toBeDefined();

    // Should include the key insight categories
    expect(properties.wastefulTerms).toBeDefined();
    expect(properties.negativeKeywordRecommendations).toBeDefined();
    expect(properties.highIntentTerms).toBeDefined();
    expect(properties.summary).toBeDefined();
  });

  it("systemPrompt mentions key analysis concepts", () => {
    const prompt = searchTermsSkill.systemPrompt!;
    expect(prompt).toContain("search term");
    expect(prompt).toContain("negative keyword");
    expect(prompt).toContain("conversion");
  });

  it("outputSchema wastefulTerms has correct item structure", () => {
    const properties = searchTermsSkill.outputSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    const wasteful = properties.wastefulTerms as Record<string, unknown>;
    expect(wasteful.type).toBe("array");

    const items = wasteful.items as Record<string, Record<string, unknown>>;
    expect(items.properties.searchTerm).toBeDefined();
    expect(items.properties.spend).toBeDefined();
    expect(items.properties.reason).toBeDefined();
  });

  it("outputSchema negativeKeywordRecommendations has match type", () => {
    const properties = searchTermsSkill.outputSchema.properties as Record<
      string,
      Record<string, unknown>
    >;
    const negatives = properties.negativeKeywordRecommendations as Record<
      string,
      unknown
    >;
    expect(negatives.type).toBe("array");

    const items = negatives.items as Record<string, Record<string, unknown>>;
    expect(items.properties.keyword).toBeDefined();
    expect(items.properties.matchType).toBeDefined();
    expect(items.properties.campaignId).toBeDefined();
  });
});
