import { describe, expect, it } from "vitest";
import { COLORS } from "./colors";
import { statusColor, statusLabel, workItemStatusColor } from "./status-format";
import type { RunView } from "./types";

function makeRun(overrides: Partial<RunView>): RunView {
  return {
    id: "r1",
    agentId: "a1",
    status: "running",
    startedAt: "2026-04-15T00:00:00Z",
    hasActionableApprovals: false,
    events: [],
    approvals: [],
    workItems: [],
    ...overrides,
  } as RunView;
}

describe("statusColor", () => {
  it("returns orange for waiting_for_children with actionable approvals", () => {
    expect(statusColor(makeRun({ status: "waiting_for_children", hasActionableApprovals: true }))).toBe(COLORS.orange);
  });

  it("returns accent for plain waiting_for_children", () => {
    expect(statusColor(makeRun({ status: "waiting_for_children" }))).toBe(COLORS.accent);
  });

  it("covers the known status spectrum", () => {
    expect(statusColor(makeRun({ status: "completed" }))).toBe(COLORS.green);
    expect(statusColor(makeRun({ status: "failed" }))).toBe(COLORS.red);
    expect(statusColor(makeRun({ status: "stopped" }))).toBe(COLORS.orange);
    expect(statusColor(makeRun({ status: "cancelled" }))).toBe(COLORS.textSecondary);
    expect(statusColor(makeRun({ status: "waiting_for_approval" }))).toBe(COLORS.orange);
    expect(statusColor(makeRun({ status: "running" }))).toBe(COLORS.accent);
    expect(statusColor(makeRun({ status: "queued" }))).toBe(COLORS.textDim);
  });
});

describe("statusLabel", () => {
  it("returns 'needs input' for waiting_for_children with actionable approvals", () => {
    expect(statusLabel(makeRun({ status: "waiting_for_children", hasActionableApprovals: true }))).toBe("needs input");
  });

  it("maps approval/coordination states to friendly labels", () => {
    expect(statusLabel(makeRun({ status: "waiting_for_approval" }))).toBe("waiting");
    expect(statusLabel(makeRun({ status: "waiting_for_children" }))).toBe("coordinating");
    expect(statusLabel(makeRun({ status: "stopped" }))).toBe("stopped");
    expect(statusLabel(makeRun({ status: "cancelled" }))).toBe("cancelled");
  });

  it("falls back to the raw status for uncovered states", () => {
    expect(statusLabel(makeRun({ status: "running" }))).toBe("running");
    expect(statusLabel(makeRun({ status: "completed" }))).toBe("completed");
  });
});

describe("workItemStatusColor", () => {
  it("maps terminal outcomes to semantic tones", () => {
    expect(workItemStatusColor("completed")).toBe("green");
    expect(workItemStatusColor("failed")).toBe("red");
    expect(workItemStatusColor("running")).toBe("blue");
  });

  it("groups waiting states as yellow", () => {
    expect(workItemStatusColor("stopped")).toBe("yellow");
    expect(workItemStatusColor("waiting_for_approval")).toBe("yellow");
    expect(workItemStatusColor("waiting_for_external")).toBe("yellow");
  });

  it("returns gray for unknown status", () => {
    expect(workItemStatusColor("queued")).toBe("gray");
    expect(workItemStatusColor("weird")).toBe("gray");
  });
});
