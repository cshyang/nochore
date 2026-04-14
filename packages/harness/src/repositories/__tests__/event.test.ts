import { describe, expect, it } from "vitest";
import { createTestDb } from "../../db/client";
import { RunEventRepository } from "../event";

describe("RunEventRepository.append", () => {
  it("persists a single event and returns its id", async () => {
    const repo = new RunEventRepository(createTestDb());
    const id = await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: { trigger: "manual" },
    });

    expect(typeof id).toBe("string");
    const events = await repo.listByRun("run_001");
    expect(events).toHaveLength(1);
    expect(events[0]!.id).toBe(id);
    expect(events[0]!.payload).toEqual({ trigger: "manual" });
  });
});

describe("RunEventRepository.appendMany", () => {
  it("persists a batch with independent ids", async () => {
    const repo = new RunEventRepository(createTestDb());
    await repo.appendMany([
      {
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date("2026-04-15T10:00:00Z"),
        type: "run_started",
        payload: {},
      },
      {
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date("2026-04-15T10:01:00Z"),
        type: "tool_called",
        payload: { toolName: "search" },
      },
    ]);

    const events = await repo.listByRun("run_001");
    expect(events).toHaveLength(2);
    expect(new Set(events.map((e) => e.id)).size).toBe(2);
  });

  it("is a no-op for empty input", async () => {
    const repo = new RunEventRepository(createTestDb());
    await repo.appendMany([]);
    expect(await repo.listByRun("run_001")).toEqual([]);
  });
});

describe("RunEventRepository.listByRun", () => {
  it("returns events ordered by ascending timestamp", async () => {
    const repo = new RunEventRepository(createTestDb());
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:02:00Z"),
      type: "tool_called",
      payload: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:01:00Z"),
      type: "prompt_built",
      payload: {},
    });

    const events = await repo.listByRun("run_001");
    expect(events.map((e) => e.type)).toEqual(["run_started", "prompt_built", "tool_called"]);
  });

  it("filters by runId", async () => {
    const repo = new RunEventRepository(createTestDb());
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: {},
    });
    await repo.append({
      runId: "run_002",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: {},
    });

    expect(await repo.listByRun("run_001")).toHaveLength(1);
    expect(await repo.listByRun("run_003")).toHaveLength(0);
  });
});

describe("RunEventRepository.listByAgent", () => {
  it("returns events ordered by descending timestamp", async () => {
    const repo = new RunEventRepository(createTestDb());
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: {},
    });
    await repo.append({
      runId: "run_002",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T11:00:00Z"),
      type: "run_started",
      payload: {},
    });

    const events = await repo.listByAgent("agent_001");
    expect(events[0]!.runId).toBe("run_002");
    expect(events[1]!.runId).toBe("run_001");
  });

  it("respects the limit parameter", async () => {
    const repo = new RunEventRepository(createTestDb());
    for (let i = 0; i < 5; i += 1) {
      await repo.append({
        runId: `run_${i}`,
        agentId: "agent_001",
        timestamp: new Date(`2026-04-15T10:0${i}:00Z`),
        type: "run_started",
        payload: {},
      });
    }

    expect(await repo.listByAgent("agent_001", 2)).toHaveLength(2);
    expect(await repo.listByAgent("agent_001")).toHaveLength(5);
  });

  it("scopes results to the given agentId", async () => {
    const repo = new RunEventRepository(createTestDb());
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: {},
    });
    await repo.append({
      runId: "run_002",
      agentId: "agent_002",
      timestamp: new Date("2026-04-15T10:00:00Z"),
      type: "run_started",
      payload: {},
    });

    expect(await repo.listByAgent("agent_001")).toHaveLength(1);
    expect(await repo.listByAgent("agent_003")).toHaveLength(0);
  });
});
