import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProjectDeps: vi.fn(),
  triggerCancel: vi.fn(),
  triggerTask: vi.fn(),
}));

vi.mock("./deps", () => ({
  getProjectDeps: mocks.getProjectDeps,
}));

vi.mock("@trigger.dev/sdk", () => ({
  runs: {
    cancel: mocks.triggerCancel,
  },
  tasks: {
    trigger: mocks.triggerTask,
  },
  wait: {},
}));

import { cancelAgentRun, cancelAgentWorkItem } from "./orchestration";

describe("orchestration cancellation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels a Trigger-backed run and linked work item/session", async () => {
    const deps = createDeps({
      run: { id: "run_1", agentId: "agent_1" },
      workItem: { id: "work_1", sessionId: "session_1", runId: "run_1", triggerRunId: "trigger_1" },
      session: { id: "session_1", activeWorkItemId: "work_1" },
      approvals: [
        {
          id: "approval_1",
          toolName: "gmail_send",
        },
      ],
    });
    mocks.getProjectDeps.mockReturnValue(deps);

    await cancelAgentRun({ projectId: "project_1", runId: "run_1", triggerRunId: "trigger_1" });

    expect(mocks.triggerCancel).toHaveBeenCalledWith("trigger_1");
    expect(deps.runRepository.cancel).toHaveBeenCalledWith("run_1", expect.any(Date), "Cancelled by user");
    expect(deps.approvalRepository.markExpired).toHaveBeenCalledWith(
      "approval_1",
      "Run cancelled before approval was resolved",
      expect.any(Date),
    );
    expect(deps.workItemRepository.cancel).toHaveBeenCalledWith("work_1", expect.any(Date), "Cancelled by user");
    expect(deps.agentSessionRepository.update).toHaveBeenCalledWith("session_1", {
      status: "idle",
      activeWorkItemId: null,
      lastActiveAt: expect.any(Date),
    });
    expect(deps.runEventRepository.append).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run_1", agentId: "agent_1", type: "run_cancelled" }),
    );
  });

  it("cancels a non-run work item without calling Trigger", async () => {
    const deps = createDeps({
      workItem: { id: "work_2", sessionId: "session_2" },
      session: { id: "session_2", activeWorkItemId: "work_2" },
    });
    mocks.getProjectDeps.mockReturnValue(deps);

    await cancelAgentWorkItem({ projectId: "project_1", workItemId: "work_2" });

    expect(mocks.triggerCancel).not.toHaveBeenCalled();
    expect(deps.workItemRepository.cancel).toHaveBeenCalledWith("work_2", expect.any(Date), "Cancelled by user");
    expect(deps.agentSessionRepository.update).toHaveBeenCalledWith("session_2", {
      status: "idle",
      activeWorkItemId: null,
      lastActiveAt: expect.any(Date),
    });
  });
});

function createDeps(params: {
  run?: { id: string; agentId: string };
  workItem?: { id: string; sessionId: string; runId?: string; triggerRunId?: string };
  session?: { id: string; activeWorkItemId?: string };
  approvals?: Array<{ id: string; toolName: string }>;
}) {
  const workItem = params.workItem
    ? {
        ...params.workItem,
        agentId: "agent_1",
        kind: "run",
        status: "running",
        createdAt: new Date(),
      }
    : null;
  return {
    agentSessionRepository: {
      getById: vi.fn(async () => params.session ?? null),
      update: vi.fn(async () => undefined),
    },
    approvalRepository: {
      listByRun: vi.fn(async () =>
        (params.approvals ?? []).map((approval) => ({
          ...approval,
          runId: params.run?.id ?? "run_1",
          agentId: params.run?.agentId ?? "agent_1",
        })),
      ),
      markExpired: vi.fn(async () => undefined),
    },
    runEventRepository: {
      append: vi.fn(async () => undefined),
    },
    runRepository: {
      getById: vi.fn(async () => params.run ?? null),
      cancel: vi.fn(async () => undefined),
    },
    workItemRepository: {
      getById: vi.fn(async () => workItem),
      getByRunId: vi.fn(async () => workItem),
      cancel: vi.fn(async () => undefined),
    },
  };
}
