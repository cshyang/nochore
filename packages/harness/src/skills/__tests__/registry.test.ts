import { describe, it, expect } from "vitest";
import { SkillRegistry } from "../registry";
import type { SkillDefinition } from "../../types/skill";
import type { AgentConfig } from "../../types/agent-config";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSkill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: "search_terms",
    name: "Search Terms Analyzer",
    description: "Analyzes search term reports for wasteful spend",
    consumes: ["search_term_report"],
    outputSchema: {
      type: "object",
      properties: {
        negatives: { type: "array", items: { type: "string" } },
      },
    },
    systemPrompt: "Analyze the following search term data...",
    ...overrides,
  };
}

function makeAgentConfig(
  overrides: Partial<AgentConfig> = {},
): AgentConfig {
  return {
    id: "agent_001",
    projectId: "proj_001",
    name: "Test Agent",
    description: "A test agent",
    intent: "Monitor ad spend",
    workspacePath: "/tmp/agent_001",
    skills: ["search_terms"],
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
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// SkillRegistry — register
// ---------------------------------------------------------------------------
describe("SkillRegistry", () => {
  describe("register", () => {
    it("registers a valid skill", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill();
      registry.register(skill);
      expect(registry.get("search_terms")).toBe(skill);
    });

    it("registers a skill with a compute function", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill({
        id: "deterministic_skill",
        compute: (data) => ({ result: data }),
      });
      registry.register(skill);
      expect(registry.get("deterministic_skill")).toBe(skill);
    });

    it("throws on duplicate skill id", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill();
      registry.register(skill);
      expect(() => registry.register(skill)).toThrow(
        'Skill "search_terms" is already registered',
      );
    });

    it("throws on invalid skill definition (missing id)", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill({ id: "" });
      expect(() => registry.register(skill)).toThrow();
    });

    it("throws on invalid skill definition (missing name)", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill({ name: "" });
      expect(() => registry.register(skill)).toThrow();
    });

    it("throws on invalid skill definition (missing description)", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill({ description: "" });
      expect(() => registry.register(skill)).toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // SkillRegistry — get
  // ---------------------------------------------------------------------------
  describe("get", () => {
    it("returns a registered skill by id", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill();
      registry.register(skill);
      expect(registry.get("search_terms")).toBe(skill);
    });

    it("throws when skill id is not found", () => {
      const registry = new SkillRegistry();
      expect(() => registry.get("nonexistent")).toThrow(
        'Skill "nonexistent" not found in registry',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // SkillRegistry — list
  // ---------------------------------------------------------------------------
  describe("list", () => {
    it("returns empty array when no skills registered", () => {
      const registry = new SkillRegistry();
      expect(registry.list()).toEqual([]);
    });

    it("returns all registered skills", () => {
      const registry = new SkillRegistry();
      const skill1 = makeSkill({ id: "skill_1", name: "Skill One" });
      const skill2 = makeSkill({ id: "skill_2", name: "Skill Two" });
      registry.register(skill1);
      registry.register(skill2);
      const result = registry.list();
      expect(result).toHaveLength(2);
      expect(result).toContain(skill1);
      expect(result).toContain(skill2);
    });
  });

  // ---------------------------------------------------------------------------
  // SkillRegistry — getForAgent
  // ---------------------------------------------------------------------------
  describe("getForAgent", () => {
    it("returns skills matching agent config skill ids", () => {
      const registry = new SkillRegistry();
      const skill1 = makeSkill({ id: "search_terms", name: "Search Terms" });
      const skill2 = makeSkill({ id: "quality_score", name: "Quality Score" });
      const skill3 = makeSkill({ id: "impression_share", name: "Impression Share" });
      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      const config = makeAgentConfig({
        skills: ["search_terms", "quality_score"],
      });
      const result = registry.getForAgent(config);
      expect(result).toHaveLength(2);
      expect(result).toContain(skill1);
      expect(result).toContain(skill2);
      expect(result).not.toContain(skill3);
    });

    it("returns empty array when agent has no skills", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill();
      registry.register(skill);

      const config = makeAgentConfig({ skills: [] });
      const result = registry.getForAgent(config);
      expect(result).toEqual([]);
    });

    it("throws when agent references a skill not in registry", () => {
      const registry = new SkillRegistry();
      const skill = makeSkill({ id: "search_terms" });
      registry.register(skill);

      const config = makeAgentConfig({
        skills: ["search_terms", "nonexistent_skill"],
      });
      expect(() => registry.getForAgent(config)).toThrow(
        'Skill "nonexistent_skill" not found in registry',
      );
    });

    it("preserves order from agent config", () => {
      const registry = new SkillRegistry();
      const skill1 = makeSkill({ id: "alpha", name: "Alpha" });
      const skill2 = makeSkill({ id: "beta", name: "Beta" });
      const skill3 = makeSkill({ id: "gamma", name: "Gamma" });
      registry.register(skill1);
      registry.register(skill2);
      registry.register(skill3);

      const config = makeAgentConfig({
        skills: ["gamma", "alpha", "beta"],
      });
      const result = registry.getForAgent(config);
      expect(result[0].id).toBe("gamma");
      expect(result[1].id).toBe("alpha");
      expect(result[2].id).toBe("beta");
    });
  });
});
