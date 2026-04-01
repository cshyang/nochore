import type { PendingActionView, RunStatus } from "~/lib/types";

export type LiveEvent = {
  id: string;
  type: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

export type LiveRunDisplayStatus = Extract<
  RunStatus,
  "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled"
>;

export function shouldRenderLiveRun(activeRunId: string | null | undefined, selectedRunId: string | null | undefined) {
  return Boolean(activeRunId) && activeRunId === selectedRunId;
}

export function deriveLiveRunStatus(
  platformStatus: string | undefined,
  metadataStatus?: LiveRunDisplayStatus,
): LiveRunDisplayStatus {
  switch ((platformStatus ?? "").toUpperCase()) {
    case "COMPLETED":
      return "completed";
    case "CANCELED":
      return "cancelled";
    case "FAILED":
    case "SYSTEM_FAILURE":
      return "failed";
    default:
      return metadataStatus ?? "running";
  }
}

export function derivePendingApproval(
  runId: string,
  events: LiveEvent[],
  persistedApprovals: PendingActionView[] = [],
): PendingActionView | null {
  const hasRealtimeApprovalEvents = events.some(
    (event) =>
      event.type === "tool_approval_requested" ||
      event.type === "tool_approval_resolved" ||
      event.type === "tool_approval_expired",
  );

  if (hasRealtimeApprovalEvents) {
    return derivePendingApprovalFromEvents(runId, events);
  }

  return persistedApprovals.find((approval) => approval.status === "pending") ?? null;
}

function derivePendingApprovalFromEvents(runId: string, events: LiveEvent[]): PendingActionView | null {
  const requestEvent = [...events].reverse().find((event) => event.type === "tool_approval_requested");
  if (!requestEvent) {
    return null;
  }

  const resolvedAfterRequest = events.find(
    (event) =>
      event.timestamp >= requestEvent.timestamp &&
      (event.type === "tool_approval_resolved" || event.type === "tool_approval_expired"),
  );
  if (resolvedAfterRequest) {
    return null;
  }

  const payload = requestEvent.payload ?? {};
  const approvalId = payload.approvalId;
  const toolName = payload.toolName;
  const toolInput = payload.toolInput;
  const requestReason = payload.requestReason ?? payload.reason;

  if (typeof approvalId !== "string" || typeof toolName !== "string" || !toolInput || typeof toolInput !== "object") {
    return null;
  }

  return {
    id: approvalId,
    runId,
    agentId: "",
    proposal: {
      id: approvalId,
      toolName,
      toolInput: toolInput as Record<string, unknown>,
      reason: typeof requestReason === "string" ? requestReason : "Approval requested",
      requestEventId: requestEvent.id,
    },
    status: "pending",
    createdAt: new Date(requestEvent.timestamp).toISOString(),
    expiresAt: typeof payload.expiresAt === "string" ? payload.expiresAt : undefined,
  };
}
