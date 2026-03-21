import { describe, it, expect } from "vitest";
import { AgentEventSchema, LessonSchema, EventFilterSchema } from "../memory";
import { AgentConfigSchema, TriggerConfigSchema } from "../agent-config";
import { RunResultSchema, TriggerEventSchema, StepOutputSchema } from "../run";

// ---------------------------------------------------------------------------
// AgentEvent
// ---------------------------------------------------------------------------
describe("AgentEvent", () => {
  it("validates a skill_output event", () => {
    const event = {
      id: "evt_001",
      runId: "run_047",
      agentId: "agent_123",
      timestamp: new Date(),
      type: "skill_output",
      data: { skillId: "search_terms", findings: 5 },
    };
    expect(AgentEventSchema.safeParse(event).success).toBe(true);
  });

  it("rejects event with invalid type", () => {
    const event = {
      id: "evt_002",
      runId: "run_047",
      agentId: "agent_123",
      timestamp: new Date(),
      type: "invalid_type",
      data: {},
    };
    expect(AgentEventSchema.safeParse(event).success).toBe(false);
  });

  it("validates all event types", () => {
    const types = [
      "run_started",
      "scope_resolved",
      "data_fetched",
      "skill_output",
      "action_proposed",
      "policy_decision",
      "action_executed",
      "user_correction",
      "lesson_distilled",
    ];
    for (const type of types) {
      const event = {
        id: "evt",
        runId: "run",
        agentId: "agent",
        timestamp: new Date(),
        type,
        data: {},
      };
      expect(AgentEventSchema.safeParse(event).success).toBe(true);
    }
  });

  it("rejects event missing required fields", () => {
    const event = { id: "evt_003", type: "run_started" };
    expect(AgentEventSchema.safeParse(event).success).toBe(false);
  });

  it("accepts event with complex nested data", () => {
    const event = {
      id: "evt_004",
      runId: "run_099",
      agentId: "agent_456",
      timestamp: new Date(),
      type: "data_fetched",
      data: {
        source: "google_ads",
        rows: 1500,
        metrics: { impressions: 42000, clicks: 1200 },
      },
    };
    expect(AgentEventSchema.safeParse(event).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Lesson
// ---------------------------------------------------------------------------
describe("Lesson", () => {
  it("validates a lesson with expiry", () => {
    const lesson = {
      id: "les_001",
      agentId: "agent_123",
      content: "Campaign X budget is protected during Q2 push",
      scope: "budget_allocation",
      confidence: "high",
      sourceEventIds: ["evt_042", "evt_044", "evt_047"],
      createdAt: new Date(),
      expiresAt: new Date("2026-07-01"),
    };
    expect(LessonSchema.safeParse(lesson).success).toBe(true);
  });

  it("validates a lesson without expiry", () => {
    const lesson = {
      id: "les_002",
      agentId: "agent_123",
      content:
        "Always check weekend patterns before recommending budget changes",
      scope: "budget_allocation",
      confidence: "medium",
      sourceEventIds: ["evt_050"],
      createdAt: new Date(),
    };
    expect(LessonSchema.safeParse(lesson).success).toBe(true);
  });

  it("rejects invalid confidence level", () => {
    const lesson = {
      id: "les_003",
      agentId: "agent_123",
      content: "test",
      scope: "test",
      confidence: "very_high",
      sourceEventIds: [],
      createdAt: new Date(),
    };
    expect(LessonSchema.safeParse(lesson).success).toBe(false);
  });

  it("validates all confidence levels", () => {
    for (const confidence of ["high", "medium", "low"]) {
      const lesson = {
        id: "les",
        agentId: "agent",
        content: "c",
        scope: "s",
        confidence,
        sourceEventIds: [],
        createdAt: new Date(),
      };
      expect(LessonSchema.safeParse(lesson).success).toBe(true);
    }
  });

  it("rejects lesson missing required fields", () => {
    const lesson = { id: "les_004", content: "test" };
    expect(LessonSchema.safeParse(lesson).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EventFilter
// ---------------------------------------------------------------------------
describe("EventFilter", () => {
  it("validates an empty filter", () => {
    expect(EventFilterSchema.safeParse({}).success).toBe(true);
  });

  it("validates a filter with all fields", () => {
    const filter = {
      agentId: "agent_123",
      runId: "run_047",
      type: "skill_output",
      since: new Date(),
      limit: 50,
    };
    expect(EventFilterSchema.safeParse(filter).success).toBe(true);
  });

  it("validates a filter with array of types", () => {
    const filter = {
      agentId: "agent_123",
      type: ["skill_output", "action_proposed"],
    };
    expect(EventFilterSchema.safeParse(filter).success).toBe(true);
  });

  it("rejects filter with invalid type value", () => {
    const filter = { type: "bogus_type" };
    expect(EventFilterSchema.safeParse(filter).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AgentConfig
// ---------------------------------------------------------------------------
describe("AgentConfig", () => {
  it("validates a full agent config", () => {
    const config = {
      id: "agent_123",
      projectId: "proj_001",
      name: "Ad Spend Guardian",
      description: "Monitors Google Ads for waste",
      intent: "Find and eliminate wasted ad spend",
      workspacePath: "data/projects/proj_001/agents/agent_123",
      skills: ["search_terms", "budget_allocation"],
      skillKnowledge: { search_terms: "Brand terms: acme, acme corp" },
      triggers: [{ type: "cron", config: { cron: "0 9 * * *" } }],
      policyRules: ["budget_delta", "cooldown"],
      policyOverrides: [],
      globalApprovalRequired: false,
      operationalConstraints: [],
      connectionIds: ["conn_gads_001"],
      memoryEnabled: true,
      lessonDistillationInterval: 5,
      scopeStrategy: "llm",
    };
    expect(AgentConfigSchema.safeParse(config).success).toBe(true);
  });

  it("validates config with optional model and thinkingLevel", () => {
    const config = {
      id: "agent_456",
      projectId: "proj_002",
      name: "Budget Optimizer",
      description: "Optimizes budgets",
      intent: "Maximize ROAS",
      workspacePath: "data/projects/proj_002/agents/agent_456",
      skills: [],
      skillKnowledge: {},
      triggers: [],
      policyRules: [],
      policyOverrides: [],
      globalApprovalRequired: true,
      operationalConstraints: [],
      connectionIds: [],
      memoryEnabled: false,
      lessonDistillationInterval: 10,
      scopeStrategy: "static",
      model: "claude-sonnet-4-20250514",
      thinkingLevel: "high",
    };
    expect(AgentConfigSchema.safeParse(config).success).toBe(true);
  });

  it("rejects config with invalid scopeStrategy", () => {
    const config = {
      id: "agent_789",
      projectId: "proj_003",
      name: "Bad Agent",
      description: "d",
      intent: "i",
      workspacePath: "data/projects/proj_003/agents/agent_789",
      skills: [],
      skillKnowledge: {},
      triggers: [],
      policyRules: [],
      policyOverrides: [],
      globalApprovalRequired: false,
      operationalConstraints: [],
      connectionIds: [],
      memoryEnabled: true,
      lessonDistillationInterval: 1,
      scopeStrategy: "magic",
    };
    expect(AgentConfigSchema.safeParse(config).success).toBe(false);
  });

  it("rejects config with invalid thinkingLevel", () => {
    const config = {
      id: "agent_789",
      projectId: "proj_003",
      name: "Bad Agent",
      description: "d",
      intent: "i",
      workspacePath: "data/projects/proj_003/agents/agent_789",
      skills: [],
      skillKnowledge: {},
      triggers: [],
      policyRules: [],
      policyOverrides: [],
      globalApprovalRequired: false,
      operationalConstraints: [],
      connectionIds: [],
      memoryEnabled: true,
      lessonDistillationInterval: 1,
      scopeStrategy: "llm",
      thinkingLevel: "maximum",
    };
    expect(AgentConfigSchema.safeParse(config).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TriggerConfig
// ---------------------------------------------------------------------------
describe("TriggerConfig", () => {
  it("validates a cron trigger config", () => {
    const trigger = { type: "cron", config: { cron: "0 9 * * *" } };
    expect(TriggerConfigSchema.safeParse(trigger).success).toBe(true);
  });

  it("validates a webhook trigger config with skill override", () => {
    const trigger = {
      type: "webhook",
      config: { url: "/hook/agent_123" },
      skills: ["search_terms"],
    };
    expect(TriggerConfigSchema.safeParse(trigger).success).toBe(true);
  });

  it("validates a manual trigger config", () => {
    const trigger = { type: "manual", config: {} };
    expect(TriggerConfigSchema.safeParse(trigger).success).toBe(true);
  });

  it("rejects trigger with invalid type", () => {
    const trigger = { type: "email", config: {} };
    expect(TriggerConfigSchema.safeParse(trigger).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TriggerEvent
// ---------------------------------------------------------------------------
describe("TriggerEvent", () => {
  it("validates a cron trigger", () => {
    const trigger = { type: "cron", timestamp: new Date() };
    expect(TriggerEventSchema.safeParse(trigger).success).toBe(true);
  });

  it("validates a webhook trigger with metadata", () => {
    const trigger = {
      type: "webhook",
      timestamp: new Date(),
      metadata: { source: "google_ads_alert" },
    };
    expect(TriggerEventSchema.safeParse(trigger).success).toBe(true);
  });

  it("validates a chat trigger", () => {
    const trigger = {
      type: "chat",
      timestamp: new Date(),
      metadata: { message: "Check my campaigns" },
    };
    expect(TriggerEventSchema.safeParse(trigger).success).toBe(true);
  });

  it("validates a manual trigger without metadata", () => {
    const trigger = { type: "manual", timestamp: new Date() };
    expect(TriggerEventSchema.safeParse(trigger).success).toBe(true);
  });

  it("rejects trigger with invalid type", () => {
    const trigger = { type: "email", timestamp: new Date() };
    expect(TriggerEventSchema.safeParse(trigger).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// RunResult
// ---------------------------------------------------------------------------
describe("RunResult", () => {
  it("validates a complete run result", () => {
    const result = {
      runId: "run_047",
      agentId: "agent_123",
      duration: 4500,
      steps: [
        { step: "scope", duration: 200, data: { campaigns: ["c1", "c2"] } },
        {
          step: "analyze",
          duration: 1500,
          data: { findings: 3 },
          llmUsage: { inputTokens: 2000, outputTokens: 500, cost: 0.015 },
        },
      ],
      proposals: [],
      eventsLogged: 8,
    };
    expect(RunResultSchema.safeParse(result).success).toBe(true);
  });

  it("rejects run result with invalid step name", () => {
    const result = {
      runId: "run_048",
      agentId: "agent_123",
      duration: 1000,
      steps: [{ step: "magic", duration: 100, data: {} }],
      proposals: [],
      eventsLogged: 1,
    };
    expect(RunResultSchema.safeParse(result).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// StepOutput
// ---------------------------------------------------------------------------
describe("StepOutput", () => {
  it("validates all step names", () => {
    const steps = [
      "scope",
      "fetch",
      "analyze",
      "plan",
      "policy",
      "execute",
      "memory",
    ];
    for (const step of steps) {
      const output = { step, duration: 100, data: {} };
      expect(StepOutputSchema.safeParse(output).success).toBe(true);
    }
  });

  it("validates step with llmUsage", () => {
    const output = {
      step: "analyze",
      duration: 2000,
      data: { results: [] },
      llmUsage: { inputTokens: 5000, outputTokens: 1200, cost: 0.042 },
    };
    expect(StepOutputSchema.safeParse(output).success).toBe(true);
  });

  it("validates step without llmUsage", () => {
    const output = { step: "fetch", duration: 800, data: { rows: 200 } };
    expect(StepOutputSchema.safeParse(output).success).toBe(true);
  });
});
