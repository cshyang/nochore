import { type AgentRecord, type AgentToolDefinition, getAgentWorkspacePath } from "@nochore/harness";
import { logger, metadata } from "@trigger.dev/sdk";
import type { AgentExecutor } from "./agent-executor";
import type { AgentRuntime } from "./agent-runtime";
import { buildAgentTaskPrompt, resolveAgentConnectionContext } from "./agent-runtime";
import { type AgentSessionSpec, runAgentSession } from "./agent-session";
import { ApprovalCheckpointError } from "./run-helpers";
import { buildAgentTaskToolEnvelope } from "./tool-envelope";
import { listProviderTools } from "./tool-provider";

export interface AgentTaskExecutionPayload {
  taskId: string;
  parentRunId: string;
  rootRunId: string;
  agentId: string;
  projectId: string;
  role: string;
  task: string;
  context?: string;
}

export interface TaskArtifact {
  type: string;
  title: string;
  uri?: string;
}

export interface TaskMetric {
  name: string;
  value: number;
  unit?: string;
}

export interface TaskResult {
  summary: string;
  findings: string[];
  artifacts: TaskArtifact[];
  metrics: TaskMetric[];
  nextActions: string[];
  rawText: string;
}

export interface AgentTaskExecutionSpec extends AgentTaskExecutionPayload {
  runtime: AgentRuntime;
  agent: AgentRecord;
  eventIds: string[];
  providerTools?: AgentToolDefinition[];
  executor?: AgentExecutor;
  approvalHandler?: AgentSessionSpec["approvalHandler"];
  metadataApi?: { set: (key: string, value: string) => void };
}

export interface AgentTaskExecutionCompletedResult {
  taskId: string;
  status: "completed";
  result: TaskResult;
  durationMs: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
}

export interface AgentTaskExecutionStoppedResult {
  taskId: string;
  status: "stopped";
  result: TaskResult;
  durationMs: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  cause: ApprovalCheckpointError["stopCause"];
  reason: string;
  approvalId?: string;
}

export type AgentTaskExecutionResult = AgentTaskExecutionCompletedResult | AgentTaskExecutionStoppedResult;

export async function runAgentTaskExecution(spec: AgentTaskExecutionSpec): Promise<AgentTaskExecutionResult> {
  const metadataApi = spec.metadataApi ?? metadata;

  try {
    const providerTools =
      spec.providerTools ??
      (await resolveAgentConnectionContext({
        db: spec.runtime.db,
        projectId: spec.projectId,
        agent: spec.agent,
      }).then((connectionContext) =>
        listProviderTools({
          userId: spec.runtime.userId,
          activeProviders: connectionContext.activeProviders,
          providerConfigs: connectionContext.providerConfigs,
          providerBindings: connectionContext.providerBindings,
        }),
      ));
    const taskTools = buildAgentTaskToolEnvelope(providerTools);
    const workspacePath = getAgentWorkspacePath(spec.projectId, spec.agentId);
    const taskPrompt = buildAgentTaskExecutionPrompt({
      agent: spec.agent,
      role: spec.role,
      task: spec.task,
      context: spec.context,
      allowedToolNames: taskTools.map((tool) => tool.name),
    });

    const result = await runAgentSession({
      runtime: spec.runtime,
      agent: spec.agent,
      runId: spec.parentRunId,
      projectId: spec.projectId,
      systemPrompt: taskPrompt,
      userPrompt: spec.task,
      workspacePath,
      tools: taskTools,
      eventIds: spec.eventIds,
      correlation: {
        taskId: spec.taskId,
        rootRunId: spec.rootRunId,
        taskRole: spec.role,
      },
      onTaskApprovalWaiting: async (taskId) => {
        await spec.runtime.agentTaskRepository.markWaitingForApproval(taskId);
      },
      onTaskApprovalResumed: async (taskId) => {
        await spec.runtime.agentTaskRepository.markRunning(taskId);
      },
      executor: spec.executor,
      approvalHandler: spec.approvalHandler,
    });

    const taskResult = normalizeTaskResult(result.output);
    await spec.runtime.agentTaskRepository.complete(spec.taskId, new Date(), JSON.stringify(taskResult), {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
    metadataApi.set("status", "completed");

    return {
      taskId: spec.taskId,
      status: "completed",
      result: taskResult,
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
        runtime: spec.runtime,
        taskId: spec.taskId,
        error,
        metadataApi,
      });

      return {
        taskId: spec.taskId,
        status: "stopped",
        result: normalizeTaskResult(""),
        durationMs: 0,
        toolCallCount: 0,
        inputTokens: 0,
        outputTokens: 0,
        cause: error.stopCause,
        reason: error.message,
        approvalId: error.approvalId,
      };
    }

    await spec.runtime.agentTaskRepository.fail(spec.taskId, new Date(), message);
    metadataApi.set("status", "failed");
    logger.error("Agent task execution failed", {
      taskId: spec.taskId,
      parentRunId: spec.parentRunId,
      role: spec.role,
      error: message,
    });
    throw error;
  }
}

export async function stopAgentTaskForApproval(params: {
  runtime: AgentRuntime;
  taskId: string;
  error: ApprovalCheckpointError;
  metadataApi?: { set: (key: string, value: string) => void };
}) {
  await params.runtime.agentTaskRepository.stop(params.taskId, new Date(), params.error.message);
  (params.metadataApi ?? metadata).set("status", "stopped");
}

export function buildAgentTaskExecutionPrompt(params: {
  agent: AgentRecord;
  role: string;
  task: string;
  context?: string;
  allowedToolNames: string[];
}): string {
  const basePrompt = buildAgentTaskPrompt({
    role: params.role,
    task: params.task,
    context: params.context,
    agentInstructions: params.agent.instructions,
    primaryMetric: params.agent.primaryMetric,
  });
  const toolList = params.allowedToolNames.length > 0 ? params.allowedToolNames.join(", ") : "none";
  const resultContract = [
    "## Result Contract",
    "When you have completed your work, call submit_report exactly once.",
    "Set submit_report.report to exactly one JSON object encoded as text.",
    "Do not wrap the JSON in markdown fences or add prose outside the JSON object.",
    "Use this shape:",
    JSON.stringify(
      {
        summary: "One sentence result.",
        findings: ["Important observation."],
        artifacts: [{ type: "report", title: "Artifact title", uri: "optional://uri" }],
        metrics: [{ name: "Metric name", value: 123, unit: "optional unit" }],
        nextActions: ["Recommended next action."],
        rawText: "Complete prose result for the lead agent.",
      },
      null,
      2,
    ),
    "",
    "Keep arrays empty when there is nothing to report. rawText must contain the complete answer.",
    `Allowed external tools for this task: ${toolList}.`,
  ].join("\n");

  return [basePrompt, resultContract].join("\n\n");
}

export function normalizeTaskResult(output: string): TaskResult {
  const rawText = output.trim();
  const parsed = parseTaskResultObject(rawText);

  if (parsed) {
    return {
      summary: nonEmptyString(parsed.summary) ?? fallbackSummary(rawText),
      findings: stringArray(parsed.findings),
      artifacts: artifactArray(parsed.artifacts),
      metrics: metricArray(parsed.metrics),
      nextActions: stringArray(parsed.nextActions),
      rawText: nonEmptyString(parsed.rawText) ?? rawText,
    };
  }

  return {
    summary: fallbackSummary(rawText),
    findings: [],
    artifacts: [],
    metrics: [],
    nextActions: [],
    rawText,
  };
}

function parseTaskResultObject(output: string): Record<string, unknown> | null {
  if (!output) return null;
  const candidates = [output, ...extractJsonFences(output), extractJsonObject(output)].filter(
    (candidate): candidate is string => typeof candidate === "string" && candidate.trim().length > 0,
  );

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function extractJsonFences(output: string): string[] {
  return Array.from(output.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi))
    .map((match) => match[1]?.trim())
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}

function extractJsonObject(output: string): string | null {
  const start = output.indexOf("{");
  const end = output.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return output.slice(start, end + 1);
}

function fallbackSummary(rawText: string): string {
  return rawText.split(/\n|\./, 1)[0]?.trim().slice(0, 200) || "Task completed";
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function artifactArray(value: unknown): TaskArtifact[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const type = nonEmptyString(record.type);
      const title = nonEmptyString(record.title);
      if (!type || !title) return null;
      const uri = nonEmptyString(record.uri);
      return { type, title, ...(uri ? { uri } : {}) };
    })
    .filter((item): item is TaskArtifact => item != null);
}

function metricArray(value: unknown): TaskMetric[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const record = item as Record<string, unknown>;
      const name = nonEmptyString(record.name);
      const value = typeof record.value === "number" && Number.isFinite(record.value) ? record.value : undefined;
      if (!name || value == null) return null;
      const unit = nonEmptyString(record.unit);
      return { name, value, ...(unit ? { unit } : {}) };
    })
    .filter((item): item is TaskMetric => item != null);
}
