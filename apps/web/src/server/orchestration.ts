import crypto from "node:crypto";
import type { RunTrigger } from "@nochore/harness";
import { runs, tasks, wait } from "@trigger.dev/sdk";
import { approveActionWithResolution } from "./approvals-core";
import { getProjectDeps } from "./deps";

export async function startAgentRun(params: {
  agentId: string;
  projectId: string;
  trigger: RunTrigger;
  sessionId?: string;
  parentWorkItemId?: string;
}): Promise<{ runId: string; triggerRunId: string; workItemId: string }> {
  const { agentSessionRepository, runRepository, runEventRepository, workItemRepository } = getProjectDeps(
    params.projectId,
  );
  const runId = crypto.randomUUID();
  const session =
    params.sessionId != null
      ? await agentSessionRepository.getById(params.sessionId)
      : await agentSessionRepository.getOrCreateForContext({
          projectId: params.projectId,
          agentId: params.agentId,
          contextKey: defaultRunContextKey(params.agentId, params.trigger),
          status: "idle",
        });
  if (!session) {
    throw new Error(`Agent session ${params.sessionId} not found`);
  }
  const workItemId = await workItemRepository.create({
    sessionId: session.id,
    agentId: params.agentId,
    kind: params.trigger.type === "cron" ? "scheduled_check" : "run",
    status: "queued",
    parentWorkItemId: params.parentWorkItemId,
    runId,
    title: describeRunWorkItemTitle(params.trigger),
    input: {
      triggerType: params.trigger.type,
      triggerTimestamp: params.trigger.timestamp.toISOString(),
      metadata: params.trigger.metadata ?? {},
    },
  });
  await agentSessionRepository.update(session.id, {
    status: "working",
    activeWorkItemId: workItemId,
    lastActiveAt: new Date(),
  });

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
    await workItemRepository.updateLinks(workItemId, { triggerRunId: handle.id });
    return { runId, triggerRunId: handle.id, workItemId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await runRepository.fail(runId, new Date(), message);
    await workItemRepository.fail(workItemId, new Date(), message);
    await agentSessionRepository.update(session.id, {
      status: "failed",
      activeWorkItemId: null,
      lastActiveAt: new Date(),
    });
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

function defaultRunContextKey(agentId: string, trigger: RunTrigger): string {
  const threadId = typeof trigger.metadata?.threadId === "string" ? trigger.metadata.threadId : undefined;
  if (threadId) {
    return `web:${threadId}`;
  }
  return `agent:${agentId}:${trigger.type}`;
}

function describeRunWorkItemTitle(trigger: RunTrigger): string {
  if (trigger.type === "cron") return "Scheduled check";
  if (trigger.type === "chat") return "Background work from chat";
  if (trigger.type === "webhook") return "Webhook-triggered work";
  return "Manual run";
}

export async function cancelAgentRun(params: {
  runId: string;
  triggerRunId: string;
  projectId: string;
}): Promise<void> {
  const { agentSessionRepository, runRepository, runEventRepository, approvalRepository, workItemRepository } =
    getProjectDeps(params.projectId);

  // Look up the run to get the agentId for the event log
  const run = await runRepository.getById(params.runId);
  const agentId = run?.agentId ?? "";
  const workItem = await workItemRepository.getByRunId(params.runId);

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

  if (workItem) {
    await workItemRepository.cancel(workItem.id, resolvedAt, cancellationReason);
    const session = await agentSessionRepository.getById(workItem.sessionId);
    if (session?.activeWorkItemId === workItem.id) {
      await agentSessionRepository.update(workItem.sessionId, {
        status: "idle",
        activeWorkItemId: null,
        lastActiveAt: resolvedAt,
      });
    }
  }
}

export async function cancelAgentWorkItem(params: { workItemId: string; projectId: string }): Promise<void> {
  const { agentSessionRepository, workItemRepository } = getProjectDeps(params.projectId);
  const workItem = await workItemRepository.getById(params.workItemId);
  if (!workItem) {
    throw new Error("Work item not found");
  }

  if (workItem.runId && workItem.triggerRunId) {
    await cancelAgentRun({
      runId: workItem.runId,
      triggerRunId: workItem.triggerRunId,
      projectId: params.projectId,
    });
    return;
  }

  const resolvedAt = new Date();
  await workItemRepository.cancel(workItem.id, resolvedAt, "Cancelled by user");
  const session = await agentSessionRepository.getById(workItem.sessionId);
  if (session?.activeWorkItemId === workItem.id) {
    await agentSessionRepository.update(workItem.sessionId, {
      status: "idle",
      activeWorkItemId: null,
      lastActiveAt: resolvedAt,
    });
  }
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
