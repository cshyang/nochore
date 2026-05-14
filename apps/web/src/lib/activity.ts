import type { AgentActivityStateView, AgentView, ProjectActivityStateView, ProjectView } from "~/lib/types";

export function mergeAgentViewWithActivity(agent: AgentView, activity: AgentActivityStateView | null): AgentView {
  if (!activity) {
    return agent;
  }

  const latestWorkItem = activity.workItems[0];
  const latestRun = activity.runs[0];
  const latestTimestamp = latestWorkItem?.startedAt ?? latestWorkItem?.createdAt ?? latestRun?.startedAt;
  const lastRunAt = latestTimestamp ? new Date(latestTimestamp).getTime() : agent.lastRunAt;

  return {
    ...agent,
    status: activity.primaryStatus,
    activeRunCount: activity.activeRunCount,
    pendingCount: activity.pendingApprovalCount,
    lastRunAt,
    lastRunRelative: lastRunAt ? relativeTime(lastRunAt) : agent.lastRunRelative,
    runCount: Math.max(agent.runCount, activity.runs.length),
  };
}

export function mergeProjectViewWithActivity(
  project: ProjectView,
  activity: ProjectActivityStateView | null,
): ProjectView {
  if (!activity) {
    return project;
  }

  const agentActivityById = new Map(activity.agents.map((agent) => [agent.id, agent]));
  const agents = project.agents.map((agent) => {
    const dynamic = agentActivityById.get(agent.id);
    if (!dynamic) {
      return agent;
    }

    return {
      ...agent,
      status: dynamic.primaryStatus,
      activeRunCount: dynamic.activeRunCount,
      pendingCount: dynamic.pendingApprovalCount,
      lastRunAt: dynamic.lastRunAt,
      lastRunRelative: dynamic.lastRunRelative,
    };
  });

  return {
    ...project,
    agents,
    needsInput: activity.needsInput,
    attentionCount: agents.filter((agent) => agent.status === "attention").length,
  };
}

export function formatAgentActivitySummary(params: {
  pendingApprovalCount: number;
  activeRunCount: number;
}): string | null {
  const parts: string[] = [];

  if (params.pendingApprovalCount > 0) {
    parts.push(`${params.pendingApprovalCount} approval${params.pendingApprovalCount === 1 ? "" : "s"}`);
  }

  if (params.activeRunCount > 0) {
    parts.push(`${params.activeRunCount} active work item${params.activeRunCount === 1 ? "" : "s"}`);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
