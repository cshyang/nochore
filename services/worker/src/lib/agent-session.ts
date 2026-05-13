import { type AgentRecord, type AgentToolDefinition, MetricObservationSchema } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk";
import type { AgentExecutionResult, AgentExecutor } from "./agent-executor";
import { defaultAgentExecutor } from "./agent-executor-selector";
import type { AgentRuntime } from "./agent-runtime";
import {
  createToolConfigLookup,
  evaluatePolicy,
  getToolConfigForCall,
  handleApprovalRequest,
  normalizeToolInput,
  type RunEventType,
  recordEvent,
} from "./run-helpers";

export interface AgentSessionCorrelation {
  taskId?: string;
  rootRunId?: string;
  taskRole?: string;
}

export interface AgentSessionSpec {
  runtime: AgentRuntime;
  agent: AgentRecord;
  runId: string;
  projectId: string;
  systemPrompt: string;
  userPrompt: string;
  workspacePath: string;
  tools: AgentToolDefinition[];
  eventIds: string[];
  correlation?: AgentSessionCorrelation;
  onTaskApprovalWaiting?: (taskId: string) => Promise<void>;
  onTaskApprovalResumed?: (taskId: string) => Promise<void>;
  executor?: AgentExecutor;
  approvalHandler?: typeof handleApprovalRequest;
}

export async function runAgentSession(spec: AgentSessionSpec): Promise<AgentExecutionResult> {
  const tools = [...spec.tools, createRecordMetricTool(spec)];
  const executor = spec.executor ?? defaultAgentExecutor;
  const approvalHandler = spec.approvalHandler ?? handleApprovalRequest;
  const toolConfigLookup = createToolConfigLookup(spec.agent, tools);
  const learnedRules = await spec.runtime.learnedRuleRepository.listActive(spec.agent.id);
  const recentToolCalls: Array<{ toolName: string; timestamp: Date }> = [];

  logger.info("Prompt assembled", {
    systemPromptLength: spec.systemPrompt.length,
    systemPromptPreview: spec.systemPrompt.slice(0, 500),
    userPromptPreview: spec.userPrompt.slice(0, 500),
    toolCount: tools.length,
    toolNames: tools.map((tool) => tool.name),
    workspacePath: spec.workspacePath,
    taskId: spec.correlation?.taskId,
  });

  return executor({
    systemPrompt: spec.systemPrompt,
    userPrompt: spec.userPrompt,
    workspacePath: spec.workspacePath,
    tools,
    onEvent: async (event) => {
      if (event.type === "tool_executed") {
        recentToolCalls.push({ toolName: event.payload.toolName as string, timestamp: new Date() });
      }

      const id = await recordEvent(
        spec.runtime,
        spec.runId,
        spec.agent.id,
        event.type as RunEventType,
        withCorrelation(event.payload, spec.correlation),
      );
      spec.eventIds.push(id);
      return id;
    },
    beforeToolCall: async (toolName, args) => {
      const toolInput = normalizeToolInput(args);
      const policy = evaluatePolicy(
        {
          toolName,
          toolInput,
          toolConfig: getToolConfigForCall(spec.agent, toolConfigLookup, toolName),
        },
        {
          now: new Date(),
          globalApprovalRequired: spec.agent.toolConfig.globalApprovalRequired,
          recentToolCalls,
          learnedRules,
        },
      );

      if (policy.result === "auto") return undefined;
      if (policy.result === "blocked") return { block: true, reason: policy.reason };

      const taskId = spec.correlation?.taskId;
      if (taskId) {
        await spec.onTaskApprovalWaiting?.(taskId);
      }

      const approvalResult = await approvalHandler({
        runtime: spec.runtime,
        agent: spec.agent,
        runId: spec.runId,
        toolName,
        toolInput,
        policyReason: policy.reason,
        eventIds: spec.eventIds,
        projectId: spec.projectId,
        taskId,
      });

      if (taskId) {
        await spec.onTaskApprovalResumed?.(taskId);
      }

      return approvalResult;
    },
  });
}

function createRecordMetricTool(spec: AgentSessionSpec): AgentToolDefinition {
  return {
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
        const message = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
        return {
          content: [{ type: "text" as const, text: `Invalid metric: ${message}` }],
          details: { error: message },
        };
      }

      const eventId = await recordEvent(
        spec.runtime,
        spec.runId,
        spec.agent.id,
        "metric_observed",
        withCorrelation(parsed.data as Record<string, unknown>, spec.correlation),
      );
      spec.eventIds.push(eventId);

      return {
        content: [
          {
            type: "text" as const,
            text: `Recorded metric: ${parsed.data.name} = ${parsed.data.value}${
              parsed.data.unit ? ` ${parsed.data.unit}` : ""
            }`,
          },
        ],
        details: withCorrelation(parsed.data as Record<string, unknown>, spec.correlation),
      };
    },
  };
}

function withCorrelation(
  payload: Record<string, unknown>,
  correlation: AgentSessionCorrelation | undefined,
): Record<string, unknown> {
  if (!correlation) {
    return payload;
  }

  return {
    ...payload,
    ...(correlation.taskId ? { taskId: correlation.taskId } : {}),
    ...(correlation.rootRunId ? { rootRunId: correlation.rootRunId } : {}),
    ...(correlation.taskRole ? { taskRole: correlation.taskRole } : {}),
  };
}
