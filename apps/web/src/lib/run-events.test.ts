import { describe, expect, it } from "vitest";
import {
  buildTimelineEvents,
  extractFinding,
  extractToolNames,
  findLatestStopEvent,
  findWorkItemForApproval,
  getActionableApprovals,
} from "./run-events";
import type { PendingActionView, RunEventView, RunView, WorkItemView } from "./types";

function makeEvent(overrides: Partial<RunEventView> & Pick<RunEventView, "type">): RunEventView {
  return {
    id: `e_${Math.random().toString(36).slice(2)}`,
    timestamp: "2026-04-15T00:00:00Z",
    payload: {},
    ...overrides,
  };
}

function makeRun(overrides: Partial<RunView>): RunView {
  return {
    id: "r1",
    agentId: "a1",
    triggerType: "manual",
    status: "running",
    hasActionableApprovals: false,
    startedAt: "2026-04-15T00:00:00Z",
    events: [],
    approvals: [],
    workItems: [],
    ...overrides,
  } as RunView;
}

describe("extractFinding", () => {
  it("returns the text of the first finding_recorded event", () => {
    const run = makeRun({
      events: [
        makeEvent({ type: "tool_called", payload: { toolName: "search" } }),
        makeEvent({ type: "finding_recorded", payload: { text: "found something" } }),
        makeEvent({ type: "finding_recorded", payload: { text: "second one" } }),
      ],
    });
    expect(extractFinding(run)).toBe("found something");
  });

  it("returns null when no finding_recorded event exists", () => {
    expect(extractFinding(makeRun({ events: [makeEvent({ type: "tool_called" })] }))).toBeNull();
  });

  it("returns null when finding event has no text payload", () => {
    const run = makeRun({ events: [makeEvent({ type: "finding_recorded", payload: {} })] });
    expect(extractFinding(run)).toBeNull();
  });
});

describe("buildTimelineEvents", () => {
  it("maps RunEventView[] to TimelineEvent[] with epoch ms timestamps", () => {
    const run = makeRun({
      events: [
        makeEvent({ id: "e1", type: "run_started", timestamp: "2026-04-15T00:00:00Z" }),
        makeEvent({ id: "e2", type: "run_completed", timestamp: "2026-04-15T00:01:00Z" }),
      ],
    });
    const result = buildTimelineEvents(run);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "e1", type: "run_started" });
    expect(typeof result[0]!.timestamp).toBe("number");
    expect(typeof result[0]!.summary).toBe("string");
  });

  it("returns empty array for run with no events", () => {
    expect(buildTimelineEvents(makeRun({}))).toEqual([]);
  });
});

describe("extractToolNames", () => {
  it("returns unique tool names from tool_called events", () => {
    const run = makeRun({
      events: [
        makeEvent({ type: "tool_called", payload: { toolName: "search" } }),
        makeEvent({ type: "tool_called", payload: { toolName: "edit" } }),
        makeEvent({ type: "tool_called", payload: { toolName: "search" } }),
        makeEvent({ type: "agent_message" }),
      ],
    });
    expect(extractToolNames(run)).toEqual(["search", "edit"]);
  });

  it("ignores tool_called events without toolName", () => {
    const run = makeRun({ events: [makeEvent({ type: "tool_called", payload: {} })] });
    expect(extractToolNames(run)).toEqual([]);
  });

  it("returns empty array for run with no tool calls", () => {
    expect(extractToolNames(makeRun({}))).toEqual([]);
  });
});

describe("getActionableApprovals", () => {
  function makeApproval(status: PendingActionView["status"], extra: Partial<PendingActionView> = {}): PendingActionView {
    return {
      id: `appr_${status}`,
      status,
      proposal: { toolName: "x", reason: "" },
      ...extra,
    } as PendingActionView;
  }

  it("returns only pending and expired approvals", () => {
    const run = makeRun({
      approvals: [
        makeApproval("pending"),
        makeApproval("approved"),
        makeApproval("expired"),
        makeApproval("rejected"),
      ],
    });
    expect(getActionableApprovals(run).map((a) => a.status)).toEqual(["pending", "expired"]);
  });

  it("returns empty array when no actionable approvals", () => {
    expect(getActionableApprovals(makeRun({}))).toEqual([]);
  });
});

describe("findLatestStopEvent", () => {
  it("returns the most recent run_stopped event", () => {
    const run = makeRun({
      events: [
        makeEvent({ id: "stop1", type: "run_stopped", payload: { reason: "first" } }),
        makeEvent({ id: "tool", type: "tool_called" }),
        makeEvent({ id: "stop2", type: "run_stopped", payload: { reason: "second" } }),
      ],
    });
    expect(findLatestStopEvent(run)?.id).toBe("stop2");
  });

  it("returns null when no run_stopped events exist", () => {
    expect(findLatestStopEvent(makeRun({}))).toBeNull();
  });
});

describe("findWorkItemForApproval", () => {
  function makeWorkItem(id: string): WorkItemView {
    return { id, role: "specialist", status: "running" } as WorkItemView;
  }

  it("returns the matching work item by approval.workItemId", () => {
    const run = makeRun({ workItems: [makeWorkItem("wi1"), makeWorkItem("wi2")] });
    const approval = { workItemId: "wi2" } as PendingActionView;
    expect(findWorkItemForApproval(run, approval)?.id).toBe("wi2");
  });

  it("returns null when approval has no workItemId", () => {
    const run = makeRun({ workItems: [makeWorkItem("wi1")] });
    expect(findWorkItemForApproval(run, {} as PendingActionView)).toBeNull();
  });

  it("returns null when work item is not in the run", () => {
    const run = makeRun({ workItems: [makeWorkItem("wi1")] });
    const approval = { workItemId: "wi-missing" } as PendingActionView;
    expect(findWorkItemForApproval(run, approval)).toBeNull();
  });
});
