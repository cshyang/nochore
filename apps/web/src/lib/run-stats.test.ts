import { describe, expect, it } from "vitest";
import {
  estimateCost,
  formatCost,
  formatTokens,
  isOutOfRange,
  summarizeRun,
  summarizeRuns,
} from "./run-stats";
import type { PendingActionView, RunEventView, RunView, WorkItemView } from "./types";

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
    workItems: [],
    ...overrides,
  };
}

function makeWorkItem(overrides: Partial<WorkItemView> = {}): WorkItemView {
  return {
    id: "wi-1",
    parentRunId: "run-1",
    kind: "worker_run",
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

function makeApproval(overrides: Partial<PendingActionView> = {}): PendingActionView {
  return {
    id: "appr-1",
    runId: "run-1",
    agentId: "agent-1",
    proposal: { id: "prop-1", toolName: "X", toolInput: {}, reason: "" },
    status: "pending",
    createdAt: "2026-04-15T00:00:30Z",
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
      workItems: [],
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
      subagents: 0,
    });
  });

  it("sums tokens across workItems and counts subagents by kind", () => {
    const run = makeRun({
      workItems: [
        makeWorkItem({ id: "wi-1", inputTokens: 1000, outputTokens: 200 }),
        makeWorkItem({ id: "wi-2", inputTokens: 500, outputTokens: 100 }),
        // non-worker_run should not count as a subagent
        makeWorkItem({ id: "wi-3", kind: "planner_task", inputTokens: 300, outputTokens: 50 }),
      ],
    });
    const stats = summarizeRun(run);
    expect(stats.inputTokens).toBe(1800);
    expect(stats.outputTokens).toBe(350);
    expect(stats.totalTokens).toBe(2150);
    expect(stats.subagents).toBe(2);
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

describe("summarizeRuns", () => {
  it("filters by time window and counts pending approvals + failures", () => {
    const now = Date.now();
    const iso = (msAgo: number) => new Date(now - msAgo).toISOString();

    const runs: RunView[] = [
      makeRun({
        id: "r-recent-ok",
        startedAt: iso(2 * 24 * 60 * 60 * 1000), // 2 days ago
        status: "completed",
        workItems: [makeWorkItem({ inputTokens: 1000, outputTokens: 100 })],
      }),
      makeRun({
        id: "r-recent-failed",
        startedAt: iso(3 * 24 * 60 * 60 * 1000),
        status: "failed",
        workItems: [makeWorkItem({ inputTokens: 500, outputTokens: 50 })],
      }),
      makeRun({
        id: "r-recent-pending",
        startedAt: iso(1 * 24 * 60 * 60 * 1000),
        status: "waiting_for_approval",
        approvals: [makeApproval({ status: "pending" }), makeApproval({ id: "a2", status: "approved" })],
      }),
      makeRun({
        id: "r-old",
        startedAt: iso(30 * 24 * 60 * 60 * 1000), // outside 7d window
        workItems: [makeWorkItem({ inputTokens: 9999, outputTokens: 999 })],
      }),
    ];

    const agg = summarizeRuns(runs, 7);
    expect(agg.runCount).toBe(3); // old run excluded
    expect(agg.failedCount).toBe(1);
    expect(agg.pendingApprovals).toBe(1); // only the pending one
    expect(agg.totalTokens).toBe(1000 + 100 + 500 + 50); // pending run has no workItems
  });

  it("returns zeros when no runs are in the window", () => {
    const agg = summarizeRuns([], 7);
    expect(agg).toEqual({ runCount: 0, totalCost: 0, totalTokens: 0, pendingApprovals: 0, failedCount: 0 });
  });
});

describe("isOutOfRange", () => {
  const withTokens = (id: string, total: number): RunView =>
    makeRun({
      id,
      status: "completed",
      workItems: [makeWorkItem({ id: `wi-${id}`, inputTokens: total, outputTokens: 0 })],
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
      makeRun({ id: "target", status: "completed", workItems: [makeWorkItem({ inputTokens: 10_000 })] }),
      makeRun({ id: "pf1", status: "failed", workItems: [makeWorkItem({ inputTokens: 99_999 })] }),
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
