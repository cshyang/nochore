import type { AgentRecord } from "@nochore/harness";
import { metadata, wait } from "@trigger.dev/sdk/v3";
import type { AgentRuntime } from "./agent-runtime";
import { recordEvent } from "./event-recording";

export type ApprovalStopCause = "approval_rejected" | "approval_expired";

export type ApprovalWaitApi = {
  createToken: (params: { idempotencyKey: string; timeout: string; tags: string[] }) => Promise<{ id: string }>;
  forToken: <T>(token: { id: string }) => {
    unwrap: () => Promise<T | undefined>;
  };
};

export type ApprovalMetadataApi = {
  set: (key: string, value: string) => void;
};

export function isApprovalTimeoutError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /\b(timeout|timed out|expired)\b/i.test(message);
}

export class ApprovalCheckpointError extends Error {
  readonly stopCause: ApprovalStopCause;
  readonly approvalId?: string;
  readonly taskId?: string;

  constructor(
    message: string,
    readonly status: "rejected" | "expired",
    details?: { approvalId?: string; taskId?: string },
  ) {
    super(message);
    this.name = "ApprovalCheckpointError";
    this.stopCause = status === "expired" ? "approval_expired" : "approval_rejected";
    this.approvalId = details?.approvalId;
    this.taskId = details?.taskId;
  }
}

export async function handleApprovalRequest(params: {
  runtime: AgentRuntime;
  agent: AgentRecord;
  runId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  policyReason: string;
  eventIds: string[];
  projectId: string;
  taskId?: string;
  waitApi?: ApprovalWaitApi;
  metadataApi?: ApprovalMetadataApi;
}): Promise<{ block: boolean; reason?: string } | undefined> {
  const {
    runtime,
    agent,
    runId,
    toolName,
    toolInput,
    policyReason,
    eventIds,
    projectId,
    taskId,
    waitApi = wait,
    metadataApi = metadata,
  } = params;
  const approvalId = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);

  const token = await waitApi.createToken({
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
    taskId,
  });

  const reqPayload = {
    approvalId: approvalRecordId,
    toolName,
    toolInput,
    requestReason: policyReason,
    reason: policyReason,
    policy: "approval",
    expiresAt: expiresAt.toISOString(),
    ...(taskId ? { taskId } : {}),
  };
  const reqId = await recordEvent(runtime, runId, agent.id, "tool_approval_requested", reqPayload);
  eventIds.push(reqId);
  await runtime.approvalRepository.setRequestEventId(approvalRecordId, reqId);

  if (!taskId) {
    await runtime.runRepository.markWaitingForApproval(runId);
    metadataApi.set("status", "waiting_for_approval");
  }

  // Container checkpoints here — resumes when human responds
  let decision: { decision: string; reason?: string };
  let timedOut = false;
  try {
    decision = (await waitApi.forToken<{ decision: string; reason?: string }>(token).unwrap()) ?? {
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
        ...(taskId ? { taskId } : {}),
      };
      const expiryId = await recordEvent(runtime, runId, agent.id, "tool_approval_expired", expiryPayload);
      eventIds.push(expiryId);
    } else {
      await runtime.approvalRepository.markResolved(approvalRecordId, status, reason, new Date());

      const resPayload = {
        approvalId: approvalRecordId,
        toolName,
        status,
        reason,
        ...(taskId ? { taskId } : {}),
      };
      const resId = await recordEvent(runtime, runId, agent.id, "tool_approval_resolved", resPayload);
      eventIds.push(resId);
    }
  } else {
    reason = approvalRow?.decisionReason ?? reason;
  }

  const finalStatus = wasAlreadyResolved ? (approvalRow?.status ?? status) : status;

  if (finalStatus === "approved") {
    if (!taskId) {
      await runtime.runRepository.markRunning(runId);
      metadataApi.set("status", "running");
    }
    return undefined;
  }

  throw new ApprovalCheckpointError(reason, finalStatus === "expired" ? "expired" : "rejected", {
    approvalId: approvalRecordId,
    taskId,
  });
}
