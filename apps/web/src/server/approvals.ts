import { createServerFn } from "@tanstack/react-start";
import { wait } from "@trigger.dev/sdk/v3";
import { approveActionWithResolution } from "./approvals-core";
import { getProjectDeps } from "./deps";
import { buildSerializedPendingAction } from "./models";
import { jsonSafe } from "./serializable";

export const getPendingActions = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const { approvalRepository } = getProjectDeps(projectId);
    const approvals = await approvalRepository.listByAgent(agentId);
    return jsonSafe(approvals.map(buildSerializedPendingAction));
  });

export const approveAction = createServerFn({ method: "POST" })
  .inputValidator((input: { actionId: string; projectId: string; reason?: string }) => input)
  .handler(async ({ data: { actionId, projectId, reason } }) =>
    jsonSafe(
      await approveActionWithResolution({
        actionId,
        projectId,
        decision: "approved",
        reason: reason ?? "Approved by user",
        wait,
      }),
    ),
  );

export const rejectAction = createServerFn({ method: "POST" })
  .inputValidator((input: { actionId: string; projectId: string; reason?: string }) => input)
  .handler(async ({ data: { actionId, projectId, reason } }) =>
    jsonSafe(
      await approveActionWithResolution({
        actionId,
        projectId,
        decision: "rejected",
        reason: reason ?? "Rejected by user",
        wait,
      }),
    ),
  );
