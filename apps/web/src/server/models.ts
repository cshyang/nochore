import type {
  AgentRecord,
  ApprovalRecord,
  ApprovalStatus,
  connections,
  createDb,
  LearnedPolicyRule,
  RunEvent,
  RunRecord,
  RunSummary,
  WorkItemRecord,
} from "@nochore/harness";
import type { AgentView, ConnectionView, LearnedRuleView, ProjectView } from "../lib/types";

type Db = ReturnType<typeof createDb>;

export interface SerializedRunEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SerializedWorkItem {
  id: string;
  parentRunId: string;
  kind: string;
  role: string;
  title: string;
  status: string;
  startedAt?: string;
  completedAt?: string;
  inputTokens?: number;
  outputTokens?: number;
  blockingReason?: string;
  error?: string;
}

export interface SerializedRun {
  id: string;
  agentId: string;
  triggerType: string;
  status: "queued" | "running" | "waiting_for_approval" | "waiting_for_children" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  error?: string;
  triggerRunId?: string;
  events: SerializedRunEvent[];
  approvals: SerializedPendingAction[];
  workItems: SerializedWorkItem[];
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
      requestEventId?: string;
    }>;
    eventsLogged: number;
  };
  summary?: RunSummary;
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
    requestEventId?: string;
  };
  status: ApprovalStatus;
  createdAt: string;
  expiresAt?: string;
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
  learnedRuleSuggestions?: LearnedPolicyRule[];
  learnedRules?: LearnedPolicyRule[];
}): AgentView {
  const latestRun = params.runs[0] ?? null;
  const activeRunCount = params.runs.filter(
    (run) => run.status === "queued" || run.status === "running" || run.status === "waiting_for_approval" || run.status === "waiting_for_children",
  ).length;
  const pendingCount = params.approvals.filter(
    (approval) => approval.status === "pending" || approval.status === "expired",
  ).length;

  let status: AgentView["status"] = "idle";
  if (pendingCount > 0) {
    status = "attention";
  } else if (activeRunCount > 0) {
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
    globalApprovalRequired: params.agent.toolConfig.globalApprovalRequired ?? false,
    scopeStrategy: "static",
    lifecycleStatus: params.agent.status,
    status,
    lastRunAt: latestRun ? latestRun.startedAt.getTime() : null,
    lastRunRelative: latestRun ? relativeTime(latestRun.startedAt.getTime()) : null,
    lastRunHeadline: latestRun?.summary?.headline ?? null,
    nextRunAt: null,
    pendingCount,
    activeRunCount,
    lessonCount: params.lessonsCount,
    runCount: params.runs.length,
    connections: params.activeConnections.map((connection) => ({
      provider: connection.provider,
      reason: connection.reason ?? "",
    })),
    toolConfig: {
      globalApprovalRequired: params.agent.toolConfig.globalApprovalRequired ?? false,
      requiredProviders: params.agent.toolConfig.requiredProviders.map((provider) => ({
        provider: provider.provider,
        reason: provider.reason ?? "",
      })),
      tools: params.agent.toolConfig.tools,
    },
    notificationConfig: params.agent.notificationConfig,
    requiredProviders: params.activeConnections.map((connection) => ({
      provider: connection.provider,
      reason: connection.reason ?? "",
    })),
    learnedRuleSuggestions: (params.learnedRuleSuggestions ?? []).map(buildLearnedRuleView),
    learnedRules: (params.learnedRules ?? []).map(buildLearnedRuleView),
    createdAt: params.agent.createdAt.getTime(),
    updatedAt: params.agent.updatedAt.getTime(),
  };
}

export function buildConnectionView(row: typeof connections.$inferSelect): ConnectionView {
  let parsedConfig: Record<string, unknown> | undefined;
  if (row.config) {
    try {
      parsedConfig = JSON.parse(row.config);
    } catch {
      // Invalid JSON — skip
    }
  }

  return {
    id: row.id,
    provider: row.provider,
    status: row.status,
    createdAt: row.createdAt,
    connectedAccountId: row.composioEntityId ?? null,
    config: parsedConfig,
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
  needsInput?: Array<{
    id: string;
    agentId: string;
    agentName: string;
    runId: string;
    approval: ApprovalRecord;
  }>;
  activeConnectionCount: number;
}): ProjectView {
  return {
    id: params.project.id,
    name: params.project.name,
    icon: resolveIcon(params.project.icon),
    color: params.project.color ?? "#5A7ACD",
    agents: params.agents,
    needsInput: (params.needsInput ?? []).map((item) => ({
      id: item.id,
      agentId: item.agentId,
      agentName: item.agentName,
      runId: item.runId,
      approval: buildSerializedPendingAction(item.approval),
    })),
    connectionCount: params.activeConnectionCount,
    attentionCount: params.agents.filter((agent) => agent.status === "attention").length,
    createdAt: params.project.createdAt,
  };
}

export function buildSerializedRun(
  run: RunRecord,
  events: RunEvent[],
  approvals: ApprovalRecord[],
  workItems: WorkItemRecord[] = [],
): SerializedRun {
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
    reason: approval.requestReason ?? "Approval requested",
    requestEventId: approval.requestEventId,
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
    approvals: approvals.map(buildSerializedPendingAction),
    workItems: workItems.map((wi) => ({
      id: wi.id,
      parentRunId: wi.parentRunId,
      kind: wi.kind,
      role: wi.role,
      title: wi.title,
      status: wi.status,
      startedAt: wi.startedAt?.toISOString(),
      completedAt: wi.completedAt?.toISOString(),
      inputTokens: wi.inputTokens,
      outputTokens: wi.outputTokens,
      blockingReason: wi.blockingReason,
      error: wi.error,
    })),
    result: {
      runId: run.id,
      agentId: run.agentId,
      duration,
      steps,
      proposals,
      eventsLogged: events.length,
    },
    summary: run.summary,
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
      reason: approval.requestReason ?? "Approval requested",
      requestEventId: approval.requestEventId,
    },
    status: approval.status,
    createdAt: approval.createdAt.toISOString(),
    expiresAt: approval.expiresAt?.toISOString(),
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
    case "cancelled":
      return "cancelled";
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "waiting_for_approval":
      return "waiting_for_approval";
    case "waiting_for_children":
      return "waiting_for_children";
  }
}

function buildLearnedRuleView(rule: LearnedPolicyRule): LearnedRuleView {
  return {
    id: rule.id,
    toolName: rule.toolName,
    learnedDecision: rule.learnedDecision,
    conditions: rule.conditions
      ? Object.fromEntries(
          Object.entries(rule.conditions).map(([key, condition]) => [
            key,
            {
              operator: condition.operator,
              value: condition.value,
            },
          ]),
        )
      : null,
    evidenceCount: rule.evidenceCount,
    consistencyRate: rule.consistencyRate,
    status: rule.status,
    suggestedAt: rule.suggestedAt.toISOString(),
    acceptedAt: rule.acceptedAt?.toISOString(),
  };
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
