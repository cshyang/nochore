import { describe, expect, it } from "vitest";
import { getSuggestionsForAgent, DEFAULT_SUGGESTIONS } from "./chat-suggestions";

describe("getSuggestionsForAgent", () => {
  it("returns skill-specific suggestions when first skill matches", () => {
    const result = getSuggestionsForAgent({ skills: ["google-ads-optimizer", "other-skill"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.title).toBe("Why is CPL up this week?");
  });

  it("falls back to defaults when no skills match", () => {
    const result = getSuggestionsForAgent({ skills: ["unknown-skill"] });
    expect(result).toEqual(DEFAULT_SUGGESTIONS);
  });

  it("falls back to defaults when skills is empty", () => {
    const result = getSuggestionsForAgent({ skills: [] });
    expect(result).toEqual(DEFAULT_SUGGESTIONS);
  });

  it("uses only the first skill (no blending)", () => {
    const result = getSuggestionsForAgent({ skills: ["unknown-first", "google-ads-optimizer"] });
    expect(result).toEqual(DEFAULT_SUGGESTIONS);
  });
});
