import { describe, expect, it, vi } from "vitest";
import { ApprovalCheckpointError } from "../lib/run-helpers";
import { stopAgentTaskForApproval } from "./agent-task-run";

describe("stopAgentTaskForApproval", () => {
  it("marks the task stopped and updates metadata", async () => {
    const stop = vi.fn(async () => {});
    const metadataStatuses: string[] = [];

    await stopAgentTaskForApproval({
      runtime: {
        agentTaskRepository: {
          stop,
        },
      } as never,
      taskId: "task_123",
      error: new ApprovalCheckpointError("Approval window expired", "expired", {
        approvalId: "approval_123",
        taskId: "task_123",
      }),
      metadataApi: {
        set(_key, value) {
          metadataStatuses.push(value);
        },
      },
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0]?.[0]).toBe("task_123");
    expect(stop.mock.calls[0]?.[2]).toBe("Approval window expired");
    expect(metadataStatuses).toEqual(["stopped"]);
  });
});
