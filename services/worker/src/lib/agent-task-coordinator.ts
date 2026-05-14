import type { AgentRecord, AgentToolDefinition } from "@nochore/harness";
import { metadata } from "@trigger.dev/sdk";
import { agentTaskRunTask } from "../triggers/agent-task-run";
import type { AgentRuntime } from "./agent-runtime";
import type { AgentTaskExecutionPayload, AgentTaskExecutionResult } from "./agent-task-execution";
import { ApprovalCheckpointError, recordEvent } from "./run-helpers";

export const DEFAULT_MAX_AGENT_TASKS = 3;

type MetadataApi = {
  set: (key: string, value: string) => void;
};

type AgentTaskTriggerResult = { ok: true; output: AgentTaskExecutionResult } | { ok: false; error: unknown };

export interface AgentTaskRunner {
  triggerAndWait: (payload: AgentTaskExecutionPayload) => Promise<AgentTaskTriggerResult>;
}

export interface DelegateTaskToolSpec {
  runtime: AgentRuntime;
  agent: AgentRecord;
  runId: string;
  projectId: string;
  eventIds: string[];
  maxAgentTasks?: number;
  agentTaskRunner?: AgentTaskRunner;
  metadataApi?: MetadataApi;
}

export function createDelegateTaskTool(spec: DelegateTaskToolSpec): AgentToolDefinition {
  return {
    name: "delegate_task",
    label: "Delegate to Specialist",
    description:
      "Delegate a focused task to a specialist. Roles: scout (research & data gathering), " +
      "analyst (pattern analysis & insights), builder (executing specific actions). " +
      "Use when a task benefits from focused attention.",
    parameters: {
      type: "object",
      required: ["role", "task"],
      properties: {
        role: { type: "string", enum: ["scout", "analyst", "builder"], description: "Specialist role" },
        task: { type: "string", description: "What the specialist should do" },
        context: { type: "string", description: "Optional data or context to pass to the specialist" },
      },
    },
    execute: async (_toolCallId, params) => {
      return runDelegatedAgentTask({
        ...spec,
        role: (params.role as string) ?? "scout",
        task: (params.task as string) ?? "",
        context: params.context as string | undefined,
      });
    },
  };
}

export async function runDelegatedAgentTask(
  params: DelegateTaskToolSpec & {
    role: string;
    task: string;
    context?: string;
  },
): Promise<Awaited<ReturnType<AgentToolDefinition["execute"]>>> {
  const maxAgentTasks = params.maxAgentTasks ?? DEFAULT_MAX_AGENT_TASKS;
  const metadataApi = params.metadataApi ?? metadata;
  const agentTaskRunner = params.agentTaskRunner ?? agentTaskRunTask;
  const currentCount = await params.runtime.agentTaskRepository.countByParentRun(params.runId);

  if (currentCount >= maxAgentTasks) {
    return {
      content: [{ type: "text", text: `Task limit reached (${maxAgentTasks}). Cannot delegate further.` }],
      details: { blocked: true, reason: "maxAgentTasks" },
    };
  }

  const taskId = await params.runtime.agentTaskRepository.create({
    parentRunId: params.runId,
    rootRunId: params.runId,
    agentId: params.agent.id,
    role: params.role,
    title: params.task.slice(0, 200),
  });
  const parentWorkItem = await params.runtime.workItemRepository.getByRunId(params.runId);
  const taskWorkItemId = parentWorkItem
    ? await params.runtime.workItemRepository.create({
        sessionId: parentWorkItem.sessionId,
        agentId: params.agent.id,
        kind: "delegated_task",
        status: "queued",
        parentWorkItemId: parentWorkItem.id,
        agentTaskId: taskId,
        title: `${params.role}: ${params.task.slice(0, 160)}`,
        input: {
          role: params.role,
          task: params.task,
          context: params.context,
        },
      })
    : undefined;

  const startPayload = {
    role: params.role,
    task: params.task,
    taskId,
    taskIndex: currentCount + 1,
    parentRunId: params.runId,
    rootRunId: params.runId,
  };
  const startId = await recordEvent(params.runtime, params.runId, params.agent.id, "task_started", startPayload);
  params.eventIds.push(startId);

  await params.runtime.runRepository.markWaitingForTasks(params.runId);
  if (taskWorkItemId) {
    await params.runtime.workItemRepository.markRunning(taskWorkItemId);
  }
  metadataApi.set("status", "waiting_for_tasks");

  try {
    const result = await agentTaskRunner.triggerAndWait({
      taskId,
      parentRunId: params.runId,
      rootRunId: params.runId,
      agentId: params.agent.id,
      projectId: params.projectId,
      role: params.role,
      task: params.task,
      context: params.context,
    });

    if (!result.ok) {
      return recordFailedAgentTask({
        ...params,
        taskId,
        workItemId: taskWorkItemId,
        error: String(result.error ?? "Agent task failed"),
        metadataApi,
      });
    }

    const output = result.output;
    if (output.status === "stopped") {
      await handleStoppedAgentTask({
        runtime: params.runtime,
        runId: params.runId,
        agentId: params.agent.id,
        role: params.role,
        taskId,
        result: output,
        eventIds: params.eventIds,
        workItemId: taskWorkItemId,
      });
    }

    await params.runtime.runRepository.markRunning(params.runId);
    metadataApi.set("status", "running");
    const completePayload = {
      role: params.role,
      outcome: "completed",
      success: true,
      summary: output.result.summary,
      outputLength: output.result.rawText.length,
      taskId,
      parentRunId: params.runId,
      rootRunId: params.runId,
    };
    const completeId = await recordEvent(
      params.runtime,
      params.runId,
      params.agent.id,
      "task_completed",
      completePayload,
    );
    params.eventIds.push(completeId);
    if (taskWorkItemId) {
      await params.runtime.workItemRepository.complete(taskWorkItemId, new Date(), {
        summary: output.result.summary,
        rawText: output.result.rawText,
        durationMs: output.durationMs,
      });
    }

    return {
      content: [{ type: "text", text: output.result.summary || output.result.rawText || "(No output)" }],
      details: { role: params.role, success: true, durationMs: output.durationMs, taskId, result: output.result },
    };
  } catch (err) {
    if (err instanceof ApprovalCheckpointError) {
      throw err;
    }

    return recordFailedAgentTask({
      ...params,
      taskId,
      workItemId: taskWorkItemId,
      error: err instanceof Error ? err.message : String(err),
      metadataApi,
    });
  }
}

export async function handleStoppedAgentTask(params: {
  runtime: AgentRuntime;
  runId: string;
  agentId: string;
  role: string;
  taskId: string;
  result: Extract<AgentTaskExecutionResult, { status: "stopped" }>;
  eventIds: string[];
  workItemId?: string;
}): Promise<never> {
  const stopPayload = {
    role: params.role,
    outcome: "stopped",
    success: false,
    cause: params.result.cause,
    reason: params.result.reason,
    taskId: params.taskId,
    parentRunId: params.runId,
    rootRunId: params.runId,
    ...(params.result.approvalId ? { approvalId: params.result.approvalId } : {}),
  };
  const eventId = await recordEvent(params.runtime, params.runId, params.agentId, "task_completed", stopPayload);
  params.eventIds.push(eventId);
  if (params.workItemId) {
    await params.runtime.workItemRepository.setStatus(params.workItemId, "waiting_for_approval");
  }
  throw new ApprovalCheckpointError(
    params.result.reason ?? "An agent task stopped awaiting human input",
    params.result.cause === "approval_expired" ? "expired" : "rejected",
    {
      approvalId: params.result.approvalId,
      taskId: params.taskId,
    },
  );
}

async function recordFailedAgentTask(
  params: DelegateTaskToolSpec & {
    role: string;
    taskId: string;
    workItemId?: string;
    error: string;
    metadataApi: MetadataApi;
  },
): Promise<Awaited<ReturnType<AgentToolDefinition["execute"]>>> {
  await params.runtime.runRepository.markRunning(params.runId);
  params.metadataApi.set("status", "running");
  await params.runtime.agentTaskRepository.fail(params.taskId, new Date(), params.error);
  if (params.workItemId) {
    await params.runtime.workItemRepository.fail(params.workItemId, new Date(), params.error);
  }
  const failPayload = {
    role: params.role,
    success: false,
    error: params.error,
    taskId: params.taskId,
    parentRunId: params.runId,
    rootRunId: params.runId,
  };
  const failId = await recordEvent(params.runtime, params.runId, params.agent.id, "task_completed", failPayload);
  params.eventIds.push(failId);

  return {
    content: [{ type: "text", text: `Specialist (${params.role}) failed: ${params.error}` }],
    details: { role: params.role, success: false, error: params.error, taskId: params.taskId },
  };
}
