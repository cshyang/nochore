import {
  type AgentRecord,
  buildToolConfigEntry,
  evaluatePolicy,
  type PiToolDefinition,
  type ToolConfigEntry,
  type ToolMode,
} from "@nochore/harness";
import { logger, metadata, wait } from "@trigger.dev/sdk/v3";
import type { createWorkerRuntime } from "./agent-runtime";

export type RunEventType =
  | "run_started"
  | "prompt_built"
  | "tool_called"
  | "tool_executed"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "tool_approval_expired"
  | "policy_rule_suggested"
  | "agent_message"
  | "finding_recorded"
  | "sub_run_started"
  | "sub_run_completed"
  | "lesson_distilled"
  | "run_completed"
  | "run_failed";

export async function recordEvent(
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>,
  runId: string,
  agentId: string,
  type: RunEventType,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = await runtime.runEventRepository.append({
    runId,
    agentId,
    timestamp: new Date(),
    type,
    payload,
  });

  logger.info("Agent run event", { runId, agentId, type });
  return id;
}

export async function handleApprovalRequest(params: {
  runtime: Awaited<ReturnType<typeof createWorkerRuntime>>;
  agent: AgentRecord;
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  policyReason: string;
  eventIds: string[];
  projectId: string;
  workItemId?: string;
}): Promise<{ block: boolean; reason?: string } | undefined> {
  const { runtime, agent, runId, toolName, toolInput, policyReason, eventIds, projectId, workItemId } = params;
  const approvalId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

  const token = await wait.createToken({
    idempotencyKey: `approval-${runId}-${approvalId}`,
    timeout: "24h",
    tags: [projectId, agent.id, runId, approvalId, toolName],
  });

  const approvalRecordId = await runtime.approvalRepository.create({
    runId,
    agentId: agent.id,
    approvalId,
    waitTokenId: token.id,
    toolName,
    toolInput,
    requestReason: policyReason,
    createdAt,
    expiresAt,
    workItemId,
  });

  const reqPayload = {
    approvalId: approvalRecordId,
    toolName,
    toolInput,
    requestReason: policyReason,
    reason: policyReason,
    policy: "approval",
    expiresAt: expiresAt.toISOString(),
    ...(workItemId ? { workItemId } : {}),
  };
  const reqId = await recordEvent(runtime, runId, agent.id, "tool_approval_requested", reqPayload);
  eventIds.push(reqId);
  await runtime.approvalRepository.setRequestEventId(approvalRecordId, reqId);

  await runtime.runRepository.markWaitingForApproval(runId);
  metadata.set("status", "waiting_for_approval");

  // Container checkpoints here — resumes when human responds
  let decision: { decision: string; reason?: string };
  let timedOut = false;
  try {
    decision = (await wait.forToken<{ decision: string; reason?: string }>(token).unwrap()) ?? {
      decision: "rejected",
      reason: "Token completed without data",
    };
  } catch (err) {
    timedOut = isApprovalTimeoutError(err);
    decision = {
      decision: timedOut ? "expired" : "rejected",
      reason: timedOut ? "Approval expired after 24 hours" : err instanceof Error ? err.message : String(err),
    };
  }

  const status =
    decision.decision === "approved" ? "approved" : decision.decision === "expired" ? "expired" : "rejected";
  let reason = decision.reason ?? policyReason;

  const approvalRow = await runtime.approvalRepository.getById(approvalRecordId);
  const wasAlreadyResolved = approvalRow?.status && approvalRow.status !== "pending";

  if (!wasAlreadyResolved) {
    if (status === "expired") {
      await runtime.approvalRepository.markExpired(approvalRecordId, reason, new Date());
      const expiryPayload = {
        approvalId: approvalRecordId,
        toolName,
        reason,
        expiresAt: expiresAt.toISOString(),
        ...(workItemId ? { workItemId } : {}),
      };
      const expiryId = await recordEvent(runtime, runId, agent.id, "tool_approval_expired", expiryPayload);
      eventIds.push(expiryId);
    } else {
      await runtime.approvalRepository.markResolved(approvalRecordId, status, reason, new Date());

      const resPayload = { approvalId: approvalRecordId, toolName, status, reason, ...(workItemId ? { workItemId } : {}) };
      const resId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", resPayload);
      eventIds.push(resId);
    }
  } else {
    reason = approvalRow?.decisionReason ?? reason;
  }

  if ((approvalRow?.status ?? status) === "approved") {
    await runtime.runRepository.markRunning(runId);
    metadata.set("status", "running");
    return undefined;
  }

  throw new ApprovalCheckpointError(reason, (approvalRow?.status ?? status) === "expired" ? "expired" : "rejected");
}

export function normalizeToolInput(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

export class ApprovalCheckpointError extends Error {
  constructor(
    message: string,
    readonly status: "rejected" | "expired",
  ) {
    super(message);
    this.name = "ApprovalCheckpointError";
  }
}

export const INTERNAL_TOOL_MODES: Record<string, ToolMode> = {
  bash: "write",
  edit: "write",
  read: "read",
  spawn_sub_run: "write",
  submit_report: "read",
  write: "write",
};

export function createToolConfigLookup(agent: AgentRecord, tools: PiToolDefinition[]): Map<string, ToolConfigEntry> {
  const lookup = new Map<string, ToolConfigEntry>();

  for (const tool of tools) {
    lookup.set(
      tool.name,
      buildToolConfigEntry(
        {
          toolName: tool.name,
          slug: tool.name,
          provider: inferToolProvider(tool.name),
          title: tool.label,
          description: tool.description,
          mode: INTERNAL_TOOL_MODES[tool.name],
        },
        agent.toolConfig.tools[tool.name],
      ),
    );
  }

  return lookup;
}

export function getToolConfigForCall(
  agent: AgentRecord,
  lookup: Map<string, ToolConfigEntry>,
  toolName: string,
): ToolConfigEntry {
  const existing = lookup.get(toolName) ?? agent.toolConfig.tools[toolName];
  if (existing) {
    return existing.provider === "internal" && !agent.toolConfig.tools[toolName]
      ? { ...existing, approvalMode: "auto" }
      : existing;
  }

  const inferred = buildToolConfigEntry({
    toolName,
    slug: toolName,
    provider: inferToolProvider(toolName),
    title: toolName,
    description: "",
    mode: INTERNAL_TOOL_MODES[toolName],
  });

  return inferred.provider === "internal" ? { ...inferred, approvalMode: "auto" } : inferred;
}

export function inferToolProvider(toolName: string): string {
  if (toolName in INTERNAL_TOOL_MODES) {
    return "internal";
  }

  const [prefix] = toolName.split("_");
  return prefix?.toLowerCase() ?? "";
}

function isApprovalTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(timeout|timed out|expired)\b/i.test(message);
}

export { evaluatePolicy };
