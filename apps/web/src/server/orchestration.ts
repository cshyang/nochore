import crypto from "node:crypto";
import type { RunTrigger } from "@nochore/harness";
import { runs, tasks, wait } from "@trigger.dev/sdk";
import { approveActionWithResolution } from "./approvals-core";
import { getProjectDeps } from "./deps";

export async function startAgentRun(params: {
  agentId: string;
  projectId: string;
  trigger: RunTrigger;
}): Promise<{ runId: string; triggerRunId: string }> {
  const { runRepository, runEventRepository } = getProjectDeps(params.projectId);
  const runId = crypto.randomUUID();
  await runRepository.create({
    id: runId,
    agentId: params.agentId,
    triggerType: params.trigger.type,
    startedAt: new Date(),
    status: "queued",
  });
  try {
    const handle = await tasks.trigger("agent-run", {
      agentId: params.agentId,
      projectId: params.projectId,
      trigger: params.trigger,
      runId,
    });
    await runRepository.setTriggerRunId(runId, handle.id);
    return { runId, triggerRunId: handle.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await runRepository.fail(runId, new Date(), message);
    await runEventRepository.append({
      runId,
      agentId: params.agentId,
      timestamp: new Date(),
      type: "run_failed",
      payload: { error: message },
    });
    throw error;
  }
}

export async function cancelAgentRun(params: {
  runId: string;
  triggerRunId: string;
  projectId: string;
}): Promise<void> {
  const { runRepository, runEventRepository, approvalRepository } = getProjectDeps(params.projectId);

  // Look up the run to get the agentId for the event log
  const run = await runRepository.getById(params.runId);
  const agentId = run?.agentId ?? "";

  // Cancel on trigger.dev platform
  await runs.cancel(params.triggerRunId);

  const resolvedAt = new Date();
  const cancellationReason = "Cancelled by user";

  await runRepository.cancel(params.runId, resolvedAt, cancellationReason);
  const pendingApprovals = await approvalRepository.listByRun(params.runId, ["pending"]);
  for (const approval of pendingApprovals) {
    const approvalReason = "Run cancelled before approval was resolved";
    await approvalRepository.markExpired(approval.id, approvalReason, resolvedAt);
    await runEventRepository.append({
      runId: params.runId,
      agentId,
      timestamp: resolvedAt,
      type: "tool_approval_expired",
      payload: {
        approvalId: approval.id,
        toolName: approval.toolName,
        reason: approvalReason,
      },
    });
  }

  await runEventRepository.append({
    runId: params.runId,
    agentId,
    timestamp: resolvedAt,
    type: "run_cancelled",
    payload: { reason: cancellationReason, cancelledByUser: true },
  });
}

export async function approvePendingAction(params: { actionId: string; projectId: string; reason: string }): Promise<{
  runId?: string;
  actionStatus: string;
  triggered: boolean;
}> {
  return approveActionWithResolution({
    projectId: params.projectId,
    actionId: params.actionId,
    decision: "approved",
    reason: params.reason,
    wait,
  });
}
