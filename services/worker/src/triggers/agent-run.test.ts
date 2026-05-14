import type { AgentRecord } from "@nochore/harness";
import { describe, expect, it, vi } from "vitest";
import { createDelegateTaskTool, handleStoppedAgentTask } from "../lib/agent-task-coordinator";
import { ApprovalCheckpointError } from "../lib/run-helpers";
import { recordRunResultInConversation, stopRunForApproval } from "./agent-run";
import type { AgentTaskRunResult } from "./agent-task-run";

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

function createAgent(): AgentRecord {
  return {
    id: "agent_123",
    projectId: "project_123",
    name: "Growth Agent",
    description: "",
    instructions: "Use the connected tools carefully.",
    skills: [],
    toolConfig: { globalApprovalRequired: false, requiredProviders: [], tools: {} },
    notificationConfig: { inApp: true, email: false, slack: false },
    schedule: "manual",
    status: "live",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function createCoordinatorRuntime(options: { initialTaskCount?: number } = {}) {
  const harness = createEventRuntime();
  let taskCount = options.initialTaskCount ?? 0;
  const createdTasks: Array<Record<string, unknown>> = [];
  const failedTasks: Array<{ id: string; error: string }> = [];
  const runStatuses: string[] = [];
  const metadataStatuses: string[] = [];

  return {
    runtime: {
      ...harness.runtime,
      agentTaskRepository: {
        async countByParentRun() {
          return taskCount;
        },
        async create(input: Record<string, unknown>) {
          taskCount += 1;
          const id = `task_${taskCount}`;
          createdTasks.push({ id, ...input });
          return id;
        },
        async fail(id: string, _completedAt: Date, error: string) {
          failedTasks.push({ id, error });
        },
      },
      runRepository: {
        async markWaitingForTasks(id: string) {
          runStatuses.push(`${id}:waiting_for_tasks`);
        },
        async markRunning(id: string) {
          runStatuses.push(`${id}:running`);
        },
      },
      workItemRepository: {
        async getByRunId() {
          return null;
        },
      },
    },
    getEvents: harness.getEvents,
    getCreatedTasks: () => createdTasks,
    getFailedTasks: () => failedTasks,
    getRunStatuses: () => runStatuses,
    metadataApi: {
      set(_key: string, value: string) {
        metadataStatuses.push(value);
      },
    },
    getMetadataStatuses: () => metadataStatuses,
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
        taskId: "task_123",
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
          taskId: "task_123",
        },
      },
    ]);
    expect(eventIds).toEqual(["evt_1"]);
    expect(metadataStatuses).toEqual(["stopped"]);
  });
});

describe("recordRunResultInConversation", () => {
  it("posts a visible run result to the originating chat thread", async () => {
    const upsertMessages = vi.fn(async () => []);
    const upsertStructuredEvents = vi.fn(async () => []);
    const touch = vi.fn(async () => {});
    const runtime = {
      conversationThreadRepository: {
        async getById(id: string) {
          return {
            id,
            agentId: "agent_123",
            scope: "manual",
            channelKind: "web",
            title: "Investigation",
            createdAt: new Date(),
            updatedAt: new Date(),
            consecutiveCompactionFailures: 0,
          };
        },
        getOrCreatePrimary: vi.fn(),
        touch,
      },
      conversationEventRepository: {
        upsertMessages,
        upsertStructuredEvents,
      },
    };

    await recordRunResultInConversation(
      runtime as never,
      "agent_123",
      "run_123",
      {
        status: "completed",
        headline: "Found wasted spend",
        finalText: "Pause the duplicate keyword and lower bids on broad terms.",
        details: ["Tool calls executed: google_ads_search"],
      },
      {
        type: "chat",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        metadata: { threadId: "thread_chat" },
      },
    );

    expect(runtime.conversationThreadRepository.getOrCreatePrimary).not.toHaveBeenCalled();
    expect(upsertMessages).toHaveBeenCalledWith([
      expect.objectContaining({
        threadId: "thread_chat",
        agentId: "agent_123",
        source: "run",
        message: {
          id: "run-result:run_123",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: "Found wasted spend\n\nPause the duplicate keyword and lower bids on broad terms.",
            },
          ],
        },
      }),
    ]);
    expect(upsertStructuredEvents).toHaveBeenCalledWith([
      expect.objectContaining({
        threadId: "thread_chat",
        agentId: "agent_123",
        source: "run",
        role: "system",
        eventType: "run_result",
        eventKey: "run:run_123:result",
        messageId: "run-result:run_123",
        payload: expect.objectContaining({
          runId: "run_123",
          status: "completed",
          headline: "Found wasted spend",
        }),
      }),
    ]);
    expect(touch.mock.calls[0]?.[0]).toBe("thread_chat");
  });

  it("falls back to the primary inbox when the trigger thread is missing or mismatched", async () => {
    const upsertMessages = vi.fn(async () => []);
    const upsertStructuredEvents = vi.fn(async () => []);
    const touch = vi.fn(async () => {});
    const getOrCreatePrimary = vi.fn(async () => ({
      id: "thread_primary",
      agentId: "agent_123",
      scope: "primary",
      channelKind: "web",
      title: "Main chat",
      createdAt: new Date(),
      updatedAt: new Date(),
      consecutiveCompactionFailures: 0,
    }));
    const runtime = {
      conversationThreadRepository: {
        async getById() {
          return {
            id: "thread_other_agent",
            agentId: "agent_other",
            scope: "manual",
            channelKind: "web",
            title: "Other",
            createdAt: new Date(),
            updatedAt: new Date(),
            consecutiveCompactionFailures: 0,
          };
        },
        getOrCreatePrimary,
        touch,
      },
      conversationEventRepository: {
        upsertMessages,
        upsertStructuredEvents,
      },
    };

    await recordRunResultInConversation(
      runtime as never,
      "agent_123",
      "run_456",
      {
        status: "failed",
        headline: "Growth Agent failed",
        details: ["Error: Missing credentials"],
      },
      {
        type: "chat",
        timestamp: new Date("2026-01-01T00:00:00.000Z"),
        metadata: { threadId: "thread_other_agent" },
      },
    );

    expect(getOrCreatePrimary).toHaveBeenCalledWith("agent_123");
    expect(upsertMessages.mock.calls[0]?.[0]?.[0]).toMatchObject({
      threadId: "thread_primary",
      message: {
        id: "run-result:run_456",
        role: "assistant",
        parts: [{ type: "text", text: "Growth Agent failed\n\nError: Missing credentials" }],
      },
    });
    expect(upsertStructuredEvents.mock.calls[0]?.[0]?.[0]).toMatchObject({
      threadId: "thread_primary",
      eventKey: "run:run_456:result",
      payload: {
        runId: "run_456",
        status: "failed",
        headline: "Growth Agent failed",
        details: ["Error: Missing credentials"],
      },
    });
    expect(touch.mock.calls[0]?.[0]).toBe("thread_primary");
  });
});

describe("createDelegateTaskTool", () => {
  it("creates an agent task, waits for the child run, and resumes the parent", async () => {
    const harness = createCoordinatorRuntime();
    const eventIds: string[] = [];
    const triggerAndWait = vi.fn(async (payload) => ({
      ok: true as const,
      output: {
        taskId: payload.taskId,
        status: "completed" as const,
        result: {
          summary: "Specialist found the answer.",
          findings: [],
          artifacts: [],
          metrics: [],
          nextActions: [],
          rawText: "Specialist found the answer.",
        },
        durationMs: 1200,
        toolCallCount: 2,
        inputTokens: 100,
        outputTokens: 25,
      },
    }));

    const tool = createDelegateTaskTool({
      runtime: harness.runtime as never,
      agent: createAgent(),
      runId: "run_123",
      projectId: "project_123",
      eventIds,
      agentTaskRunner: { triggerAndWait },
      metadataApi: harness.metadataApi,
    });

    const result = await tool.execute("call_123", {
      role: "analyst",
      task: "Review the latest campaign data.",
      context: "Use the last 7 days only.",
    });

    expect(harness.getCreatedTasks()).toEqual([
      {
        id: "task_1",
        parentRunId: "run_123",
        rootRunId: "run_123",
        agentId: "agent_123",
        role: "analyst",
        title: "Review the latest campaign data.",
      },
    ]);
    expect(triggerAndWait).toHaveBeenCalledWith({
      taskId: "task_1",
      parentRunId: "run_123",
      rootRunId: "run_123",
      agentId: "agent_123",
      projectId: "project_123",
      role: "analyst",
      task: "Review the latest campaign data.",
      context: "Use the last 7 days only.",
    });
    expect(harness.getRunStatuses()).toEqual(["run_123:waiting_for_tasks", "run_123:running"]);
    expect(harness.getMetadataStatuses()).toEqual(["waiting_for_tasks", "running"]);
    expect(result).toEqual({
      content: [{ type: "text", text: "Specialist found the answer." }],
      details: {
        role: "analyst",
        success: true,
        durationMs: 1200,
        taskId: "task_1",
        result: {
          summary: "Specialist found the answer.",
          findings: [],
          artifacts: [],
          metrics: [],
          nextActions: [],
          rawText: "Specialist found the answer.",
        },
      },
    });
    expect(harness.getEvents().map((event) => event.type)).toEqual(["task_started", "task_completed"]);
    expect(harness.getEvents()[0]?.payload).toMatchObject({
      role: "analyst",
      taskId: "task_1",
      taskIndex: 1,
      parentRunId: "run_123",
      rootRunId: "run_123",
    });
    expect(harness.getEvents()[1]?.payload).toMatchObject({
      role: "analyst",
      success: true,
      taskId: "task_1",
      outputLength: 28,
    });
    expect(eventIds).toEqual(["evt_1", "evt_2"]);
  });

  it("keeps the parent run alive when a delegated task fails", async () => {
    const harness = createCoordinatorRuntime();
    const triggerAndWait = vi.fn(async () => ({
      ok: false as const,
      error: "Child container failed",
    }));

    const tool = createDelegateTaskTool({
      runtime: harness.runtime as never,
      agent: createAgent(),
      runId: "run_123",
      projectId: "project_123",
      eventIds: [],
      agentTaskRunner: { triggerAndWait },
      metadataApi: harness.metadataApi,
    });

    const result = await tool.execute("call_123", {
      role: "scout",
      task: "Collect account data.",
    });

    expect(harness.getFailedTasks()).toEqual([{ id: "task_1", error: "Child container failed" }]);
    expect(harness.getRunStatuses()).toEqual(["run_123:waiting_for_tasks", "run_123:running"]);
    expect(result).toEqual({
      content: [{ type: "text", text: "Specialist (scout) failed: Child container failed" }],
      details: { role: "scout", success: false, error: "Child container failed", taskId: "task_1" },
    });
    expect(harness.getEvents().at(-1)?.payload).toMatchObject({
      role: "scout",
      success: false,
      error: "Child container failed",
      taskId: "task_1",
    });
  });

  it("blocks delegation once the parent run reaches the task limit", async () => {
    const harness = createCoordinatorRuntime({ initialTaskCount: 3 });
    const triggerAndWait = vi.fn();

    const tool = createDelegateTaskTool({
      runtime: harness.runtime as never,
      agent: createAgent(),
      runId: "run_123",
      projectId: "project_123",
      eventIds: [],
      agentTaskRunner: { triggerAndWait },
      metadataApi: harness.metadataApi,
    });

    const result = await tool.execute("call_123", {
      role: "builder",
      task: "Make another change.",
    });

    expect(triggerAndWait).not.toHaveBeenCalled();
    expect(harness.getCreatedTasks()).toEqual([]);
    expect(harness.getEvents()).toEqual([]);
    expect(result).toEqual({
      content: [{ type: "text", text: "Task limit reached (3). Cannot delegate further." }],
      details: { blocked: true, reason: "maxAgentTasks" },
    });
  });
});

describe("handleStoppedAgentTask", () => {
  it("records a stopped child result and rethrows it as an approval checkpoint", async () => {
    const harness = createEventRuntime();
    const eventIds: string[] = [];

    let thrown: unknown;
    try {
      await handleStoppedAgentTask({
        runtime: harness.runtime as never,
        runId: "run_123",
        agentId: "agent_123",
        role: "analyst",
        taskId: "task_123",
        result: {
          taskId: "task_123",
          status: "stopped",
          result: {
            summary: "",
            findings: [],
            artifacts: [],
            metrics: [],
            nextActions: [],
            rawText: "",
          },
          durationMs: 0,
          toolCallCount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cause: "approval_expired",
          reason: "Approval expired after 24 hours",
          approvalId: "approval_123",
        } satisfies Extract<AgentTaskRunResult, { status: "stopped" }>,
        eventIds,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(ApprovalCheckpointError);
    expect(thrown).toMatchObject({
      stopCause: "approval_expired",
      approvalId: "approval_123",
      taskId: "task_123",
      message: "Approval expired after 24 hours",
    });
    expect(harness.getEvents()).toEqual([
      {
        id: "evt_1",
        type: "task_completed",
        payload: {
          role: "analyst",
          outcome: "stopped",
          success: false,
          cause: "approval_expired",
          reason: "Approval expired after 24 hours",
          taskId: "task_123",
          parentRunId: "run_123",
          rootRunId: "run_123",
          approvalId: "approval_123",
        },
      },
    ]);
    expect(eventIds).toEqual(["evt_1"]);
  });
});
