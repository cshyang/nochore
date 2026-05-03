import type { AgentRecord, AgentToolDefinition } from "@nochore/harness";
import { describe, expect, it, vi } from "vitest";
import { runAgentSession } from "../lib/agent-session";
import { normalizeTaskResult, runAgentTaskExecution } from "../lib/agent-task-execution";
import { ApprovalCheckpointError } from "../lib/run-helpers";
import { buildAgentTaskToolEnvelope, buildLeadToolEnvelope } from "../lib/tool-envelope";
import { stopAgentTaskForApproval } from "./agent-task-run";

const providerTool: AgentToolDefinition = {
  name: "slack_send_message",
  label: "Send Slack Message",
  description: "Send a Slack message.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({ content: [{ type: "text", text: "sent" }], details: {} }),
};

const delegateTool: AgentToolDefinition = {
  name: "delegate_task",
  label: "Delegate Task",
  description: "Delegate work.",
  parameters: { type: "object", properties: {} },
  execute: async () => ({ content: [{ type: "text", text: "delegated" }], details: {} }),
};

function createAgent(): AgentRecord {
  return {
    id: "agent_123",
    projectId: "project_123",
    name: "Growth Agent",
    description: "",
    instructions: "Use tools carefully.",
    skills: [],
    toolConfig: { globalApprovalRequired: false, requiredProviders: [], tools: {} },
    notificationConfig: { inApp: true, email: false, slack: false },
    schedule: "manual",
    status: "live",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

function createSessionRuntime() {
  let eventCount = 0;
  const events: Array<{ id: string; type: string; payload: Record<string, unknown> }> = [];

  return {
    runtime: {
      learnedRuleRepository: {
        async listActive() {
          return [];
        },
      },
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

function createExecutionRuntime() {
  const harness = createSessionRuntime();
  const completedTasks: Array<{
    id: string;
    result: string;
    tokens?: { inputTokens?: number; outputTokens?: number };
  }> = [];
  const failedTasks: Array<{ id: string; error: string }> = [];
  const stoppedTasks: Array<{ id: string; error: string }> = [];
  const waitingTasks: string[] = [];
  const runningTasks: string[] = [];
  const metadataStatuses: string[] = [];

  return {
    runtime: {
      ...harness.runtime,
      userId: "user_123",
      activeProviders: [],
      providerConfigs: {},
      agentTaskRepository: {
        async complete(
          id: string,
          _completedAt: Date,
          result: string,
          tokens?: { inputTokens?: number; outputTokens?: number },
        ) {
          completedTasks.push({ id, result, tokens });
        },
        async fail(id: string, _completedAt: Date, error: string) {
          failedTasks.push({ id, error });
        },
        async stop(id: string, _completedAt: Date, error: string) {
          stoppedTasks.push({ id, error });
        },
        async markWaitingForApproval(id: string) {
          waitingTasks.push(id);
        },
        async markRunning(id: string) {
          runningTasks.push(id);
        },
      },
    },
    getEvents: harness.getEvents,
    getCompletedTasks: () => completedTasks,
    getFailedTasks: () => failedTasks,
    getStoppedTasks: () => stoppedTasks,
    getWaitingTasks: () => waitingTasks,
    getRunningTasks: () => runningTasks,
    metadataApi: {
      set(_key: string, value: string) {
        metadataStatuses.push(value);
      },
    },
    getMetadataStatuses: () => metadataStatuses,
  };
}

describe("tool envelopes", () => {
  it("adds delegation only to the lead envelope", () => {
    expect(buildLeadToolEnvelope({ providerTools: [providerTool], delegateTaskTool: delegateTool })).toEqual([
      providerTool,
      delegateTool,
    ]);
  });

  it("rejects delegation in the agent task envelope", () => {
    expect(() => buildAgentTaskToolEnvelope([providerTool, delegateTool])).toThrow(
      'Provider tool "delegate_task" collides with a reserved internal tool name',
    );
  });

  it("rejects duplicate tool names", () => {
    expect(() => buildAgentTaskToolEnvelope([providerTool, providerTool])).toThrow(
      'Duplicate tool name "slack_send_message" in tool envelope',
    );
  });

  it("rejects provider tools that collide with injected internal tools", () => {
    const recordMetricTool = { ...providerTool, name: "record_metric" };
    expect(() => buildLeadToolEnvelope({ providerTools: [recordMetricTool], delegateTaskTool: delegateTool })).toThrow(
      'Provider tool "record_metric" collides with a reserved internal tool name',
    );
  });
});

describe("runAgentTaskExecution", () => {
  it("stores a typed task result and returns token metadata", async () => {
    const harness = createExecutionRuntime();
    const executor = vi.fn(async (config) => {
      expect(config.tools.map((tool) => tool.name)).toEqual(["slack_send_message", "record_metric"]);
      expect(config.systemPrompt).toContain("## Result Contract");
      return {
        output: JSON.stringify({
          summary: "Campaign spend is stable.",
          findings: ["Spend stayed within target."],
          artifacts: [{ type: "report", title: "Spend report", uri: "report://spend" }],
          metrics: [{ name: "Spend", value: 42, unit: "USD" }],
          nextActions: ["Review again tomorrow."],
          rawText: "Campaign spend is stable. Spend stayed within target.",
        }),
        toolCalls: [{ toolName: "slack_send_message", timestamp: new Date("2026-01-01T00:00:00.000Z") }],
        durationMs: 250,
        inputTokens: 100,
        outputTokens: 25,
      };
    });

    const result = await runAgentTaskExecution({
      runtime: harness.runtime as never,
      agent: createAgent(),
      taskId: "task_123",
      parentRunId: "run_123",
      rootRunId: "run_123",
      agentId: "agent_123",
      projectId: "project_123",
      role: "analyst",
      task: "Review spend.",
      eventIds: [],
      providerTools: [providerTool],
      executor,
      metadataApi: harness.metadataApi,
    });

    expect(result).toEqual({
      taskId: "task_123",
      status: "completed",
      result: {
        summary: "Campaign spend is stable.",
        findings: ["Spend stayed within target."],
        artifacts: [{ type: "report", title: "Spend report", uri: "report://spend" }],
        metrics: [{ name: "Spend", value: 42, unit: "USD" }],
        nextActions: ["Review again tomorrow."],
        rawText: "Campaign spend is stable. Spend stayed within target.",
      },
      durationMs: 250,
      toolCallCount: 1,
      inputTokens: 100,
      outputTokens: 25,
    });
    expect(JSON.parse(harness.getCompletedTasks()[0]?.result ?? "{}")).toMatchObject({
      summary: "Campaign spend is stable.",
      rawText: "Campaign spend is stable. Spend stayed within target.",
    });
    expect(harness.getCompletedTasks()[0]?.tokens).toEqual({ inputTokens: 100, outputTokens: 25 });
    expect(harness.getMetadataStatuses()).toEqual(["completed"]);
  });

  it("normalizes prose-only output into a valid task result", () => {
    expect(normalizeTaskResult("First line. More detail here.")).toEqual({
      summary: "First line",
      findings: [],
      artifacts: [],
      metrics: [],
      nextActions: [],
      rawText: "First line. More detail here.",
    });
  });

  it("marks task approval waits on the task and returns a stopped result when approval is rejected", async () => {
    const harness = createExecutionRuntime();
    const executor = vi.fn(async (config) => {
      await config.beforeToolCall?.("slack_send_message", { channel: "ops" });
      throw new Error("Expected approval gate to throw");
    });
    const approvalHandler = vi.fn(async () => {
      throw new ApprovalCheckpointError("Do not send yet", "rejected", {
        approvalId: "approval_123",
        taskId: "task_123",
      });
    });

    const result = await runAgentTaskExecution({
      runtime: harness.runtime as never,
      agent: createAgent(),
      taskId: "task_123",
      parentRunId: "run_123",
      rootRunId: "run_123",
      agentId: "agent_123",
      projectId: "project_123",
      role: "analyst",
      task: "Send an update.",
      eventIds: [],
      providerTools: [providerTool],
      executor,
      approvalHandler,
      metadataApi: harness.metadataApi,
    });

    expect(result).toMatchObject({
      taskId: "task_123",
      status: "stopped",
      cause: "approval_rejected",
      reason: "Do not send yet",
      approvalId: "approval_123",
    });
    expect(harness.getWaitingTasks()).toEqual(["task_123"]);
    expect(harness.getRunningTasks()).toEqual([]);
    expect(harness.getStoppedTasks()).toEqual([{ id: "task_123", error: "Do not send yet" }]);
    expect(harness.getMetadataStatuses()).toEqual(["stopped"]);
  });
});

describe("runAgentSession", () => {
  it("injects record_metric and records correlated task events", async () => {
    const harness = createSessionRuntime();
    const eventIds: string[] = [];
    const executor = vi.fn(async (config) => {
      expect(Object.keys(config)).toContain("tools");
      expect(Object.keys(config)).not.toContain(["composio", "Tools"].join(""));
      expect(config.tools.map((tool) => tool.name)).toEqual(["slack_send_message", "record_metric"]);
      await config.onEvent({ type: "agent_message", payload: { text: "Working on it." } });

      const metricTool = config.tools.find((tool) => tool.name === "record_metric");
      await metricTool?.execute("metric_123", {
        name: "Spend",
        value: 42,
        unit: "USD",
        comparabilityKey: "spend|account|7d",
      });

      return {
        output: "Done.",
        toolCalls: [],
        durationMs: 10,
        inputTokens: 11,
        outputTokens: 12,
      };
    });

    await runAgentSession({
      runtime: harness.runtime as never,
      agent: createAgent(),
      runId: "run_123",
      projectId: "project_123",
      systemPrompt: "system",
      userPrompt: "user",
      workspacePath: "/tmp/nochore-test",
      tools: [providerTool],
      eventIds,
      correlation: {
        taskId: "task_123",
        rootRunId: "run_123",
        taskRole: "analyst",
      },
      executor,
    });

    expect(executor).toHaveBeenCalledTimes(1);
    expect(harness.getEvents()).toEqual([
      {
        id: "evt_1",
        type: "agent_message",
        payload: {
          text: "Working on it.",
          taskId: "task_123",
          rootRunId: "run_123",
          taskRole: "analyst",
        },
      },
      {
        id: "evt_2",
        type: "metric_observed",
        payload: expect.objectContaining({
          name: "Spend",
          value: 42,
          taskId: "task_123",
          rootRunId: "run_123",
          taskRole: "analyst",
        }),
      },
    ]);
    expect(eventIds).toEqual(["evt_1", "evt_2"]);
  });

  it("passes task approval correlation through the session policy gate", async () => {
    const harness = createSessionRuntime();
    const waiting = vi.fn(async () => {});
    const resumed = vi.fn(async () => {});
    const approvalHandler = vi.fn(async () => undefined);
    const executor = vi.fn(async (config) => {
      const gateResult = await config.beforeToolCall?.("slack_send_message", { channel: "ops" });
      expect(gateResult).toBeUndefined();

      return {
        output: "Done.",
        toolCalls: [],
        durationMs: 10,
        inputTokens: 11,
        outputTokens: 12,
      };
    });

    await runAgentSession({
      runtime: harness.runtime as never,
      agent: createAgent(),
      runId: "run_123",
      projectId: "project_123",
      systemPrompt: "system",
      userPrompt: "user",
      workspacePath: "/tmp/nochore-test",
      tools: [providerTool],
      eventIds: [],
      correlation: {
        taskId: "task_123",
        rootRunId: "run_123",
        taskRole: "analyst",
      },
      onTaskApprovalWaiting: waiting,
      onTaskApprovalResumed: resumed,
      approvalHandler,
      executor,
    });

    expect(waiting).toHaveBeenCalledWith("task_123");
    expect(resumed).toHaveBeenCalledWith("task_123");
    expect(approvalHandler).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task_123" }));
  });
});

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
