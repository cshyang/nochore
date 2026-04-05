import { getAgentWorkspacePath, MetricObservationSchema, type PiToolDefinition } from "@nochore/harness";
import { logger, metadata, task } from "@trigger.dev/sdk/v3";
import { buildSubRunPrompt, createWorkerRuntime } from "../lib/agent-runtime";
import { executePiAgent } from "../lib/pi-runtime";
import {
  ApprovalCheckpointError,
  createToolConfigLookup,
  evaluatePolicy,
  getToolConfigForCall,
  handleApprovalRequest,
  normalizeToolInput,
  recordEvent,
  type RunEventType,
} from "../lib/run-helpers";
import { listProviderTools } from "../lib/tool-provider";

export interface WorkerRunPayload {
  workItemId: string;
  parentRunId: string;
  rootRunId: string;
  agentId: string;
  projectId: string;
  role: string;
  task: string;
  context?: string;
  agentInstructions: string;
}

export interface WorkerRunResult {
  workItemId: string;
  output: string;
  durationMs: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
}

export const workerRunTask = task({
  id: "worker-run",
  retry: { maxAttempts: 1 },
  run: async (payload: WorkerRunPayload): Promise<WorkerRunResult> => {
    const runtime = await createWorkerRuntime(payload.projectId);

    const agent = await runtime.agentRepository.getById(payload.agentId);
    if (!agent) {
      throw new Error(`Agent ${payload.agentId} not found`);
    }

    await runtime.workItemRepository.markRunning(payload.workItemId);
    metadata.set("status", "running");

    const eventIds: string[] = [];

    try {
      const subPrompt = buildSubRunPrompt({
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
      // No spawn_sub_run — workers cannot delegate further
      const childTools = allTools.filter((t) => t.name !== "spawn_sub_run");

      const recordMetricTool: PiToolDefinition = {
        name: "record_metric",
        label: "Record Metric",
        description:
          "Record a numeric metric observation. Use this when you observe a quantitative metric " +
          "relevant to your outcome. Provide a consistent comparabilityKey so the same metric " +
          "can be tracked across runs.",
        parameters: {
          type: "object",
          required: ["name", "value", "comparabilityKey"],
          properties: {
            name: { type: "string", description: "Human-readable metric name" },
            value: { type: "number", description: "The numeric value observed" },
            unit: { type: "string", description: "Unit of measurement (e.g., 'USD', '%', 'ms')" },
            window: { type: "string", description: "Time window (e.g., '7d', '24h')" },
            scope: { type: "string", description: "What the metric measures" },
            source: { type: "string", description: "Data source (e.g., 'google_ads')" },
            comparabilityKey: {
              type: "string",
              description: "Stable key for tracking across runs (format: metric_name|scope|window)",
            },
          },
        },
        execute: async (_toolCallId, params) => {
          const raw = {
            name: params.name,
            value: params.value,
            unit: params.unit,
            window: params.window,
            scope: params.scope,
            source: params.source,
            observedAt: new Date().toISOString(),
            comparabilityKey: params.comparabilityKey,
          };
          const parsed = MetricObservationSchema.safeParse(raw);
          if (!parsed.success) {
            const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
            return { content: [{ type: "text" as const, text: `Invalid metric: ${msg}` }], details: { error: msg } };
          }
          await recordEvent(runtime, payload.parentRunId, agent.id, "metric_observed", parsed.data as Record<string, unknown>);
          return {
            content: [
              {
                type: "text" as const,
                text: `Recorded metric: ${parsed.data.name} = ${parsed.data.value}${parsed.data.unit ? ` ${parsed.data.unit}` : ""}`,
              },
            ],
            details: parsed.data as Record<string, unknown>,
          };
        },
      };
      childTools.push(recordMetricTool);

      const toolConfigLookup = createToolConfigLookup(agent, childTools);

      const workspacePath = getAgentWorkspacePath(payload.projectId, payload.agentId);
      const learnedRules = await runtime.learnedRuleRepository.listActive(agent.id);
      const recentToolCalls: Array<{ toolName: string; timestamp: Date }> = [];

      const result = await executePiAgent({
        systemPrompt: subPrompt,
        userPrompt: payload.task,
        workspacePath,
        composioTools: childTools,
        onEvent: async (event) => {
          if (event.type === "tool_executed") {
            recentToolCalls.push({ toolName: event.payload.toolName as string, timestamp: new Date() });
          }
          const id = await recordEvent(
            runtime,
            payload.parentRunId,
            payload.agentId,
            event.type as RunEventType,
            {
              ...event.payload,
              workItemId: payload.workItemId,
              rootRunId: payload.rootRunId,
              subRunRole: payload.role,
            },
          );
          eventIds.push(id);
          return id;
        },
        beforeToolCall: async (toolName, args) => {
          const toolInput = normalizeToolInput(args);
          const policy = evaluatePolicy(
            {
              toolName,
              toolInput,
              toolConfig: getToolConfigForCall(agent, toolConfigLookup, toolName),
            },
            {
              now: new Date(),
              globalApprovalRequired: agent.toolConfig.globalApprovalRequired,
              recentToolCalls,
              learnedRules,
            },
          );
          if (policy.result === "auto") return undefined;
          if (policy.result === "blocked") return { block: true, reason: policy.reason };

          // Mark work item as waiting for approval before checkpointing
          await runtime.workItemRepository.markWaitingForApproval(payload.workItemId);

          const approvalResult = await handleApprovalRequest({
            runtime,
            agent,
            runId: payload.parentRunId,
            toolName,
            toolInput,
            policyReason: policy.reason,
            eventIds,
            projectId: payload.projectId,
            workItemId: payload.workItemId,
          });

          // Approval granted — mark work item back to running
          await runtime.workItemRepository.markRunning(payload.workItemId);
          return approvalResult;
        },
      });

      await runtime.workItemRepository.complete(
        payload.workItemId,
        new Date(),
        result.output,
        { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      );
      metadata.set("status", "completed");

      logger.info("Worker run completed", {
        workItemId: payload.workItemId,
        parentRunId: payload.parentRunId,
        role: payload.role,
        durationMs: result.durationMs,
        toolCallCount: result.toolCalls.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      });

      return {
        workItemId: payload.workItemId,
        output: result.output,
        durationMs: result.durationMs,
        toolCallCount: result.toolCalls.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isApprovalTerminal = error instanceof ApprovalCheckpointError;

      await runtime.workItemRepository.fail(payload.workItemId, new Date(), message);
      metadata.set("status", "failed");

      logger.error("Worker run failed", {
        workItemId: payload.workItemId,
        parentRunId: payload.parentRunId,
        role: payload.role,
        error: message,
      });

      if (!isApprovalTerminal) {
        throw error;
      }
      // Approval rejection/expiry: return empty output instead of rethrowing
      return {
        workItemId: payload.workItemId,
        output: "",
        durationMs: 0,
        toolCallCount: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    }
  },
});
