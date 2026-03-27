import crypto from "node:crypto";
import { tasks, wait } from "@trigger.dev/sdk/v3";
import type { RunTrigger } from "../../../../packages/harness/src/types";
import { getProjectDeps } from "./deps";
import { approveActionWithResolution } from "./approvals-core";

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
  await runEventRepository.append({
    runId,
    agentId: params.agentId,
    timestamp: new Date(),
    type: "run_started",
    payload: {
      triggerType: params.trigger.type,
      trigger: params.trigger,
    },
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

export async function approvePendingAction(params: {
  actionId: string;
  projectId: string;
  reason: string;
}): Promise<{
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
