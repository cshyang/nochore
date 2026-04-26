import type { AgentRecord, ApprovalRecord } from "@nochore/harness";
import { describe, expect, it } from "vitest";
import { ApprovalCheckpointError, handleApprovalRequest } from "./run-helpers";

function createApprovalRuntime(initialRunStatus: string) {
  let runStatus = initialRunStatus;
  let eventCount = 0;
  let approvalCount = 0;
  const events: Array<{ id: string; type: string; payload: Record<string, unknown> }> = [];
  const approvals = new Map<string, ApprovalRecord>();

  const runtime = {
    approvalRepository: {
      async create(input: {
        runId: string;
        agentId: string;
        approvalId: string;
        waitTokenId: string;
        toolName: string;
        toolInput: Record<string, unknown>;
        requestReason?: string;
        requestEventId?: string;
        createdAt: Date;
        expiresAt?: Date;
        taskId?: string;
      }) {
        const id = `approval_row_${++approvalCount}`;
        approvals.set(id, {
          id,
          runId: input.runId,
          agentId: input.agentId,
          approvalId: input.approvalId,
          waitTokenId: input.waitTokenId,
          toolName: input.toolName,
          toolInput: input.toolInput,
          status: "pending",
          requestReason: input.requestReason,
          requestEventId: input.requestEventId,
          taskId: input.taskId,
          createdAt: input.createdAt,
          expiresAt: input.expiresAt,
        });
        return id;
      },
      async getById(id: string) {
        return approvals.get(id) ?? null;
      },
      async setRequestEventId(id: string, requestEventId: string) {
        const approval = approvals.get(id);
        if (!approval) return;
        approvals.set(id, { ...approval, requestEventId });
      },
      async markResolved(id: string, status: ApprovalRecord["status"], decisionReason: string, resolvedAt: Date) {
        const approval = approvals.get(id);
        if (!approval) return;
        approvals.set(id, { ...approval, status, decisionReason, resolvedAt });
      },
      async markExpired(id: string, decisionReason: string, resolvedAt: Date) {
        const approval = approvals.get(id);
        if (!approval) return;
        approvals.set(id, { ...approval, status: "expired", decisionReason, resolvedAt });
      },
    },
    runRepository: {
      async markWaitingForApproval() {
        runStatus = "waiting_for_approval";
      },
      async markRunning() {
        runStatus = "running";
      },
    },
    runEventRepository: {
      async append(input: { type: string; payload: Record<string, unknown> }) {
        const id = `evt_${++eventCount}`;
        events.push({ id, type: input.type, payload: input.payload });
        return id;
      },
    },
  };

  return {
    runtime,
    getRunStatus: () => runStatus,
    getEvents: () => events,
    getApprovals: () => Array.from(approvals.values()),
  };
}

const agent = { id: "agent_123" } as AgentRecord;

describe("handleApprovalRequest", () => {
  it("marks the root run waiting and then resumes it when approval is granted", async () => {
    const harness = createApprovalRuntime("running");
    const metadataStatuses: string[] = [];

    const result = await handleApprovalRequest({
      runtime: harness.runtime as never,
      agent,
      runId: "run_123",
      toolName: "googleads_adjust_budget",
      toolInput: { campaignId: "cmp_123" },
      policyReason: "Budget changes require approval",
      eventIds: [],
      projectId: "project_123",
      waitApi: {
        async createToken() {
          return { id: "wait_123" };
        },
        forToken() {
          return {
            async unwrap() {
              return { decision: "approved", reason: "Looks safe" };
            },
          };
        },
      },
      metadataApi: {
        set(_key, value) {
          metadataStatuses.push(value);
        },
      },
    });

    expect(result).toBeUndefined();
    expect(harness.getRunStatus()).toBe("running");
    expect(metadataStatuses).toEqual(["waiting_for_approval", "running"]);

    const approvals = harness.getApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      status: "approved",
      decisionReason: "Looks safe",
      requestEventId: "evt_1",
    });
    expect(harness.getEvents().map((event) => event.type)).toEqual([
      "tool_approval_requested",
      "tool_approval_resolved",
    ]);
  });

  it("keeps the parent run waiting for tasks when a task approval is rejected", async () => {
    const harness = createApprovalRuntime("waiting_for_tasks");
    const metadataStatuses: string[] = [];

    let thrown: unknown;
    try {
      await handleApprovalRequest({
        runtime: harness.runtime as never,
        agent,
        runId: "run_123",
        toolName: "slack_send_message",
        toolInput: { channel: "ops" },
        policyReason: "External writes require approval",
        eventIds: [],
        projectId: "project_123",
        taskId: "task_123",
        waitApi: {
          async createToken() {
            return { id: "wait_123" };
          },
          forToken() {
            return {
              async unwrap() {
                return { decision: "rejected", reason: "Do not send this yet" };
              },
            };
          },
        },
        metadataApi: {
          set(_key, value) {
            metadataStatuses.push(value);
          },
        },
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApprovalCheckpointError);
    expect(thrown).toMatchObject({
      stopCause: "approval_rejected",
      taskId: "task_123",
      message: "Do not send this yet",
    });
    expect(harness.getRunStatus()).toBe("waiting_for_tasks");
    expect(metadataStatuses).toEqual([]);

    const approvals = harness.getApprovals();
    expect(approvals).toHaveLength(1);
    expect(approvals[0]).toMatchObject({
      status: "rejected",
      decisionReason: "Do not send this yet",
      taskId: "task_123",
      requestEventId: "evt_1",
    });
    expect(harness.getEvents().map((event) => event.type)).toEqual([
      "tool_approval_requested",
      "tool_approval_resolved",
    ]);
  });
});
