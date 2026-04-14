import { describe, expect, it, vi } from "vitest";
import { ApprovalCheckpointError } from "../lib/run-helpers";
import { handleStoppedSubRun, stopRunForApproval } from "./agent-run";
import type { WorkerRunResult } from "./worker-run";

function createEventRuntime() {
  let eventCount = 0;
  const events: Array<{ id: string; type: string; payload: Record<string, unknown> }> = [];

  return {
    runtime: {
      runEventRepository: {
        async append(input: { type: string; payload: Record<string, unknown> }) {
          const id = `evt_${++eventCount}`;
          events.push({ id, type: input.type, payload: input.payload });
          return id;
        },
      },
    },
    getEvents: () => events,
  };
}

describe("stopRunForApproval", () => {
  it("records a stopped event and persists the run as stopped", async () => {
    const harness = createEventRuntime();
    const stop = vi.fn(async () => {});
    const metadataStatuses: string[] = [];
    const eventIds: string[] = [];

    await stopRunForApproval({
      runtime: {
        ...harness.runtime,
        runRepository: {
          stop,
        },
      } as never,
      runId: "run_123",
      agentId: "agent_123",
      error: new ApprovalCheckpointError("Declined by operator", "rejected", {
        approvalId: "approval_123",
        workItemId: "work_123",
      }),
      eventIds,
      metadataApi: {
        set(_key, value) {
          metadataStatuses.push(value);
        },
      },
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0]?.[0]).toBe("run_123");
    expect(stop.mock.calls[0]?.[2]).toBe("Declined by operator");
    expect(harness.getEvents()).toEqual([
      {
        id: "evt_1",
        type: "run_stopped",
        payload: {
          cause: "approval_rejected",
          reason: "Declined by operator",
          approvalId: "approval_123",
          workItemId: "work_123",
        },
      },
    ]);
    expect(eventIds).toEqual(["evt_1"]);
    expect(metadataStatuses).toEqual(["stopped"]);
  });
});

describe("handleStoppedSubRun", () => {
  it("records a stopped child result and rethrows it as an approval checkpoint", async () => {
    const harness = createEventRuntime();
    const eventIds: string[] = [];

    let thrown: unknown;
    try {
      await handleStoppedSubRun({
        runtime: harness.runtime as never,
        runId: "run_123",
        agentId: "agent_123",
        role: "analyst",
        workItemId: "work_123",
        result: {
          workItemId: "work_123",
          status: "stopped",
          output: "",
          durationMs: 0,
          toolCallCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cause: "approval_expired",
          reason: "Approval expired after 24 hours",
          approvalId: "approval_123",
        } satisfies Extract<WorkerRunResult, { status: "stopped" }>,
        eventIds,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApprovalCheckpointError);
    expect(thrown).toMatchObject({
      stopCause: "approval_expired",
      approvalId: "approval_123",
      workItemId: "work_123",
      message: "Approval expired after 24 hours",
    });
    expect(harness.getEvents()).toEqual([
      {
        id: "evt_1",
        type: "sub_run_completed",
        payload: {
          role: "analyst",
          outcome: "stopped",
          success: false,
          cause: "approval_expired",
          reason: "Approval expired after 24 hours",
          workItemId: "work_123",
          approvalId: "approval_123",
        },
      },
    ]);
    expect(eventIds).toEqual(["evt_1"]);
  });
});
