import { describe, expect, it } from "vitest";
import { estimateCost, formatCost, formatTokens, isOutOfRange, summarizeRun } from "./run-stats";
import type { AgentTaskView, RunEventView, RunView } from "./types";

function makeRun(overrides: Partial<RunView> = {}): RunView {
  return {
    id: "run-1",
    agentId: "agent-1",
    triggerType: "manual",
    status: "completed",
    hasActionableApprovals: false,
    startedAt: "2026-04-15T00:00:00Z",
    completedAt: "2026-04-15T00:02:00Z",
    events: [],
    approvals: [],
    tasks: [],
    ...overrides,
  };
}

function makeAgentTask(overrides: Partial<AgentTaskView> = {}): AgentTaskView {
  return {
    id: "task-1",
    parentRunId: "run-1",
    kind: "agent_task_run",
    role: "researcher",
    title: "Research subtask",
    status: "completed",
    inputTokens: 0,
    outputTokens: 0,
    ...overrides,
  };
}

function makeEvent(type: string, overrides: Partial<RunEventView> = {}): RunEventView {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    type,
    timestamp: "2026-04-15T00:01:00Z",
    payload: {},
    ...overrides,
  };
}

describe("estimateCost", () => {
  it("uses $3/M input + $15/M output rates", () => {
    // 1M input + 1M output = $3 + $15 = $18
    expect(estimateCost(1_000_000, 1_000_000)).toBeCloseTo(18, 6);
  });

  it("handles zero tokens", () => {
    expect(estimateCost(0, 0)).toBe(0);
  });
});

describe("summarizeRun", () => {
  it("returns zeros for a placeholder / empty run", () => {
    // Mirrors the synthetic placeholder AgentWorkspaceActivityPane builds
    // before the SSE snapshot has caught up: empty arrays, no completion.
    const placeholder: RunView = {
      id: "pending",
      agentId: "a",
      triggerType: "manual",
      status: "queued",
      hasActionableApprovals: false,
      startedAt: "2026-04-15T00:00:00Z",
      events: [],
      approvals: [],
      tasks: [],
    };
    const stats = summarizeRun(placeholder);
    expect(stats).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      costEstimate: 0,
      durationMs: 0,
      turns: 0,
      toolCalls: 0,
      tasks: 0,
    });
  });

  it("sums tokens across tasks and counts delegated tasks by kind", () => {
    const run = makeRun({
      tasks: [
        makeAgentTask({ id: "task-1", inputTokens: 1000, outputTokens: 200 }),
        makeAgentTask({ id: "task-2", inputTokens: 500, outputTokens: 100 }),
        // non-agent_task_run should not count as a delegated task
        makeAgentTask({ id: "task-3", kind: "planner_task", inputTokens: 300, outputTokens: 50 }),
      ],
    });
    const stats = summarizeRun(run);
    expect(stats.inputTokens).toBe(1800);
    expect(stats.outputTokens).toBe(350);
    expect(stats.totalTokens).toBe(2150);
    expect(stats.tasks).toBe(2);
    expect(stats.costEstimate).toBeCloseTo(estimateCost(1800, 350), 6);
  });

  it("counts tool_called events as toolCalls and turns", () => {
    const run = makeRun({
      events: [
        makeEvent("run_started"),
        makeEvent("tool_called"),
        makeEvent("tool_executed"),
        makeEvent("tool_called"),
        makeEvent("tool_executed"),
        makeEvent("tool_called"),
      ],
    });
    const stats = summarizeRun(run);
    expect(stats.toolCalls).toBe(3);
    expect(stats.turns).toBe(3);
  });

  it("computes durationMs when completedAt is set; 0 when still running", () => {
    const done = makeRun({ startedAt: "2026-04-15T00:00:00Z", completedAt: "2026-04-15T00:00:10Z" });
    expect(summarizeRun(done).durationMs).toBe(10_000);

    const { completedAt: _completed, ...runningBase } = makeRun({
      status: "running",
    });
    const running: RunView = runningBase as RunView;
    expect(summarizeRun(running).durationMs).toBe(0);
  });
});

describe("isOutOfRange", () => {
  const withTokens = (id: string, total: number): RunView =>
    makeRun({
      id,
      status: "completed",
      tasks: [makeAgentTask({ id: `task-${id}`, inputTokens: total, outputTokens: 0 })],
    });

  it("does not flag when prior history is below minimum (5 completed priors)", () => {
    const target = withTokens("target", 10_000);
    const priors = [withTokens("p1", 100), withTokens("p2", 100), withTokens("p3", 100), withTokens("p4", 100)];
    const result = isOutOfRange(target, priors);
    expect(result.flagged).toBe(false);
    expect(result.priorCount).toBe(4);
  });

  it("flags when observed exceeds threshold × prior median with sufficient history", () => {
    const target = withTokens("target", 10_000);
    const priors = [
      withTokens("p1", 100),
      withTokens("p2", 200),
      withTokens("p3", 300),
      withTokens("p4", 400),
      withTokens("p5", 500),
    ];
    const result = isOutOfRange(target, priors); // median = 300, threshold = 3 → >900 flags
    expect(result.typicalMedian).toBe(300);
    expect(result.flagged).toBe(true);
    expect(result.ratio).toBeCloseTo(10_000 / 300, 4);
  });

  it("does not flag when observed is within threshold", () => {
    const target = withTokens("target", 600);
    const priors = [
      withTokens("p1", 100),
      withTokens("p2", 200),
      withTokens("p3", 300),
      withTokens("p4", 400),
      withTokens("p5", 500),
    ];
    const result = isOutOfRange(target, priors); // median = 300, observed 600, ratio=2 < 3
    expect(result.flagged).toBe(false);
    expect(result.ratio).toBeCloseTo(2, 4);
  });

  it("excludes non-completed priors and the target itself from the baseline", () => {
    const target = withTokens("target", 10_000);
    const priors: RunView[] = [
      withTokens("p1", 100),
      withTokens("p2", 200),
      withTokens("p3", 300),
      withTokens("p4", 400),
      withTokens("p5", 500),
      // these should be excluded:
      makeRun({ id: "target", status: "completed", tasks: [makeAgentTask({ inputTokens: 10_000 })] }),
      makeRun({ id: "pf1", status: "failed", tasks: [makeAgentTask({ inputTokens: 99_999 })] }),
      // zero-value prior — must not drag median
      withTokens("pz", 0),
    ];
    const result = isOutOfRange(target, priors);
    expect(result.priorCount).toBe(5);
    expect(result.typicalMedian).toBe(300);
  });
});

describe("formatTokens / formatCost", () => {
  it("formats token counts with k abbreviation", () => {
    expect(formatTokens(0)).toBe("0 tokens");
    expect(formatTokens(47)).toBe("47 tokens");
    expect(formatTokens(1234)).toBe("1.2k tokens");
    expect(formatTokens(125_000)).toBe("125k tokens");
  });

  it("formats cost with ~ prefix signalling approximation", () => {
    expect(formatCost(0)).toBe("~$0.00");
    expect(formatCost(0.003)).toBe("~<$0.01");
    expect(formatCost(0.03)).toBe("~$0.03");
    expect(formatCost(12.4)).toBe("~$12.40");
    expect(formatCost(2500)).toBe("~$2,500");
  });
});
