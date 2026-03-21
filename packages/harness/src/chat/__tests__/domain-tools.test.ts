import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb } from "../../db/client";
import { SqliteMemoryStore } from "../../memory/store";
import { ApprovalRepository } from "../../repositories/approval";
import { StubConnectionManager } from "../../connections/stub";
import { createRunAnalysisTool } from "../tools/run-analysis";
import { createQueryMemoryTool } from "../tools/query-memory";
import { createGetInsightsTool } from "../tools/get-insights";
import { createApplyActionTool } from "../tools/apply-action";
import { createExplainDecisionTool } from "../tools/explain-decision";
import type { RunResult } from "../../types/run";
import type { AgentConfig } from "../../types/agent-config";
import type { PipelineDependencies } from "../../pipeline/runner";
import type { ActionProposal } from "../../types/action";

type TestDb = ReturnType<typeof createTestDb>;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const AGENT_ID = "agent_test_001";

const toolCallOptions = {
  toolCallId: "call_001",
  messages: [] as any[],
  abortSignal: undefined as any,
};

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    id: AGENT_ID,
    projectId: "proj_001",
    name: "Test Agent",
    description: "Test agent",
    intent: "Monitor ads",
    workspacePath: "/tmp/test-workspace",
    skills: ["search_terms"],
    skillKnowledge: {},
    triggers: [],
    policyRules: [],
    policyOverrides: [],
    globalApprovalRequired: false,
    operationalConstraints: [],
    connectionIds: [],
    memoryEnabled: true,
    lessonDistillationInterval: 100,
    scopeStrategy: "static",
    ...overrides,
  };
}

function makeProposal(overrides?: Partial<ActionProposal>): ActionProposal {
  return {
    id: "proposal_001",
    action: "add_negative_keyword",
    toolCategory: "google_ads",
    args: { keyword: "free", campaignId: "camp_1" },
    reason: "Wasting budget on irrelevant searches",
    confidence: 0.92,
    skillSource: "search_terms",
    reversible: true,
    idempotencyKey: "idem_001",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// run-analysis tool
// ---------------------------------------------------------------------------

describe("createRunAnalysisTool", () => {
  it("has description, parameters, and execute (valid AI SDK tool shape)", () => {
    const mockRunPipeline = vi.fn();
    const runTool = createRunAnalysisTool({
      runPipeline: mockRunPipeline,
      pipelineDeps: {} as PipelineDependencies,
      config: makeConfig(),
      agentId: AGENT_ID,
    });

    expect(runTool).toHaveProperty("description");
    expect(runTool).toHaveProperty("parameters");
    expect(runTool).toHaveProperty("execute");
    expect(typeof runTool.description).toBe("string");
    expect(runTool.description!.length).toBeGreaterThan(0);
  });

  it("calls runPipeline with chat trigger and returns summary", async () => {
    const fakeResult: RunResult = {
      runId: "run_123",
      agentId: AGENT_ID,
      duration: 1500,
      steps: [
        { step: "scope", duration: 100, data: {} },
        { step: "analyze", duration: 800, data: {} },
        { step: "memory", duration: 50, data: {} },
      ],
      proposals: [makeProposal()],
      eventsLogged: 5,
    };

    const mockRunPipeline = vi.fn().mockResolvedValue(fakeResult);

    const runTool = createRunAnalysisTool({
      runPipeline: mockRunPipeline,
      pipelineDeps: {} as PipelineDependencies,
      config: makeConfig(),
      agentId: AGENT_ID,
    });

    const result = await runTool.execute!({}, toolCallOptions);

    // Verify runPipeline was called
    expect(mockRunPipeline).toHaveBeenCalledOnce();
    const callArgs = mockRunPipeline.mock.calls[0]![0];
    expect(callArgs.agentId).toBe(AGENT_ID);
    expect(callArgs.trigger.type).toBe("chat");
    expect(callArgs.trigger.timestamp).toBeInstanceOf(Date);

    // Verify summary shape
    expect(result.runId).toBe("run_123");
    expect(result.duration).toBe(1500);
    expect(result.proposalCount).toBe(1);
    expect(result.eventsLogged).toBe(5);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0]).toEqual({ step: "scope", duration: 100 });
    expect(result.steps[1]).toEqual({ step: "analyze", duration: 800 });
  });

  it("passes scope in trigger metadata when provided", async () => {
    const fakeResult: RunResult = {
      runId: "run_456",
      agentId: AGENT_ID,
      duration: 500,
      steps: [],
      proposals: [],
      eventsLogged: 0,
    };

    const mockRunPipeline = vi.fn().mockResolvedValue(fakeResult);

    const runTool = createRunAnalysisTool({
      runPipeline: mockRunPipeline,
      pipelineDeps: {} as PipelineDependencies,
      config: makeConfig(),
      agentId: AGENT_ID,
    });

    await runTool.execute!({ scope: "search_terms" }, toolCallOptions);

    const callArgs = mockRunPipeline.mock.calls[0]![0];
    expect(callArgs.trigger.metadata).toEqual({ scope: "search_terms" });
  });
});

// ---------------------------------------------------------------------------
// query-memory tool
// ---------------------------------------------------------------------------

describe("createQueryMemoryTool", () => {
  let db: TestDb;
  let memoryStore: SqliteMemoryStore;

  beforeEach(() => {
    db = createTestDb();
    memoryStore = new SqliteMemoryStore(db);
  });

  it("has description, parameters, and execute (valid AI SDK tool shape)", () => {
    const queryTool = createQueryMemoryTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    expect(queryTool).toHaveProperty("description");
    expect(queryTool).toHaveProperty("parameters");
    expect(queryTool).toHaveProperty("execute");
  });

  it("queries lessons by scope", async () => {
    // Seed some lessons
    await memoryStore.saveLessons([
      {
        agentId: AGENT_ID,
        content: "Broad match wastes budget on Fridays",
        scope: "search_terms",
        confidence: "high",
        sourceEventIds: ["evt_1"],
        createdAt: new Date("2026-03-01"),
      },
      {
        agentId: AGENT_ID,
        content: "Quality scores drop after midnight",
        scope: "quality_score",
        confidence: "medium",
        sourceEventIds: ["evt_2"],
        createdAt: new Date("2026-03-02"),
      },
    ]);

    const queryTool = createQueryMemoryTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await queryTool.execute!(
      { type: "lessons", scope: "search_terms" },
      toolCallOptions
    );

    expect(result.type).toBe("lessons");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].content).toBe(
      "Broad match wastes budget on Fridays"
    );
  });

  it("queries all lessons when no scope", async () => {
    await memoryStore.saveLessons([
      {
        agentId: AGENT_ID,
        content: "Lesson one",
        scope: "scope_a",
        confidence: "high",
        sourceEventIds: ["evt_1"],
        createdAt: new Date("2026-03-01"),
      },
      {
        agentId: AGENT_ID,
        content: "Lesson two",
        scope: "scope_b",
        confidence: "low",
        sourceEventIds: ["evt_2"],
        createdAt: new Date("2026-03-02"),
      },
    ]);

    const queryTool = createQueryMemoryTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await queryTool.execute!(
      { type: "lessons" },
      toolCallOptions
    );

    expect(result.type).toBe("lessons");
    expect(result.results).toHaveLength(2);
  });

  it("queries recent events with default limit", async () => {
    // Seed events
    for (let i = 0; i < 25; i++) {
      await memoryStore.appendEvent({
        runId: "run_001",
        agentId: AGENT_ID,
        timestamp: new Date(Date.now() - (25 - i) * 1000),
        type: "skill_output",
        data: { index: i },
      });
    }

    const queryTool = createQueryMemoryTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await queryTool.execute!(
      { type: "events" },
      toolCallOptions
    );

    expect(result.type).toBe("events");
    // Default limit is 20
    expect(result.results).toHaveLength(20);
  });

  it("queries recent events with custom limit", async () => {
    for (let i = 0; i < 10; i++) {
      await memoryStore.appendEvent({
        runId: "run_001",
        agentId: AGENT_ID,
        timestamp: new Date(Date.now() - (10 - i) * 1000),
        type: "action_proposed",
        data: { index: i },
      });
    }

    const queryTool = createQueryMemoryTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await queryTool.execute!(
      { type: "events", limit: 5 },
      toolCallOptions
    );

    expect(result.type).toBe("events");
    expect(result.results).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
// get-insights tool
// ---------------------------------------------------------------------------

describe("createGetInsightsTool", () => {
  let db: TestDb;
  let memoryStore: SqliteMemoryStore;

  beforeEach(() => {
    db = createTestDb();
    memoryStore = new SqliteMemoryStore(db);
  });

  it("has description, parameters, and execute (valid AI SDK tool shape)", () => {
    const insightsTool = createGetInsightsTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    expect(insightsTool).toHaveProperty("description");
    expect(insightsTool).toHaveProperty("parameters");
    expect(insightsTool).toHaveProperty("execute");
  });

  it("returns only skill_output events as insights", async () => {
    // Seed mixed event types
    await memoryStore.appendEvent({
      runId: "run_001",
      agentId: AGENT_ID,
      timestamp: new Date("2026-03-01T00:00:00Z"),
      type: "skill_output",
      data: { skillId: "search_terms", findings: 12 },
    });
    await memoryStore.appendEvent({
      runId: "run_001",
      agentId: AGENT_ID,
      timestamp: new Date("2026-03-01T00:01:00Z"),
      type: "action_proposed",
      data: { proposalId: "p_1" },
    });
    await memoryStore.appendEvent({
      runId: "run_001",
      agentId: AGENT_ID,
      timestamp: new Date("2026-03-01T00:02:00Z"),
      type: "skill_output",
      data: { skillId: "quality_score", findings: 3 },
    });

    const insightsTool = createGetInsightsTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await insightsTool.execute!({}, toolCallOptions);

    expect(result.insights).toHaveLength(2);
    expect(result.insights[0].data.skillId).toBe("search_terms");
    expect(result.insights[1].data.skillId).toBe("quality_score");
  });

  it("respects limit parameter", async () => {
    for (let i = 0; i < 5; i++) {
      await memoryStore.appendEvent({
        runId: "run_001",
        agentId: AGENT_ID,
        timestamp: new Date(Date.now() - (5 - i) * 1000),
        type: "skill_output",
        data: { skillId: `skill_${i}` },
      });
    }

    const insightsTool = createGetInsightsTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await insightsTool.execute!({ limit: 3 }, toolCallOptions);

    expect(result.insights).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// apply-action tool
// ---------------------------------------------------------------------------

describe("createApplyActionTool", () => {
  let db: TestDb;
  let approvalRepo: ApprovalRepository;
  let connectionManager: StubConnectionManager;

  beforeEach(() => {
    db = createTestDb();
    approvalRepo = new ApprovalRepository(db);
    connectionManager = new StubConnectionManager({
      defaultExecutionResult: {
        proposalId: "will_be_set",
        status: "executed",
        executedAt: new Date(),
      },
    });
  });

  it("has description, parameters, and execute (valid AI SDK tool shape)", () => {
    const applyTool = createApplyActionTool({
      approvalRepository: approvalRepo,
      connectionManager,
      agentId: AGENT_ID,
    });

    expect(applyTool).toHaveProperty("description");
    expect(applyTool).toHaveProperty("parameters");
    expect(applyTool).toHaveProperty("execute");
  });

  it("approves pending action — executes and resolves", async () => {
    const proposal = makeProposal();
    const pendingId = await approvalRepo.queue({
      runId: "run_001",
      agentId: AGENT_ID,
      proposal,
    });

    const applyTool = createApplyActionTool({
      approvalRepository: approvalRepo,
      connectionManager,
      agentId: AGENT_ID,
    });

    const result = await applyTool.execute!(
      { proposalIds: [pendingId] },
      toolCallOptions
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe(pendingId);
    expect(result.results[0].status).toBe("executed");

    // Verify it was resolved in the DB
    const resolved = await approvalRepo.getById(pendingId);
    expect(resolved!.status).toBe("approved");
    expect(resolved!.resolvedReason).toBe("Approved via chat");

    // Verify connectionManager was called
    const log = connectionManager.getExecutionLog();
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe("add_negative_keyword");
    expect(log[0].toolCategory).toBe("google_ads");
    expect(log[0].args).toEqual({ keyword: "free", campaignId: "camp_1" });
  });

  it("skips missing or already resolved actions", async () => {
    const applyTool = createApplyActionTool({
      approvalRepository: approvalRepo,
      connectionManager,
      agentId: AGENT_ID,
    });

    const result = await applyTool.execute!(
      { proposalIds: ["nonexistent_id"] },
      toolCallOptions
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe("nonexistent_id");
    expect(result.results[0].status).toBe("not_found_or_already_resolved");

    // Verify connectionManager was NOT called
    const log = connectionManager.getExecutionLog();
    expect(log).toHaveLength(0);
  });

  it("skips already approved actions", async () => {
    const proposal = makeProposal();
    const pendingId = await approvalRepo.queue({
      runId: "run_001",
      agentId: AGENT_ID,
      proposal,
    });
    // Pre-resolve it
    await approvalRepo.resolve(pendingId, "approved", "Already done");

    const applyTool = createApplyActionTool({
      approvalRepository: approvalRepo,
      connectionManager,
      agentId: AGENT_ID,
    });

    const result = await applyTool.execute!(
      { proposalIds: [pendingId] },
      toolCallOptions
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("not_found_or_already_resolved");
  });

  it("reports failure when execution throws", async () => {
    const failingConnectionManager = new StubConnectionManager({});
    // No default result configured → execute() will throw

    const proposal = makeProposal();
    const pendingId = await approvalRepo.queue({
      runId: "run_001",
      agentId: AGENT_ID,
      proposal,
    });

    const applyTool = createApplyActionTool({
      approvalRepository: approvalRepo,
      connectionManager: failingConnectionManager,
      agentId: AGENT_ID,
    });

    const result = await applyTool.execute!(
      { proposalIds: [pendingId] },
      toolCallOptions
    );

    expect(result.results).toHaveLength(1);
    expect(result.results[0].id).toBe(pendingId);
    expect(result.results[0].status).toBe("failed");
    expect(result.results[0].error).toBeTruthy();
  });

  it("handles multiple proposals in one call", async () => {
    const p1 = makeProposal({ id: "p1", idempotencyKey: "k1" });
    const p2 = makeProposal({
      id: "p2",
      action: "pause_keyword",
      idempotencyKey: "k2",
    });

    const id1 = await approvalRepo.queue({
      runId: "run_001",
      agentId: AGENT_ID,
      proposal: p1,
    });
    const id2 = await approvalRepo.queue({
      runId: "run_001",
      agentId: AGENT_ID,
      proposal: p2,
    });

    const applyTool = createApplyActionTool({
      approvalRepository: approvalRepo,
      connectionManager,
      agentId: AGENT_ID,
    });

    const result = await applyTool.execute!(
      { proposalIds: [id1, id2] },
      toolCallOptions
    );

    expect(result.results).toHaveLength(2);
    expect(result.results[0].status).toBe("executed");
    expect(result.results[1].status).toBe("executed");

    const log = connectionManager.getExecutionLog();
    expect(log).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// explain-decision tool
// ---------------------------------------------------------------------------

describe("createExplainDecisionTool", () => {
  let db: TestDb;
  let memoryStore: SqliteMemoryStore;

  beforeEach(() => {
    db = createTestDb();
    memoryStore = new SqliteMemoryStore(db);
  });

  it("has description, parameters, and execute (valid AI SDK tool shape)", () => {
    const explainTool = createExplainDecisionTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    expect(explainTool).toHaveProperty("description");
    expect(explainTool).toHaveProperty("parameters");
    expect(explainTool).toHaveProperty("execute");
  });

  it("returns policy_decision, action_proposed, and action_executed events", async () => {
    const runId = "run_001";
    const now = new Date();

    await memoryStore.appendEvent({
      runId,
      agentId: AGENT_ID,
      timestamp: new Date(now.getTime() - 3000),
      type: "action_proposed",
      data: { proposalId: "p_1", action: "add_negative" },
    });
    await memoryStore.appendEvent({
      runId,
      agentId: AGENT_ID,
      timestamp: new Date(now.getTime() - 2000),
      type: "policy_decision",
      data: { proposalId: "p_1", result: "approved", reason: "Low risk" },
    });
    await memoryStore.appendEvent({
      runId,
      agentId: AGENT_ID,
      timestamp: new Date(now.getTime() - 1000),
      type: "action_executed",
      data: { proposalId: "p_1", status: "executed" },
    });
    // A different event type that should be excluded
    await memoryStore.appendEvent({
      runId,
      agentId: AGENT_ID,
      timestamp: now,
      type: "skill_output",
      data: { skillId: "search_terms" },
    });

    const explainTool = createExplainDecisionTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await explainTool.execute!({}, toolCallOptions);

    expect(result.decisions).toHaveLength(3);
    const types = result.decisions.map((d: any) => d.type);
    expect(types).toContain("action_proposed");
    expect(types).toContain("policy_decision");
    expect(types).toContain("action_executed");
    expect(types).not.toContain("skill_output");
  });

  it("filters by runId when provided", async () => {
    const now = new Date();

    // Events in run_001
    await memoryStore.appendEvent({
      runId: "run_001",
      agentId: AGENT_ID,
      timestamp: new Date(now.getTime() - 2000),
      type: "policy_decision",
      data: { proposalId: "p_1", result: "approved" },
    });
    // Events in run_002
    await memoryStore.appendEvent({
      runId: "run_002",
      agentId: AGENT_ID,
      timestamp: new Date(now.getTime() - 1000),
      type: "policy_decision",
      data: { proposalId: "p_2", result: "blocked" },
    });

    const explainTool = createExplainDecisionTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await explainTool.execute!(
      { runId: "run_001" },
      toolCallOptions
    );

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].data.proposalId).toBe("p_1");
  });

  it("returns empty decisions when no matching events", async () => {
    const explainTool = createExplainDecisionTool({
      memoryStore,
      agentId: AGENT_ID,
    });

    const result = await explainTool.execute!({}, toolCallOptions);

    expect(result.decisions).toEqual([]);
  });
});
