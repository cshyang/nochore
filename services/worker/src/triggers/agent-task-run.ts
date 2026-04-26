import { getAgentWorkspacePath, type PiToolDefinition } from "@nochore/harness";
import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import { buildAgentTaskPrompt, createAgentRuntime } from "../lib/agent-runtime";
import { runAgentSession } from "../lib/agent-session";
import { ApprovalCheckpointError } from "../lib/run-helpers";
import { listProviderTools } from "../lib/tool-provider";

export interface AgentTaskRunPayload {
  taskId: string;
  parentRunId: string;
  rootRunId: string;
  agentId: string;
  projectId: string;
  role: string;
  task: string;
  context?: string;
  agentInstructions: string;
}

export interface AgentTaskRunCompletedResult {
  taskId: string;
  status: "completed";
  output: string;
  durationMs: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AgentTaskRunStoppedResult {
  taskId: string;
  status: "stopped";
  output: string;
  durationMs: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cause: ApprovalCheckpointError["stopCause"];
  reason: string;
  approvalId?: string;
}

export type AgentTaskRunResult = AgentTaskRunCompletedResult | AgentTaskRunStoppedResult;

export async function stopAgentTaskForApproval(params: {
  runtime: Awaited<ReturnType<typeof createAgentRuntime>>;
  taskId: string;
  error: ApprovalCheckpointError;
  metadataApi?: { set: (key: string, value: string) => void };
}) {
  await params.runtime.agentTaskRepository.stop(params.taskId, new Date(), params.error.message);
  (params.metadataApi ?? metadata).set("status", "stopped");
}

export const agentTaskRunTask = task({
  id: "agent-task-run",
  retry: { maxAttempts: 1 },
  run: async (payload: AgentTaskRunPayload): Promise<AgentTaskRunResult> => {
    const runtime = await createAgentRuntime(payload.projectId);

    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    await runtime.agentTaskRepository.markRunning(payload.taskId);
    metadata.set("status", "running");

    const eventIds: string[] = [];

    try {
      const taskPrompt = buildAgentTaskPrompt({
        role: payload.role,
        task: payload.task,
        context: payload.context,
        agentInstructions: payload.agentInstructions,
        primaryMetric: agent.primaryMetric,
      });

      const allTools: PiToolDefinition[] = await listProviderTools({
        userId: runtime.userId,
        activeProviders: runtime.activeProviders,
        providerConfigs: runtime.providerConfigs,
      });
      const taskTools = allTools.filter((tool) => tool.name !== "delegate_task");

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);

      const result = await runAgentSession({
        runtime,
        agent,
        runId: payload.parentRunId,
        projectId: payload.projectId,
        systemPrompt: taskPrompt,
        userPrompt: payload.task,
        workspacePath,
        tools: taskTools,
        eventIds,
        correlation: {
          taskId: payload.taskId,
          rootRunId: payload.rootRunId,
          taskRole: payload.role,
        },
        onTaskApprovalWaiting: async (taskId) => {
          await runtime.agentTaskRepository.markWaitingForApproval(taskId);
        },
        onTaskApprovalResumed: async (taskId) => {
          await runtime.agentTaskRepository.markRunning(taskId);
        },
      });

      await runtime.agentTaskRepository.complete(payload.taskId, new Date(), result.output, {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });
      metadata.set("status", "completed");

      logger.info("Agent task run completed", {
        taskId: payload.taskId,
        parentRunId: payload.parentRunId,
        role: payload.role,
        durationMs: result.durationMs,
        toolCallCount: result.toolCalls.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });

      return {
        taskId: payload.taskId,
        status: "completed",
        output: result.output,
        durationMs: result.durationMs,
        toolCallCount: result.toolCalls.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isApprovalTerminal = error instanceof ApprovalCheckpointError;

      if (isApprovalTerminal) {
        await stopAgentTaskForApproval({
          runtime,
          taskId: payload.taskId,
          error,
        });
      } else {
        await runtime.agentTaskRepository.fail(payload.taskId, new Date(), message);
        metadata.set("status", "failed");
      }

      if (!isApprovalTerminal) {
        logger.error("Agent task run failed", {
          taskId: payload.taskId,
          parentRunId: payload.parentRunId,
          role: payload.role,
          error: message,
        });
        throw error;
      }

      logger.info("Agent task run stopped", {
        taskId: payload.taskId,
        parentRunId: payload.parentRunId,
        role: payload.role,
        reason: message,
      });

      return {
        taskId: payload.taskId,
        status: "stopped",
        output: "",
        durationMs: 0,
        toolCallCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cause: error.stopCause,
        reason: error.message,
        approvalId: error.approvalId,
      };
    }
  },
});
