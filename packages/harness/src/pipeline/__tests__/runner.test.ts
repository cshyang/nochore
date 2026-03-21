import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig } from "../../types/agent-config";
import type { TriggerEvent } from "../../types/run";
import type { SkillDefinition } from "../../types/skill";

// ---------------------------------------------------------------------------
// Mock the `ai` module — planActions uses generateObject
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

import { runPipeline } from "../runner";
import { generateObject } from "ai";
import { createTestDb } from "../../db/client";
import { SqliteMemoryStore } from "../../memory/store";
import { SkillRegistry } from "../../skills/registry";
import { StubConnectionManager } from "../../connections/stub";
import { ContextAssembler } from "../../context/assembler";
import { WorkspaceStore } from "../../workspace/store";
import { RunRepository } from "../../repositories/run";
import { ApprovalRepository } from "../../repositories/approval";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockedGenerateObject = vi.mocked(generateObject);

const TEST_SKILL: SkillDefinition = {
  id: "test_skill",
  name: "Test Skill",
  description: "A test skill",
  consumes: ["test_data"],
  outputSchema: {
    type: "object",
    properties: { finding: { type: "string" } },
  },
  compute: (_data) => ({ finding: "test finding" }),
};

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "agent_001",
    projectId: "proj_001",
    name: "Test Agent",
    description: "A test agent",
    intent: "Optimize campaigns",
    workspacePath: "/tmp/test-workspace",
    skills: ["test_skill"],
    skillKnowledge: {},
    triggers: [],
    policyRules: [],
    policyOverrides: [],
    globalApprovalRequired: false,
    operationalConstraints: [],
    connectionIds: [],
    memoryEnabled: true,
    lessonDistillationInterval: 10,
    scopeStrategy: "static",
    ...overrides,
  };
}

function makeTrigger(): TriggerEvent {
  return {
    type: "manual",
    timestamp: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Helper: create all pipeline dependencies
// ---------------------------------------------------------------------------

async function createDeps() {
  const db = createTestDb();
  const memoryStore = new SqliteMemoryStore(db);
  const runRepository = new RunRepository(db);
  const approvalRepository = new ApprovalRepository(db);

  const skillRegistry = new SkillRegistry();
  skillRegistry.register(TEST_SKILL);

  const connectionManager = new StubConnectionManager({
    data: { test_data: { values: [1, 2, 3] } },
    defaultExecutionResult: {
      proposalId: "default",
      status: "executed",
      output: { ok: true },
      executedAt: new Date(),
    },
  });

  // Create a temp workspace with AGENT.md
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "nochore-test-"));
  await fs.writeFile(
    path.join(tmpDir, "AGENT.md"),
    "# Test Agent\nYou optimize campaigns.",
  );

  const workspaceStore = new WorkspaceStore(tmpDir);
  const contextAssembler = new ContextAssembler(workspaceStore, memoryStore);

  return {
    deps: {
      memoryStore,
      skillRegistry,
      connectionManager,
      contextAssembler,
      approvalRepository,
      runRepository,
    },
    tmpDir,
    db,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("runPipeline", () => {
  beforeEach(() => {
    mockedGenerateObject.mockReset();
  });

  // -------------------------------------------------------------------------
  // 1. Happy path: full pipeline runs with deterministic skill + no proposals
  // -------------------------------------------------------------------------
  it("completes a full pipeline run with correct RunResult shape", async () => {
    // Plan returns no proposals (deterministic skill output, no LLM action)
    mockedGenerateObject.mockResolvedValue({
      object: { proposals: [] },
    } as any);

    const { deps } = await createDeps();
    const config = makeConfig();
    const trigger = makeTrigger();

    const result = await runPipeline({
      agentId: "agent_001",
      trigger,
      config,
      deps,
    });

    // Verify RunResult shape
    expect(result.runId).toBeTruthy();
    expect(result.agentId).toBe("agent_001");
    expect(typeof result.duration).toBe("number");
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(result.steps)).toBe(true);
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(typeof result.eventsLogged).toBe("number");

    // Should have all pipeline steps
    const stepNames = result.steps.map((s) => s.step);
    expect(stepNames).toContain("scope");
    expect(stepNames).toContain("fetch");
    expect(stepNames).toContain("analyze");
    expect(stepNames).toContain("plan");
    expect(stepNames).toContain("policy");
    expect(stepNames).toContain("execute");
    expect(stepNames).toContain("memory");
  });

  // -------------------------------------------------------------------------
  // 2. Events logged: verify events were written to memoryStore
  // -------------------------------------------------------------------------
  it("logs events to memoryStore", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { proposals: [] },
    } as any);

    const { deps } = await createDeps();
    const config = makeConfig();

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    expect(result.eventsLogged).toBeGreaterThan(0);

    // Query events back from memoryStore
    const events = await deps.memoryStore.queryEvents({
      agentId: "agent_001",
    });
    expect(events.length).toBeGreaterThan(0);

    // Should have at least scope_resolved and data_fetched events
    const types = events.map((e) => e.type);
    expect(types).toContain("scope_resolved");
    expect(types).toContain("data_fetched");
    expect(types).toContain("skill_output");
  });

  // -------------------------------------------------------------------------
  // 3. Run record: verify run was created and completed in runRepository
  // -------------------------------------------------------------------------
  it("creates and completes a run record in runRepository", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { proposals: [] },
    } as any);

    const { deps } = await createDeps();
    const config = makeConfig();

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    // Verify run was created and completed
    const run = await deps.runRepository.getById(result.runId);
    expect(run).not.toBeNull();
    expect(run!.agentId).toBe("agent_001");
    expect(run!.completedAt).toBeDefined();
    expect(run!.result).toBeDefined();
    expect(run!.result!.runId).toBe(result.runId);
  });

  // -------------------------------------------------------------------------
  // 4. Policy gate with globalApprovalRequired → proposals queued
  // -------------------------------------------------------------------------
  it("queues proposals for review when globalApprovalRequired is true", async () => {
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
            skillSource: "test_skill",
            reversible: true,
          },
        ],
      },
    } as any);

    const { deps } = await createDeps();
    const config = makeConfig({ globalApprovalRequired: true });

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    // The proposal should be in the result
    expect(result.proposals.length).toBeGreaterThanOrEqual(1);

    // It should have been queued in the approvalRepository (not executed)
    const pending = await deps.approvalRepository.getByAgentAndStatus(
      "agent_001",
      "pending",
    );
    expect(pending.length).toBeGreaterThanOrEqual(1);
    expect(pending[0]!.proposal.action).toBe("add_negative_keyword");
  });

  // -------------------------------------------------------------------------
  // 5. No proposals: execute and queue are skipped gracefully
  // -------------------------------------------------------------------------
  it("handles empty proposals gracefully", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { proposals: [] },
    } as any);

    const { deps } = await createDeps();
    const config = makeConfig();

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    expect(result.proposals).toEqual([]);

    // Execute step should still have run (with empty proposals)
    const executeStep = result.steps.find((s) => s.step === "execute");
    expect(executeStep).toBeDefined();
    const executeData = executeStep!.data as Record<string, unknown>;
    expect(executeData.total).toBe(0);

    // No pending actions
    const pending = await deps.approvalRepository.getByAgentAndStatus(
      "agent_001",
      "pending",
    );
    expect(pending).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 6. Proposals that pass policy get executed
  // -------------------------------------------------------------------------
  it("executes auto-approved proposals via connectionManager", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: {
        proposals: [
          {
            id: "prop_exec",
            action: "add_negative_keyword",
            toolCategory: "google_ads",
            args: { term: "free" },
            reason: "Wasteful",
            confidence: 0.95,
            skillSource: "test_skill",
            reversible: true,
          },
        ],
      },
    } as any);

    const { deps } = await createDeps();
    const config = makeConfig({ globalApprovalRequired: false });

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    expect(result.proposals.length).toBe(1);

    // Execute step should show an executed action
    const executeStep = result.steps.find((s) => s.step === "execute");
    expect(executeStep).toBeDefined();
    const data = executeStep!.data as Record<string, unknown>;
    expect(data.executed).toBeGreaterThanOrEqual(1);

    // No pending actions (it was auto-approved and executed)
    const pending = await deps.approvalRepository.getByAgentAndStatus(
      "agent_001",
      "pending",
    );
    expect(pending).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 7. Error handling: pipeline wraps errors and completes run with error
  // -------------------------------------------------------------------------
  it("handles errors gracefully and still completes the run", async () => {
    const { deps } = await createDeps();

    // Use a skill that doesn't exist in the connection manager to provoke
    // a partial failure that won't abort the whole pipeline.
    // Instead, let's make the LLM mock throw.
    mockedGenerateObject.mockRejectedValue(new Error("LLM unavailable"));

    // Use a skill that actually produces output (compute is deterministic),
    // so the pipeline only fails at the plan step (LLM call).
    // Since plan step will throw, the pipeline should catch it.
    const config = makeConfig();

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    // Pipeline should still return a result (error path)
    expect(result.runId).toBeTruthy();
    expect(result.agentId).toBe("agent_001");

    // The run should be completed in the repository
    const run = await deps.runRepository.getById(result.runId);
    expect(run).not.toBeNull();
    expect(run!.completedAt).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // 8. Multiple skills: verifies analyze step runs all registered skills
  // -------------------------------------------------------------------------
  it("runs multiple skills when config specifies them", async () => {
    mockedGenerateObject.mockResolvedValue({
      object: { proposals: [] },
    } as any);

    const secondSkill: SkillDefinition = {
      id: "second_skill",
      name: "Second Skill",
      description: "Another test skill",
      consumes: ["test_data"],
      outputSchema: {
        type: "object",
        properties: { insight: { type: "string" } },
      },
      compute: (_data) => ({ insight: "second insight" }),
    };

    const { deps } = await createDeps();
    deps.skillRegistry.register(secondSkill);

    const config = makeConfig({
      skills: ["test_skill", "second_skill"],
    });

    const result = await runPipeline({
      agentId: "agent_001",
      trigger: makeTrigger(),
      config,
      deps,
    });

    // Analyze step should show 2 skills succeeded
    const analyzeStep = result.steps.find((s) => s.step === "analyze");
    expect(analyzeStep).toBeDefined();
    const data = analyzeStep!.data as Record<string, unknown>;
    expect(data.total).toBe(2);
    expect(data.succeeded).toBe(2);

    // Should have skill_output events for both
    const events = await deps.memoryStore.queryEvents({
      agentId: "agent_001",
      type: "skill_output",
    });
    expect(events.length).toBe(2);
  });
});
