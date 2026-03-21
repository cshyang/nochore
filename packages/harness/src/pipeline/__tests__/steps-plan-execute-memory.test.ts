import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ActionProposal, ExecutionResult } from "../../types/action";
import type { AgentEventType } from "../../types/memory";

// ---------------------------------------------------------------------------
// Mock the `ai` module before importing planActions
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

import { planActions } from "../steps/plan";
import { executeActions } from "../steps/execute";
import { writeMemory } from "../steps/memory-write";
import { generateObject } from "ai";
import { StubConnectionManager } from "../../connections/stub";
import { createTestDb } from "../../db/client";
import { SqliteMemoryStore } from "../../memory/store";

// ---------------------------------------------------------------------------
// planActions
// ---------------------------------------------------------------------------
describe("planActions", () => {
  const mockedGenerateObject = vi.mocked(generateObject);

  beforeEach(() => {
    mockedGenerateObject.mockReset();
  });

  it("returns empty proposals when no skill outputs provided", async () => {
    const result = await planActions({
      skillOutputs: [],
      context: { systemPrompt: "You are a planner.", metadata: {} },
    });

    expect(result.proposals).toEqual([]);
    expect(result.stepOutput.step).toBe("plan");
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it("returns empty proposals when all skill outputs are errored", async () => {
    const result = await planActions({
      skillOutputs: [
        { skillId: "skill_a", result: null, error: "fetch failed" },
        { skillId: "skill_b", result: null, error: "timeout" },
      ],
      context: { systemPrompt: "You are a planner.", metadata: {} },
    });

    expect(result.proposals).toEqual([]);
    expect(result.stepOutput.step).toBe("plan");
    expect(mockedGenerateObject).not.toHaveBeenCalled();
  });

  it("sends system prompt and successful skill outputs to generateObject", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        proposals: [
          {
            id: "prop_001",
            action: "add_negative_keyword",
            toolCategory: "google_ads",
            args: { term: "free" },
            reason: "Wasteful spend",
            confidence: 0.9,
            skillSource: "search_terms",
            reversible: true,
          },
        ],
      },
      usage: { promptTokens: 100, completionTokens: 50 },
    } as any);

    const context = {
      systemPrompt: "You are a campaign optimizer.",
      metadata: { step: "plan" },
    };

    const result = await planActions({
      skillOutputs: [
        { skillId: "search_terms", result: { negatives: ["free"] } },
        { skillId: "errored_skill", result: null, error: "broke" },
      ],
      context,
    });

    expect(mockedGenerateObject).toHaveBeenCalledOnce();
    const callArgs = mockedGenerateObject.mock.calls[0]![0];
    expect(callArgs.system).toBe("You are a campaign optimizer.");

    // Should only include the successful skill output in the prompt
    const promptData = JSON.parse(callArgs.prompt as string);
    expect(promptData.skillOutputs).toHaveLength(1);
    expect(promptData.skillOutputs[0].skillId).toBe("search_terms");

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.action).toBe("add_negative_keyword");
  });

  it("generates idempotencyKeys for each proposal", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        proposals: [
          {
            id: "prop_001",
            action: "pause_ad",
            toolCategory: "google_ads",
            args: {},
            reason: "Low CTR",
            confidence: 0.8,
            skillSource: "analyzer",
            reversible: true,
          },
          {
            id: "prop_002",
            action: "update_bid",
            toolCategory: "google_ads",
            args: {},
            reason: "Overbidding",
            confidence: 0.7,
            skillSource: "analyzer",
            reversible: true,
          },
        ],
      },
    } as any);

    const result = await planActions({
      skillOutputs: [
        { skillId: "analyzer", result: { findings: ["low_ctr", "overbid"] } },
      ],
      context: { systemPrompt: "Plan actions.", metadata: {} },
    });

    expect(result.proposals).toHaveLength(2);
    // Each proposal should have an idempotencyKey
    for (const p of result.proposals) {
      expect(p.idempotencyKey).toBeTruthy();
      expect(typeof p.idempotencyKey).toBe("string");
    }
    // Keys should be unique
    expect(result.proposals[0]!.idempotencyKey).not.toBe(
      result.proposals[1]!.idempotencyKey,
    );
  });

  it("generates ids for proposals if LLM did not provide them", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        proposals: [
          {
            action: "pause_ad",
            toolCategory: "google_ads",
            args: {},
            reason: "Low CTR",
            confidence: 0.8,
            skillSource: "analyzer",
            reversible: true,
          },
        ],
      },
    } as any);

    const result = await planActions({
      skillOutputs: [
        { skillId: "analyzer", result: { data: true } },
      ],
      context: { systemPrompt: "Plan.", metadata: {} },
    });

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0]!.id).toBeTruthy();
    expect(typeof result.proposals[0]!.id).toBe("string");
  });

  it("stepOutput has correct step name and duration", async () => {
    const result = await planActions({
      skillOutputs: [],
      context: { systemPrompt: "Plan.", metadata: {} },
    });

    expect(result.stepOutput.step).toBe("plan");
    expect(typeof result.stepOutput.duration).toBe("number");
    expect(result.stepOutput.duration).toBeGreaterThanOrEqual(0);
  });

  it("stepOutput includes proposalCount in data", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        proposals: [
          {
            id: "p1",
            action: "a",
            toolCategory: "t",
            args: {},
            reason: "r",
            confidence: 0.5,
            skillSource: "s",
            reversible: false,
          },
          {
            id: "p2",
            action: "b",
            toolCategory: "t",
            args: {},
            reason: "r",
            confidence: 0.6,
            skillSource: "s",
            reversible: true,
          },
        ],
      },
    } as any);

    const result = await planActions({
      skillOutputs: [{ skillId: "s", result: {} }],
      context: { systemPrompt: "Plan.", metadata: {} },
    });

    const data = result.stepOutput.data as Record<string, unknown>;
    expect(data.proposalCount).toBe(2);
  });

  it("includes llmUsage in stepOutput when LLM is called", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { proposals: [] },
      usage: { promptTokens: 200, completionTokens: 80 },
    } as any);

    const result = await planActions({
      skillOutputs: [{ skillId: "s", result: {} }],
      context: { systemPrompt: "Plan.", metadata: {} },
    });

    expect(result.stepOutput.llmUsage).toBeDefined();
    expect(result.stepOutput.llmUsage!.inputTokens).toBe(200);
    expect(result.stepOutput.llmUsage!.outputTokens).toBe(80);
  });
});

// ---------------------------------------------------------------------------
// executeActions
// ---------------------------------------------------------------------------
describe("executeActions", () => {
  function makeProposal(overrides: Partial<ActionProposal> = {}): ActionProposal {
    return {
      id: "prop_001",
      action: "add_negative_keyword",
      toolCategory: "google_ads",
      args: { term: "free" },
      reason: "Wasteful spend",
      confidence: 0.9,
      skillSource: "search_terms",
      reversible: true,
      idempotencyKey: crypto.randomUUID(),
      ...overrides,
    };
  }

  it("executes approved proposals sequentially via connectionManager", async () => {
    const cm = new StubConnectionManager({
      defaultExecutionResult: {
        proposalId: "prop_default",
        status: "executed",
        output: { ok: true },
        executedAt: new Date(),
      },
    });

    const proposals = [
      makeProposal({ id: "p1", action: "pause_ad" }),
      makeProposal({ id: "p2", action: "update_bid" }),
    ];

    const { results } = await executeActions({
      proposals,
      connectionManager: cm,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.proposalId).toBe("p1");
    expect(results[0]!.status).toBe("executed");
    expect(results[1]!.proposalId).toBe("p2");
    expect(results[1]!.status).toBe("executed");

    // Verify the connection manager received the calls in order
    const log = cm.getExecutionLog();
    expect(log).toHaveLength(2);
    expect(log[0]!.action).toBe("pause_ad");
    expect(log[1]!.action).toBe("update_bid");
  });

  it("skips proposals with already-executed idempotency keys", async () => {
    const key = crypto.randomUUID();
    const executedKeys = new Set([key]);

    const cm = new StubConnectionManager({
      defaultExecutionResult: {
        proposalId: "prop_default",
        status: "executed",
        executedAt: new Date(),
      },
    });

    const proposals = [makeProposal({ id: "p1", idempotencyKey: key })];

    const { results, stepOutput } = await executeActions({
      proposals,
      connectionManager: cm,
      executedKeys,
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.status).toBe("skipped");
    expect(results[0]!.proposalId).toBe("p1");

    // Should not have called the connection manager
    expect(cm.getExecutionLog()).toHaveLength(0);

    const data = stepOutput.data as Record<string, unknown>;
    expect(data.skipped).toBe(1);
    expect(data.executed).toBe(0);
  });

  it("handles execution failure gracefully and continues", async () => {
    const cm = new StubConnectionManager({
      executionResults: {
        will_fail: {
          proposalId: "p1",
          status: "failed",
          error: "API rate limit",
          executedAt: new Date(),
        },
      },
      defaultExecutionResult: {
        proposalId: "p2",
        status: "executed",
        output: { ok: true },
        executedAt: new Date(),
      },
    });

    // Make the first action throw to test error handling
    const failingCm: any = {
      ...cm,
      execute: vi.fn()
        .mockRejectedValueOnce(new Error("API rate limit"))
        .mockResolvedValueOnce({
          proposalId: "p2",
          status: "executed",
          output: { ok: true },
          executedAt: new Date(),
        }),
    };

    const proposals = [
      makeProposal({ id: "p1", action: "will_fail" }),
      makeProposal({ id: "p2", action: "update_bid" }),
    ];

    const { results, stepOutput } = await executeActions({
      proposals,
      connectionManager: failingCm,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.status).toBe("failed");
    expect(results[0]!.error).toBe("API rate limit");
    expect(results[1]!.status).toBe("executed");

    const data = stepOutput.data as Record<string, unknown>;
    expect(data.failed).toBe(1);
    expect(data.executed).toBe(1);
  });

  it("tracks executed/failed/skipped counts correctly", async () => {
    const alreadyExecutedKey = crypto.randomUUID();
    const executedKeys = new Set([alreadyExecutedKey]);

    const failingCm: any = {
      execute: vi.fn()
        .mockResolvedValueOnce({
          proposalId: "p1",
          status: "executed",
          output: { ok: true },
          executedAt: new Date(),
        })
        .mockRejectedValueOnce(new Error("fail"))
        .mockResolvedValueOnce({
          proposalId: "p4",
          status: "executed",
          output: { ok: true },
          executedAt: new Date(),
        }),
    };

    const proposals = [
      makeProposal({ id: "p1", action: "success1" }),
      makeProposal({ id: "p2", action: "will_fail" }),
      makeProposal({ id: "p3", idempotencyKey: alreadyExecutedKey }),
      makeProposal({ id: "p4", action: "success2" }),
    ];

    const { results, stepOutput } = await executeActions({
      proposals,
      connectionManager: failingCm,
      executedKeys,
    });

    expect(results).toHaveLength(4);

    const data = stepOutput.data as Record<string, unknown>;
    expect(data.total).toBe(4);
    expect(data.executed).toBe(2);
    expect(data.failed).toBe(1);
    expect(data.skipped).toBe(1);
  });

  it("adds executed keys to the executedKeys set", async () => {
    const executedKeys = new Set<string>();
    const proposal = makeProposal({ id: "p1" });

    const cm = new StubConnectionManager({
      defaultExecutionResult: {
        proposalId: "p1",
        status: "executed",
        executedAt: new Date(),
      },
    });

    await executeActions({
      proposals: [proposal],
      connectionManager: cm,
      executedKeys,
    });

    expect(executedKeys.has(proposal.idempotencyKey)).toBe(true);
  });

  it("stepOutput has correct step name and duration", async () => {
    const { stepOutput } = await executeActions({
      proposals: [],
      connectionManager: new StubConnectionManager({}),
    });

    expect(stepOutput.step).toBe("execute");
    expect(typeof stepOutput.duration).toBe("number");
    expect(stepOutput.duration).toBeGreaterThanOrEqual(0);
  });

  it("handles empty proposals array", async () => {
    const { results, stepOutput } = await executeActions({
      proposals: [],
      connectionManager: new StubConnectionManager({}),
    });

    expect(results).toEqual([]);
    const data = stepOutput.data as Record<string, unknown>;
    expect(data.total).toBe(0);
    expect(data.executed).toBe(0);
    expect(data.failed).toBe(0);
    expect(data.skipped).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// writeMemory
// ---------------------------------------------------------------------------
describe("writeMemory", () => {
  let store: SqliteMemoryStore;

  beforeEach(() => {
    const db = createTestDb();
    store = new SqliteMemoryStore(db);
  });

  it("appends events to memoryStore", async () => {
    const events = [
      {
        type: "action_executed" as AgentEventType,
        data: { action: "pause_ad", success: true },
      },
      {
        type: "skill_output" as AgentEventType,
        data: { skillId: "search_terms", findings: 5 },
      },
    ];

    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events,
    });

    expect(result.eventsLogged).toBe(2);
  });

  it("events can be queried back from memoryStore", async () => {
    const events = [
      {
        type: "action_executed" as AgentEventType,
        data: { action: "pause_ad", success: true },
      },
    ];

    await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events,
    });

    const queried = await store.queryEvents({ agentId: "agent_001" });
    expect(queried).toHaveLength(1);
    expect(queried[0]!.runId).toBe("run_001");
    expect(queried[0]!.agentId).toBe("agent_001");
    expect(queried[0]!.type).toBe("action_executed");
    expect(queried[0]!.data).toEqual({ action: "pause_ad", success: true });
  });

  it("flags lesson distillation when runCount % interval === 0", async () => {
    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events: [
        { type: "run_started" as AgentEventType, data: {} },
      ],
      runCount: 10,
      lessonDistillationInterval: 5,
    });

    expect(result.lessonsDistilled).toBe(true);
  });

  it("does not flag lesson distillation when runCount % interval !== 0", async () => {
    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events: [
        { type: "run_started" as AgentEventType, data: {} },
      ],
      runCount: 7,
      lessonDistillationInterval: 5,
    });

    expect(result.lessonsDistilled).toBe(false);
  });

  it("does not flag lesson distillation when runCount is not provided", async () => {
    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events: [
        { type: "run_started" as AgentEventType, data: {} },
      ],
      lessonDistillationInterval: 5,
    });

    expect(result.lessonsDistilled).toBe(false);
  });

  it("does not flag lesson distillation when interval is not provided", async () => {
    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events: [
        { type: "run_started" as AgentEventType, data: {} },
      ],
      runCount: 10,
    });

    expect(result.lessonsDistilled).toBe(false);
  });

  it("returns 0 events logged when no events provided", async () => {
    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events: [],
    });

    expect(result.eventsLogged).toBe(0);
    expect(result.lessonsDistilled).toBe(false);
  });

  it("stepOutput has correct step name and data", async () => {
    const events = [
      { type: "run_started" as AgentEventType, data: {} },
      { type: "skill_output" as AgentEventType, data: { x: 1 } },
      { type: "action_executed" as AgentEventType, data: { y: 2 } },
    ];

    const result = await writeMemory({
      runId: "run_001",
      agentId: "agent_001",
      memoryStore: store,
      events,
      runCount: 10,
      lessonDistillationInterval: 5,
    });

    expect(result.stepOutput.step).toBe("memory");
    expect(typeof result.stepOutput.duration).toBe("number");
    expect(result.stepOutput.duration).toBeGreaterThanOrEqual(0);

    const data = result.stepOutput.data as Record<string, unknown>;
    expect(data.eventsLogged).toBe(3);
    expect(data.lessonsDistilled).toBe(true);
  });
});
