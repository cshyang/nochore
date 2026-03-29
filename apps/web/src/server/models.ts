import type { createDb } from "../../../../packages/harness/src/db/client";
import type { AgentRecord } from "../../../../packages/harness/src/repositories/agent";
import type { ApprovalRecord, RunEvent, RunRecord } from "../../../../packages/harness/src/types";
import type { AgentView, ProjectView } from "../lib/types";

type Db = ReturnType<typeof createDb>;

export interface SerializedRunEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SerializedRun {
  id: string;
  agentId: string;
  triggerType: string;
  status: "queued" | "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  error?: string;
  triggerRunId?: string;
  events: SerializedRunEvent[];
  result?: {
    runId: string;
    agentId: string;
    duration: number;
    steps: Array<{
      step: string;
      duration: number;
      data: unknown;
    }>;
    proposals: Array<{
      id: string;
      toolName: string;
      toolInput: Record<string, unknown>;
      reason: string;
    }>;
    eventsLogged: number;
  };
}

export interface SerializedPendingAction {
  id: string;
  runId: string;
  agentId: string;
  proposal: {
    id: string;
    toolName: string;
    toolInput: Record<string, unknown>;
    reason: string;
  };
  status: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedReason?: string;
}

export function buildAgentView(params: {
  agent: AgentRecord;
  db: Db;
  runs: RunRecord[];
  approvals: ApprovalRecord[];
  lessonsCount: number;
  activeConnections: Array<{ provider: string; reason?: string | null }>;
}): AgentView {
  const latestRun = params.runs[0] ?? null;
  const pendingCount = params.approvals.filter((approval) => approval.status === "pending").length;

  let status: AgentView["status"] = "idle";
  if (pendingCount > 0) {
    status = "attention";
  } else if (
    latestRun &&
    (latestRun.status === "queued" || latestRun.status === "running" || latestRun.status === "waiting_for_approval")
  ) {
    status = "running";
  } else if (latestRun?.status === "failed") {
    status = "error";
  }

  return {
    id: params.agent.id,
    projectId: params.agent.projectId,
    name: params.agent.name,
    description: params.agent.description,
    intent: params.agent.instructions || params.agent.description,
    instructions: params.agent.instructions,
    skills: params.agent.skills,
    schedule: params.agent.schedule,
    policyRules: Object.values(params.agent.toolConfig.tools).map((tool) => `${tool.title}: ${tool.approvalMode}`),
    globalApprovalRequired: Object.values(params.agent.toolConfig.tools).some((tool) => tool.approvalMode !== "auto"),
    scopeStrategy: "static",
    lifecycleStatus: params.agent.status,
    status,
    lastRunAt: latestRun ? latestRun.startedAt.getTime() : null,
    lastRunRelative: latestRun ? relativeTime(latestRun.startedAt.getTime()) : null,
    nextRunAt: null,
    pendingCount,
    lessonCount: params.lessonsCount,
    runCount: params.runs.length,
    connections: params.activeConnections.map((connection) => ({
      provider: connection.provider,
      reason: connection.reason ?? "",
    })),
    toolConfig: {
      ...params.agent.toolConfig,
      requiredProviders: params.agent.toolConfig.requiredProviders.map((p) => ({
        ...p,
        reason: p.reason ?? "",
      })),
    },
    notificationConfig: params.agent.notificationConfig,
    requiredProviders: params.agent.toolConfig.requiredProviders.map((p) => ({
      ...p,
      reason: p.reason ?? "",
    })),
    createdAt: params.agent.createdAt.getTime(),
    updatedAt: params.agent.updatedAt.getTime(),
  };
}

export function buildProjectView(params: {
  project: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    createdAt: number;
  };
  agents: AgentView[];
  activeConnectionCount: number;
}): ProjectView {
  return {
    id: params.project.id,
    name: params.project.name,
    icon: resolveIcon(params.project.icon),
    color: params.project.color ?? "#5A7ACD",
    agents: params.agents,
    connectionCount: params.activeConnectionCount,
    attentionCount: params.agents.filter((agent) => agent.status === "attention").length,
    createdAt: params.project.createdAt,
  };
}

export function buildSerializedRun(run: RunRecord, events: RunEvent[], approvals: ApprovalRecord[]): SerializedRun {
  const duration = run.completedAt
    ? run.completedAt.getTime() - run.startedAt.getTime()
    : Math.max(Date.now() - run.startedAt.getTime(), 0);
  const steps = events.map((event) => ({
    step: event.type,
    duration: 0,
    data: event.payload,
  }));
  const proposals = approvals.map((approval) => ({
    id: approval.id,
    toolName: approval.toolName,
    toolInput: approval.toolInput,
    reason: approval.decisionReason ?? "Approval requested",
  }));

  return {
    id: run.id,
    agentId: run.agentId,
    triggerType: run.triggerType,
    status: mapRunStatus(run.status),
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
    error: run.error,
    triggerRunId: run.triggerRunId,
    events: events.map((event) => ({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      payload: event.payload,
    })),
    result: {
      runId: run.id,
      agentId: run.agentId,
      duration,
      steps,
      proposals,
      eventsLogged: events.length,
    },
  };
}

export function buildSerializedPendingAction(approval: ApprovalRecord): SerializedPendingAction {
  return {
    id: approval.id,
    runId: approval.runId,
    agentId: approval.agentId,
    proposal: {
      id: approval.id,
      toolName: approval.toolName,
      toolInput: approval.toolInput,
      reason: approval.decisionReason ?? "Approval requested",
    },
    status: approval.status,
    createdAt: approval.createdAt.toISOString(),
    resolvedAt: approval.resolvedAt?.toISOString(),
    resolvedReason: approval.decisionReason ?? undefined,
  };
}

export function mapRunStatus(status: RunRecord["status"]): SerializedRun["status"] {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "queued":
      return "queued";
    case "running":
    case "waiting_for_approval":
      return "running";
  }
}

function resolveIcon(icon: string | null): string {
  if (!icon) return "📁";
  if (icon.codePointAt(0)! > 255) return icon;
  const ICON_MAP: Record<string, string> = {
    building: "🏢",
    hospital: "🏥",
    gear: "⚙️",
    rocket: "🚀",
    chart: "📈",
    star: "⭐",
    briefcase: "💼",
    globe: "🌐",
    shield: "🛡️",
    lightning: "⚡",
  };
  return ICON_MAP[icon] ?? "📁";
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
