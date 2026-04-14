import { describe, expect, it, vi } from "vitest";
import { ApprovalCheckpointError } from "../lib/run-helpers";
import { stopWorkItemForApproval } from "./worker-run";

describe("stopWorkItemForApproval", () => {
  it("marks the work item stopped and updates metadata", async () => {
    const stop = vi.fn(async () => {});
    const metadataStatuses: string[] = [];

    await stopWorkItemForApproval({
      runtime: {
        workItemRepository: {
          stop,
        },
      } as never,
      workItemId: "work_123",
      error: new ApprovalCheckpointError("Approval window expired", "expired", {
        approvalId: "approval_123",
        workItemId: "work_123",
      }),
      metadataApi: {
        set(_key, value) {
          metadataStatuses.push(value);
        },
      },
    });

    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop.mock.calls[0]?.[0]).toBe("work_123");
    expect(stop.mock.calls[0]?.[2]).toBe("Approval window expired");
    expect(metadataStatuses).toEqual(["stopped"]);
  });
});
