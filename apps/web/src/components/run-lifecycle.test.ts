import { describe, expect, it } from "vitest";
import { deriveLiveRunStatus, derivePendingApproval, type LiveEvent, shouldRenderLiveRun } from "./run-lifecycle";

describe("run lifecycle helpers", () => {
  it("renders the live run only when that run is selected", () => {
    expect(shouldRenderLiveRun("run_live", "run_live")).toBe(true);
    expect(shouldRenderLiveRun("run_live", "run_old")).toBe(false);
    expect(shouldRenderLiveRun("run_live", null)).toBe(false);
  });

  it("maps Trigger.dev cancelled runs to the cancelled UI state", () => {
    expect(deriveLiveRunStatus("CANCELED", "running")).toBe("cancelled");
    expect(deriveLiveRunStatus("FAILED", "running")).toBe("failed");
    expect(deriveLiveRunStatus("COMPLETED", "running")).toBe("completed");
  });

  it("falls back to persisted pending approvals when realtime approval events are missing", () => {
    const pendingApproval = {
      id: "approval_db_1",
      runId: "run_1",
      agentId: "agent_1",
      proposal: {
        id: "approval_db_1",
        toolName: "GMAIL_SEND_EMAIL",
        toolInput: { to: "ops@example.com" },
        reason: "Needs approval",
      },
      status: "pending" as const,
      createdAt: "2026-04-01T13:47:44.000Z",
    };

    expect(derivePendingApproval("run_1", [], [pendingApproval])).toEqual(pendingApproval);
  });

  it("trusts realtime approval resolution over stale persisted pending state", () => {
    const events: LiveEvent[] = [
      {
        id: "evt_1",
        type: "tool_approval_requested",
        timestamp: 1,
        payload: {
          approvalId: "approval_rt_1",
          toolName: "GMAIL_SEND_EMAIL",
          toolInput: { to: "ops@example.com" },
          requestReason: "Needs approval",
        },
      },
      {
        id: "evt_2",
        type: "tool_approval_resolved",
        timestamp: 2,
        payload: {
          approvalId: "approval_rt_1",
          toolName: "GMAIL_SEND_EMAIL",
        },
      },
    ];

    const persistedPending = {
      id: "approval_db_1",
      runId: "run_1",
      agentId: "agent_1",
      proposal: {
        id: "approval_db_1",
        toolName: "GMAIL_SEND_EMAIL",
        toolInput: { to: "ops@example.com" },
        reason: "Needs approval",
      },
      status: "pending" as const,
      createdAt: "2026-04-01T13:47:44.000Z",
    };

    expect(derivePendingApproval("run_1", events, [persistedPending])).toBeNull();
  });
});
