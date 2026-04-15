import { narrateEvent } from "./narrate";
import type { PendingActionView, RunView, TimelineEvent, WorkItemView } from "./types";

export function extractFinding(run: RunView): string | null {
  const finding = run.events.find((e) => e.type === "finding_recorded");
  return (finding?.payload?.text as string) ?? null;
}

export function buildTimelineEvents(run: RunView): TimelineEvent[] {
  return run.events.map((e) => ({
    id: e.id,
    type: e.type,
    summary: narrateEvent(e.type, e.payload),
    timestamp: new Date(e.timestamp).getTime(),
  }));
}

export function extractToolNames(run: RunView): string[] {
  const names = new Set<string>();
  for (const e of run.events) {
    if (e.type === "tool_called") {
      const name = e.payload?.toolName as string | undefined;
      if (name) names.add(name);
    }
  }
  return Array.from(names);
}

export interface ToolCallSummary {
  toolName: string;
  provider: string | null;
  wasGated: boolean;
}

export function extractToolCallSummaries(run: RunView): ToolCallSummary[] {
  const called = new Set<string>();
  const gated = new Set<string>();
  for (const e of run.events) {
    const toolName = e.payload?.toolName as string | undefined;
    if (!toolName) continue;
    if (e.type === "tool_called") called.add(toolName);
    if (e.type === "approval_requested") gated.add(toolName);
  }
  return Array.from(called).map((toolName) => ({
    toolName,
    provider: inferProviderFromToolName(toolName),
    wasGated: gated.has(toolName),
  }));
}

function inferProviderFromToolName(toolName: string): string | null {
  const prefix = toolName.split("_")[0];
  return prefix ? prefix.toLowerCase() : null;
}

export function getActionableApprovals(run: RunView): PendingActionView[] {
  return run.approvals.filter((approval) => approval.status === "pending" || approval.status === "expired");
}

export function findLatestStopEvent(run: RunView) {
  return [...run.events].reverse().find((event) => event.type === "run_stopped") ?? null;
}

export function findWorkItemForApproval(run: RunView, approval: PendingActionView): WorkItemView | null {
  return approval.workItemId ? (run.workItems.find((item) => item.id === approval.workItemId) ?? null) : null;
}
