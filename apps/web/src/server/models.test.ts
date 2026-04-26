import type { AgentTaskRecord, ApprovalRecord, RunEvent, RunRecord } from "@nochore/harness";
import { describe, expect, it } from "vitest";
import { buildSerializedRun } from "./models";

describe("buildSerializedRun", () => {
  it("keeps resolved approvals while computing actionable approval state", () => {
    const run: RunRecord = {
      id: "run_123",
      agentId: "agent_123",
      triggerType: "manual",
      status: "waiting_for_tasks",
      startedAt: new Date("2026-04-14T08:00:00Z"),
    };
    const events: RunEvent[] = [];
    const approvals: ApprovalRecord[] = [
      {
        id: "approval_approved",
        runId: "run_123",
        agentId: "agent_123",
        approvalId: "sdk_approved",
        waitTokenId: "wait_approved",
        toolName: "googleads_adjust_budget",
        toolInput: { amount: 25 },
        status: "approved",
        requestReason: "Budget changes require approval",
        requestEventId: "evt_1",
        decisionReason: "Safe reduction",
        createdAt: new Date("2026-04-14T08:01:00Z"),
        resolvedAt: new Date("2026-04-14T08:02:00Z"),
      },
      {
        id: "approval_pending",
        runId: "run_123",
        agentId: "agent_123",
        approvalId: "sdk_pending",
        waitTokenId: "wait_pending",
        toolName: "slack_send_message",
        toolInput: { channel: "ops" },
        status: "pending",
        requestReason: "External writes require approval",
        requestEventId: "evt_2",
        taskId: "task_123",
        createdAt: new Date("2026-04-14T08:03:00Z"),
      },
    ];
    const tasks: AgentTaskRecord[] = [
      {
        id: "task_123",
        parentRunId: "run_123",
        rootRunId: "run_123",
        agentId: "agent_123",
        kind: "agent_task_run",
        role: "builder",
        title: "Prepare outbound notification",
        status: "waiting_for_approval",
        blockingReason: "approval",
        createdAt: new Date("2026-04-14T08:03:00Z"),
      },
    ];

    const serialized = buildSerializedRun(run, events, approvals, tasks);

    expect(serialized.hasActionableApprovals).toBe(true);
    expect(serialized.approvals).toHaveLength(2);
    expect(serialized.approvals.map((approval) => approval.status)).toEqual(["approved", "pending"]);
    expect(serialized.approvals[1]).toMatchObject({
      id: "approval_pending",
      taskId: "task_123",
    });
    expect(serialized.tasks).toHaveLength(1);
    expect(serialized.tasks[0]).toMatchObject({ id: "task_123", status: "waiting_for_approval" });
    expect("workItems" in serialized).toBe(false);
  });
});
