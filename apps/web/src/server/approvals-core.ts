import { getProjectDeps } from "./deps";
import { buildSerializedPendingAction } from "./models";

export async function approveActionWithResolution(params: {
  projectId: string;
  actionId: string;
  decision: "approved" | "rejected" | "blocked";
  reason: string;
  wait: {
    completeToken: (token: { id: string } | string, data: Record<string, unknown>) => Promise<{ success: true }>;
  };
}): Promise<{
  runId?: string;
  actionStatus: string;
  triggered: boolean;
}> {
  const { approvalRepository, runEventRepository } = getProjectDeps(params.projectId);
  const approval = await approvalRepository.getById(params.actionId);
  if (!approval) {
    throw new Error(`Approval ${params.actionId} not found`);
  }

  if (approval.status !== "pending") {
    return {
      runId: approval.runId,
      actionStatus: approval.status,
      triggered: false,
    };
  }

  await approvalRepository.markResolved(approval.id, params.decision, params.reason, new Date());
  await runEventRepository.append({
    runId: approval.runId,
    agentId: approval.agentId,
    timestamp: new Date(),
    type: "tool_approval_resolved",
    payload: {
      approvalId: approval.approvalId,
      decision: params.decision,
      reason: params.reason,
      toolName: approval.toolName,
      toolInput: approval.toolInput,
    },
  });

  await params.wait.completeToken(
    { id: approval.waitTokenId },
    {
      decision: params.decision,
      reason: params.reason,
      approval: buildSerializedPendingAction({
        ...approval,
        status: params.decision,
        decisionReason: params.reason,
      } as typeof approval),
    },
  );

  return {
    runId: approval.runId,
    actionStatus: params.decision,
    triggered: false,
  };
}
