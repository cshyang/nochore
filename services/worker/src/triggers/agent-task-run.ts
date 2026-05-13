import { logger, metadata, task } from "@trigger.dev/sdk";
import { createAgentRuntime } from "../lib/agent-runtime";
import {
  type AgentTaskExecutionPayload,
  type AgentTaskExecutionResult,
  runAgentTaskExecution,
  stopAgentTaskForApproval,
} from "../lib/agent-task-execution";

export type AgentTaskRunPayload = AgentTaskExecutionPayload;
export type AgentTaskRunResult = AgentTaskExecutionResult;
export { stopAgentTaskForApproval };

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
      const result = await runAgentTaskExecution({
        runtime,
        agent,
        taskId: payload.taskId,
        parentRunId: payload.parentRunId,
        rootRunId: payload.rootRunId,
        agentId: payload.agentId,
        projectId: payload.projectId,
        role: payload.role,
        task: payload.task,
        context: payload.context,
        eventIds,
      });

      logger.info("Agent task run completed", {
        taskId: payload.taskId,
        parentRunId: payload.parentRunId,
        role: payload.role,
        durationMs: result.durationMs,
        toolCallCount: result.toolCallCount,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        status: result.status,
      });

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error("Agent task run failed", {
        taskId: payload.taskId,
        parentRunId: payload.parentRunId,
        role: payload.role,
        error: message,
      });
      throw error;
    }
  },
});
