import { COLORS } from "./colors";
import type { RunView } from "./types";

export function statusColor(run: RunView): string {
  if (run.status === "waiting_for_children" && run.hasActionableApprovals) {
    return COLORS.orange;
  }

  switch (run.status) {
    case "completed":
      return COLORS.green;
    case "failed":
      return COLORS.red;
    case "stopped":
      return COLORS.orange;
    case "cancelled":
      return COLORS.textSecondary;
    case "waiting_for_approval":
      return COLORS.orange;
    case "waiting_for_children":
      return COLORS.accent;
    case "running":
      return COLORS.accent;
    case "queued":
      return COLORS.textDim;
    default:
      return COLORS.textDim;
  }
}

export function statusLabel(run: RunView): string {
  if (run.status === "waiting_for_children" && run.hasActionableApprovals) return "needs input";
  if (run.status === "waiting_for_approval") return "waiting";
  if (run.status === "waiting_for_children") return "coordinating";
  if (run.status === "stopped") return "stopped";
  if (run.status === "cancelled") return "cancelled";
  return run.status;
}

export type BadgeTone = "green" | "red" | "yellow" | "blue" | "gray";

export function workItemStatusColor(status: string): BadgeTone {
  switch (status) {
    case "completed":
      return "green";
    case "failed":
      return "red";
    case "stopped":
    case "waiting_for_approval":
    case "waiting_for_external":
      return "yellow";
    case "running":
      return "blue";
    default:
      return "gray";
  }
}
