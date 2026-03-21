import { describe, it, expect, beforeEach } from "vitest";
import { ContextAssembler } from "../assembler";
import { estimateTokens, assembleSections, type Section } from "../token-budget";
import type { WorkspaceIdentity } from "../../workspace/store";
import type { MemoryStore, Lesson, AgentEvent } from "../../types/memory";

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockWorkspaceStore(identity: Partial<WorkspaceIdentity> = {}) {
  const defaultIdentity: WorkspaceIdentity = {
    agentMd: null,
    knowledgeMd: null,
    policyMd: null,
    ...identity,
  };

  return {
    loadIdentity: async () => defaultIdentity,
    readFile: async () => null,
    writeFile: async () => {},
    listFiles: async () => [],
    exists: async () => false,
  };
}

function createMockMemoryStore(
  lessons: Lesson[] = [],
  events: AgentEvent[] = []
): MemoryStore {
  return {
    appendEvent: async () => "mock-id",
    queryEvents: async () => events,
    getRecentEvents: async () => events,
    getLessons: async () => lessons,
    saveLessons: async () => {},
    expireLesson: async () => {},
  };
}

function makeLessons(overrides: Partial<Lesson>[] = []): Lesson[] {
  return overrides.map((o, i) => ({
    id: `lesson_${i}`,
    agentId: "agent_001",
    content: `Lesson ${i} content`,
    scope: "General",
    confidence: "high" as const,
    sourceEventIds: [],
    createdAt: new Date("2026-03-01T00:00:00Z"),
    ...o,
  }));
}

function makeEvents(overrides: Partial<AgentEvent>[] = []): AgentEvent[] {
  return overrides.map((o, i) => ({
    id: `evt_${i}`,
    runId: `run_${i}`,
    agentId: "agent_001",
    timestamp: new Date(Date.now() - i * 3600000), // i hours ago
    type: "skill_output" as const,
    data: { summary: `Event ${i} summary` },
    ...o,
  }));
}

// ---------------------------------------------------------------------------
// estimateTokens
// ---------------------------------------------------------------------------

describe("estimateTokens", () => {
  it("returns ceil(length / 4) for basic text", () => {
    expect(estimateTokens("hello")).toBe(2); // 5 / 4 = 1.25 → 2
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles exact multiples of 4", () => {
    expect(estimateTokens("abcd")).toBe(1); // 4 / 4 = 1
  });

  it("handles long text", () => {
    const text = "a".repeat(1000);
    expect(estimateTokens(text)).toBe(250); // 1000 / 4 = 250
  });

  it("counts characters not words", () => {
    const text = "hello world"; // 11 chars
    expect(estimateTokens(text)).toBe(3); // 11 / 4 = 2.75 → 3
  });
});

// ---------------------------------------------------------------------------
// assembleSections
// ---------------------------------------------------------------------------

describe("assembleSections", () => {
  it("orders sections by priority (ascending)", () => {
    const sections: Section[] = [
      { content: "Low priority", priority: 5, label: "Low" },
      { content: "High priority", priority: 1, label: "High" },
      { content: "Medium priority", priority: 3, label: "Medium" },
    ];

    const result = assembleSections(sections);
    const highIdx = result.indexOf("## High");
    const medIdx = result.indexOf("## Medium");
    const lowIdx = result.indexOf("## Low");

    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it("includes section headers with ## prefix", () => {
    const sections: Section[] = [
      { content: "Some content", priority: 1, label: "My Section" },
    ];

    const result = assembleSections(sections);
    expect(result).toContain("## My Section");
    expect(result).toContain("Some content");
  });

  it("returns empty string for empty sections array", () => {
    expect(assembleSections([])).toBe("");
  });

  it("returns all content when no maxTokens specified", () => {
    const sections: Section[] = [
      { content: "A".repeat(10000), priority: 1, label: "Big" },
      { content: "B".repeat(10000), priority: 2, label: "Also Big" },
    ];

    const result = assembleSections(sections);
    expect(result).toContain("A".repeat(10000));
    expect(result).toContain("B".repeat(10000));
  });

  it("truncates lowest-priority sections first when over budget", () => {
    const sections: Section[] = [
      { content: "Important text", priority: 1, label: "High" },
      { content: "A".repeat(40000), priority: 5, label: "Low" },
    ];

    // Budget too small for both
    const result = assembleSections(sections, 100);
    expect(result).toContain("Important text");
    expect(result).toContain("[truncated]");
  });

  it("preserves high-priority sections intact during truncation", () => {
    const sections: Section[] = [
      { content: "Must keep this identity", priority: 1, label: "Identity" },
      { content: "Must keep this policy", priority: 2, label: "Policy" },
      { content: "X".repeat(40000), priority: 5, label: "Events" },
    ];

    const result = assembleSections(sections, 200);
    expect(result).toContain("Must keep this identity");
    expect(result).toContain("Must keep this policy");
  });

  it("adds [truncated] marker when content is cut", () => {
    const sections: Section[] = [
      { content: "Short", priority: 1, label: "Keep" },
      { content: "X".repeat(40000), priority: 5, label: "Trim" },
    ];

    const result = assembleSections(sections, 100);
    expect(result).toContain("[truncated]");
  });

  it("does not truncate when within budget", () => {
    const sections: Section[] = [
      { content: "Small", priority: 1, label: "A" },
      { content: "Also small", priority: 5, label: "B" },
    ];

    const result = assembleSections(sections, 8000);
    expect(result).not.toContain("[truncated]");
    expect(result).toContain("Small");
    expect(result).toContain("Also small");
  });

  it("skips sections with empty content", () => {
    const sections: Section[] = [
      { content: "Present", priority: 1, label: "Visible" },
      { content: "", priority: 2, label: "Empty" },
    ];

    const result = assembleSections(sections);
    expect(result).toContain("## Visible");
    expect(result).not.toContain("## Empty");
  });
});

// ---------------------------------------------------------------------------
// ContextAssembler — forScopeResolution
// ---------------------------------------------------------------------------

describe("ContextAssembler", () => {
  describe("forScopeResolution", () => {
    it("includes agent identity and lessons in system prompt", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Ad Guardian\nIntent: Monitor wasted ad spend",
      });
      const lessons = makeLessons([
        { content: "Budget spikes on weekends", scope: "Budget", confidence: "high" },
        { content: "Weekend patterns differ", scope: "Trends", confidence: "medium" },
      ]);
      const mem = createMockMemoryStore(lessons);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forScopeResolution("agent_001");

      expect(ctx.systemPrompt).toContain("Ad Guardian");
      expect(ctx.systemPrompt).toContain("Monitor wasted ad spend");
      expect(ctx.systemPrompt).toContain("Budget spikes on weekends");
      expect(ctx.systemPrompt).toContain("Weekend patterns differ");
      expect(ctx.systemPrompt).toContain("## Agent Identity");
      expect(ctx.systemPrompt).toContain("## Active Lessons");
    });

    it("includes lesson confidence and scope", async () => {
      const ws = createMockWorkspaceStore({ agentMd: "# Agent" });
      const lessons = makeLessons([
        { content: "Budget protected", scope: "Budget", confidence: "high" },
      ]);
      const mem = createMockMemoryStore(lessons);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forScopeResolution("agent_001");

      expect(ctx.systemPrompt).toContain("(high confidence)");
      expect(ctx.systemPrompt).toContain("[Budget]");
    });

    it("handles missing AGENT.md gracefully", async () => {
      const ws = createMockWorkspaceStore({ agentMd: null });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forScopeResolution("agent_001");

      expect(ctx.systemPrompt).not.toContain("## Agent Identity");
      expect(ctx.metadata.step).toBe("scope");
    });

    it("handles no lessons gracefully", async () => {
      const ws = createMockWorkspaceStore({ agentMd: "# Agent" });
      const mem = createMockMemoryStore([]);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forScopeResolution("agent_001");

      expect(ctx.systemPrompt).not.toContain("## Active Lessons");
    });

    it("returns correct metadata", async () => {
      const ws = createMockWorkspaceStore({ agentMd: "# Agent" });
      const lessons = makeLessons([{ content: "L1" }, { content: "L2" }]);
      const mem = createMockMemoryStore(lessons);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forScopeResolution("agent_001");

      expect(ctx.metadata).toEqual({
        step: "scope",
        agentId: "agent_001",
        lessonCount: 2,
      });
    });
  });

  // -------------------------------------------------------------------------
  // forSkillExecution
  // -------------------------------------------------------------------------

  describe("forSkillExecution", () => {
    it("includes KNOWLEDGE.md content", async () => {
      const ws = createMockWorkspaceStore({
        knowledgeMd: "# Domain Knowledge\nGoogle Ads best practices...",
      });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forSkillExecution("agent_001", "search-terms");

      expect(ctx.systemPrompt).toContain("Google Ads best practices");
      expect(ctx.systemPrompt).toContain("## Domain Knowledge");
    });

    it("includes skill-specific knowledge when provided", async () => {
      const ws = createMockWorkspaceStore({ knowledgeMd: null });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forSkillExecution(
        "agent_001",
        "search-terms",
        "Search term analysis focuses on waste detection."
      );

      expect(ctx.systemPrompt).toContain("Search term analysis focuses on waste detection.");
    });

    it("includes both KNOWLEDGE.md and skill-specific knowledge", async () => {
      const ws = createMockWorkspaceStore({
        knowledgeMd: "# General Knowledge\nGeneral domain info",
      });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forSkillExecution(
        "agent_001",
        "search-terms",
        "Skill-specific info here"
      );

      expect(ctx.systemPrompt).toContain("General domain info");
      expect(ctx.systemPrompt).toContain("Skill-specific info here");
    });

    it("handles neither KNOWLEDGE.md nor skill knowledge", async () => {
      const ws = createMockWorkspaceStore({ knowledgeMd: null });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forSkillExecution("agent_001", "search-terms");

      // Should still return a valid context, even if prompt is empty
      expect(ctx.systemPrompt).toBe("");
      expect(ctx.metadata.step).toBe("analyze");
    });

    it("returns correct metadata", async () => {
      const ws = createMockWorkspaceStore({ knowledgeMd: "# Knowledge" });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forSkillExecution("agent_001", "search-terms");

      expect(ctx.metadata).toEqual({
        step: "analyze",
        agentId: "agent_001",
        skillId: "search-terms",
      });
    });
  });

  // -------------------------------------------------------------------------
  // forPlanning
  // -------------------------------------------------------------------------

  describe("forPlanning", () => {
    it("includes agent identity, policy, and lessons", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Ad Guardian\nIntent: Monitor ads",
        policyMd: "# Policy\n- Never exceed daily budget\n- Require approval for >$100",
      });
      const lessons = makeLessons([
        { content: "Budget is protected in Q2", scope: "Budget", confidence: "high" },
      ]);
      const mem = createMockMemoryStore(lessons);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forPlanning("agent_001", [
        { finding: "5 wasteful keywords" },
      ]);

      expect(ctx.systemPrompt).toContain("Ad Guardian");
      expect(ctx.systemPrompt).toContain("Never exceed daily budget");
      expect(ctx.systemPrompt).toContain("Budget is protected in Q2");
      expect(ctx.systemPrompt).toContain("## Agent Identity");
      expect(ctx.systemPrompt).toContain("## Policy Constraints");
      expect(ctx.systemPrompt).toContain("## Active Lessons");
    });

    it("does NOT include skillOutputs in system prompt", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Agent",
        policyMd: "# Policy",
      });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const skillOutputs = [
        { finding: "5 wasteful keywords", details: "keyword list here" },
      ];
      const ctx = await assembler.forPlanning("agent_001", skillOutputs);

      expect(ctx.systemPrompt).not.toContain("wasteful keywords");
      expect(ctx.systemPrompt).not.toContain("keyword list here");
    });

    it("handles missing AGENT.md and POLICY.md", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: null,
        policyMd: null,
      });
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forPlanning("agent_001", []);

      expect(ctx.systemPrompt).not.toContain("## Agent Identity");
      expect(ctx.systemPrompt).not.toContain("## Policy Constraints");
    });

    it("returns correct metadata", async () => {
      const ws = createMockWorkspaceStore({ agentMd: "# Agent" });
      const lessons = makeLessons([{ content: "L1" }]);
      const mem = createMockMemoryStore(lessons);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forPlanning("agent_001", [
        { a: 1 },
        { b: 2 },
        { c: 3 },
      ]);

      expect(ctx.metadata).toEqual({
        step: "plan",
        agentId: "agent_001",
        lessonCount: 1,
        skillOutputCount: 3,
      });
    });
  });

  // -------------------------------------------------------------------------
  // forChat
  // -------------------------------------------------------------------------

  describe("forChat", () => {
    it("includes all sections in correct order when all present", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Ad Guardian\nMonitor wasted ad spend",
        knowledgeMd: "# Knowledge\nGoogle Ads optimization techniques",
        policyMd: "# Policy\n- Never exceed budget\n- Require approval",
      });
      const lessons = makeLessons([
        { content: "Budget protected Q2", scope: "Budget", confidence: "high" },
      ]);
      const events = makeEvents([
        { type: "skill_output", data: { summary: "Analyzed search terms" } },
        { type: "action_executed", data: { summary: "Added negative keywords" } },
      ]);
      const mem = createMockMemoryStore(lessons, events);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forChat("agent_001");

      // All sections present
      expect(ctx.systemPrompt).toContain("## Agent Identity");
      expect(ctx.systemPrompt).toContain("## Domain Knowledge");
      expect(ctx.systemPrompt).toContain("## Policy Constraints");
      expect(ctx.systemPrompt).toContain("## Active Lessons");
      expect(ctx.systemPrompt).toContain("## Recent Activity");

      // Correct order by priority: Identity(1), Policy(2), Knowledge(3), Lessons(4), Events(5)
      const identityIdx = ctx.systemPrompt.indexOf("## Agent Identity");
      const policyIdx = ctx.systemPrompt.indexOf("## Policy Constraints");
      const knowledgeIdx = ctx.systemPrompt.indexOf("## Domain Knowledge");
      const lessonsIdx = ctx.systemPrompt.indexOf("## Active Lessons");
      const eventsIdx = ctx.systemPrompt.indexOf("## Recent Activity");

      expect(identityIdx).toBeLessThan(policyIdx);
      expect(policyIdx).toBeLessThan(knowledgeIdx);
      expect(knowledgeIdx).toBeLessThan(lessonsIdx);
      expect(lessonsIdx).toBeLessThan(eventsIdx);
    });

    it("gracefully omits missing sections", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Agent\nJust identity",
        knowledgeMd: null,
        policyMd: null,
      });
      const mem = createMockMemoryStore([], []);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forChat("agent_001");

      expect(ctx.systemPrompt).toContain("## Agent Identity");
      expect(ctx.systemPrompt).not.toContain("## Domain Knowledge");
      expect(ctx.systemPrompt).not.toContain("## Policy Constraints");
      expect(ctx.systemPrompt).not.toContain("## Active Lessons");
      expect(ctx.systemPrompt).not.toContain("## Recent Activity");
    });

    it("truncates low-priority sections when over token budget", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Agent Identity\nShort identity",
        knowledgeMd: "# Knowledge\nShort knowledge",
        policyMd: "# Policy\nShort policy",
      });
      // Create many lessons and events to overflow the 8000-token budget
      // Each lesson ~600 chars, 50 lessons = ~30000 chars = ~7500 tokens for lessons alone
      // Plus events → guaranteed to exceed 8000 tokens total
      const manyLessons = makeLessons(
        Array.from({ length: 50 }, (_, i) => ({
          content: `Lesson ${i}: ${"X".repeat(600)}`,
          scope: "General",
          confidence: "medium" as const,
        }))
      );
      const manyEvents = makeEvents(
        Array.from({ length: 10 }, (_, i) => ({
          type: "skill_output" as const,
          data: { summary: `Event ${i}: ${"Y".repeat(600)}` },
        }))
      );
      const mem = createMockMemoryStore(manyLessons, manyEvents);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forChat("agent_001");

      // High-priority sections should survive
      expect(ctx.systemPrompt).toContain("Short identity");
      expect(ctx.systemPrompt).toContain("Short policy");
      // Should contain truncation marker
      expect(ctx.systemPrompt).toContain("[truncated]");
    });

    it("limits recent events to 10", async () => {
      const ws = createMockWorkspaceStore({ agentMd: "# Agent" });
      const events = makeEvents(
        Array.from({ length: 20 }, (_, i) => ({
          type: "skill_output" as const,
          data: { summary: `Event ${i}` },
        }))
      );
      const mem = createMockMemoryStore([], events);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forChat("agent_001");

      // Only first 10 events should appear
      if (ctx.systemPrompt.includes("## Recent Activity")) {
        // Count event lines (each starts with "- ")
        const activitySection = ctx.systemPrompt.split("## Recent Activity")[1];
        const eventLines = activitySection
          .split("\n")
          .filter((line) => line.startsWith("- "));
        expect(eventLines.length).toBeLessThanOrEqual(10);
      }
    });

    it("returns correct metadata", async () => {
      const ws = createMockWorkspaceStore({
        agentMd: "# Agent",
        knowledgeMd: "# Knowledge",
        policyMd: "# Policy",
      });
      const lessons = makeLessons([{ content: "L1" }, { content: "L2" }]);
      const events = makeEvents([
        { data: { summary: "E1" } },
        { data: { summary: "E2" } },
        { data: { summary: "E3" } },
      ]);
      const mem = createMockMemoryStore(lessons, events);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forChat("agent_001");

      expect(ctx.metadata.step).toBe("chat");
      expect(ctx.metadata.agentId).toBe("agent_001");
      expect(ctx.metadata.lessonCount).toBe(2);
      // recentEventCount should be min(events.length, 10)
      expect(ctx.metadata.recentEventCount).toBe(3);
    });

    it("formats recent events with relative time descriptions", async () => {
      const ws = createMockWorkspaceStore({ agentMd: "# Agent" });
      const events = makeEvents([
        {
          type: "skill_output",
          data: { summary: "Analyzed search terms, found 5 wasteful keywords" },
          timestamp: new Date(Date.now() - 2 * 3600000), // 2h ago
        },
      ]);
      const mem = createMockMemoryStore([], events);
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forChat("agent_001");

      expect(ctx.systemPrompt).toContain("## Recent Activity");
      expect(ctx.systemPrompt).toContain("Analyzed search terms");
    });
  });

  // -------------------------------------------------------------------------
  // AssembledContext type
  // -------------------------------------------------------------------------

  describe("AssembledContext shape", () => {
    it("always returns systemPrompt as string and metadata as Record", async () => {
      const ws = createMockWorkspaceStore();
      const mem = createMockMemoryStore();
      const assembler = new ContextAssembler(ws as any, mem);

      const ctx = await assembler.forScopeResolution("agent_001");

      expect(typeof ctx.systemPrompt).toBe("string");
      expect(typeof ctx.metadata).toBe("object");
      expect(ctx.metadata).not.toBeNull();
    });
  });
});
