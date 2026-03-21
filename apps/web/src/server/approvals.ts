/**
 * Approval action server functions.
 *
 * Provides pending action queries and approve/reject operations.
 * Delegates to ApprovalRepository for all persistence.
 */

import { createServerFn } from "@tanstack/react-start";
import { getProjectDeps } from "./deps";
import { jsonSafe } from "./serializable";

// ---------------------------------------------------------------------------
// getPendingActions — actions awaiting human decision
// ---------------------------------------------------------------------------

export const getPendingActions = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { agentId: string; projectId: string }) => input,
  )
  .handler(async ({ data: { agentId, projectId } }) => {
    const { approvalRepository } = getProjectDeps(projectId);
    const actions = await approvalRepository.getByAgentAndStatus(
      agentId,
      "pending",
    );
    return jsonSafe(actions);
  });

// ---------------------------------------------------------------------------
// approveAction — mark a pending action as approved
// ---------------------------------------------------------------------------

export const approveAction = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { actionId: string; projectId: string; reason?: string }) => input,
  )
  .handler(async ({ data: { actionId, projectId, reason } }) => {
    const { approvalRepository } = getProjectDeps(projectId);
    await approvalRepository.resolve(
      actionId,
      "approved",
      reason ?? "Approved by user",
    );
    return { success: true as const };
  });

// ---------------------------------------------------------------------------
// rejectAction — mark a pending action as rejected
// ---------------------------------------------------------------------------

export const rejectAction = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { actionId: string; projectId: string; reason?: string }) => input,
  )
  .handler(async ({ data: { actionId, projectId, reason } }) => {
    const { approvalRepository } = getProjectDeps(projectId);
    await approvalRepository.resolve(
      actionId,
      "rejected",
      reason ?? "Rejected by user",
    );
    return { success: true as const };
  });
