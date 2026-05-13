import type {
  AgentConnectionBindingRecord,
  AgentRecord,
  AgentTaskRecord,
  ApprovalRecord,
  ApprovalStatus,
  connections,
  createDb,
  LearnedPolicyRule,
  MetricObservation,
  RunEvent,
  RunRecord,
  RunSummary,
} from "@nochore/harness";
import { MetricObservationSchema } from "@nochore/harness";
import type { AgentView, ConnectionView, LearnedRuleView, ProjectView } from "../lib/types";

type Db = ReturnType<typeof createDb>;

export interface SerializedRunEvent {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SerializedAgentTask {
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
  result?: string;
}

export interface SerializedRun {
  id: string;
  agentId: string;
  triggerType: string;
  status:
    | "queued"
    | "running"
    | "waiting_for_approval"
    | "waiting_for_tasks"
    | "stopped"
    | "completed"
    | "failed"
    | "cancelled";
  hasActionableApprovals: boolean;
  startedAt: string;
  completedAt?: string;
  error?: string;
  triggerRunId?: string;
  events: SerializedRunEvent[];
  approvals: SerializedPendingAction[];
  tasks: SerializedAgentTask[];
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
  taskId?: string;
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
  connectionBindings?: AgentConnectionBindingRecord[];
  learnedRuleSuggestions?: LearnedPolicyRule[];
  learnedRules?: LearnedPolicyRule[];
  metricEvents?: RunEvent[];
}): AgentView {
  const latestRun = params.runs[0] ?? null;
  const activeRunCount = params.runs.filter(
    (run) =>
      run.status === "queued" ||
      run.status === "running" ||
      run.status === "waiting_for_approval" ||
      run.status === "waiting_for_tasks",
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

  const metricFields = computeMetricFields(params.agent.primaryMetric, params.metricEvents ?? []);

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
    connectionBindings: (params.connectionBindings ?? []).map(buildAgentConnectionBindingView),
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
    primaryMetric: params.agent.primaryMetric,
    ...metricFields,
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
      parsedConfig = redactConnectionConfig(JSON.parse(row.config));
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
    authorizedByUserId: row.authorizedByUserId ?? null,
    label: buildConnectionLabel(row.provider, parsedConfig, row.composioEntityId),
    accountLabel: getAccountLabel(parsedConfig, row.composioEntityId),
    connector: row.composioEntityId ? "composio" : "direct",
    resourceSummary: buildResourceSummary(row.provider, parsedConfig),
  };
}

function buildAgentConnectionBindingView(binding: AgentConnectionBindingRecord) {
  return {
    id: binding.id,
    agentId: binding.agentId,
    provider: binding.provider,
    connectionId: binding.connectionId,
    resourceType: binding.resourceType,
    resourceId: binding.resourceId,
    resourceLabel: binding.resourceLabel,
    alias: binding.alias,
    purpose: binding.purpose,
    isDefault: binding.isDefault,
    status: binding.status,
    config: binding.config,
  };
}

function redactConnectionConfig(config: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...config };
  for (const key of Object.keys(redacted)) {
    if (/token|secret|password/i.test(key)) {
      redacted[key] = "";
      redacted[`${key}Configured`] = true;
    }
  }
  return redacted;
}

function buildConnectionLabel(
  provider: string,
  config: Record<string, unknown> | undefined,
  connectedAccountId: string | null,
): string {
  const accountLabel = getAccountLabel(config, connectedAccountId);
  return accountLabel ? `${provider}: ${accountLabel}` : provider;
}

function getAccountLabel(
  config: Record<string, unknown> | undefined,
  connectedAccountId: string | null,
): string | null {
  const value = config?.accountLabel ?? config?.email ?? config?.loginEmail ?? config?.selectedCustomerLabel;
  return typeof value === "string" && value.trim() ? value : connectedAccountId;
}

function buildResourceSummary(provider: string, config: Record<string, unknown> | undefined): string | null {
  if (provider === "googleads") {
    const value = config?.selectedCustomerId ?? config?.customerId;
    if (typeof value === "string" && value.trim()) {
      return `Google Ads customer ${formatGoogleAdsCustomerId(value)}`;
    }
  }
  return null;
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
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
  tasks: AgentTaskRecord[] = [],
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
    hasActionableApprovals: approvals.some(
      (approval) => approval.status === "pending" || approval.status === "expired",
    ),
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
    tasks: tasks.map((task) => ({
      id: task.id,
      parentRunId: task.parentRunId,
      kind: task.kind,
      role: task.role,
      title: task.title,
      status: task.status,
      startedAt: task.startedAt?.toISOString(),
      completedAt: task.completedAt?.toISOString(),
      inputTokens: task.inputTokens,
      outputTokens: task.outputTokens,
      blockingReason: task.blockingReason,
      error: task.error,
      result: task.result,
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
    taskId: approval.taskId,
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
    case "stopped":
      return "stopped";
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "waiting_for_approval":
      return "waiting_for_approval";
    case "waiting_for_tasks":
      return "waiting_for_tasks";
  }
}

// ---------------------------------------------------------------------------
// Metric sparkline computation
// ---------------------------------------------------------------------------

const SPARKLINE_MAX_POINTS = 30;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function computeMetricFields(
  primaryMetric: string | undefined,
  metricEvents: RunEvent[],
): Pick<AgentView, "metricSparkline" | "metricCurrentValue" | "metricUnit" | "metricTrendLabel"> {
  if (!primaryMetric || metricEvents.length === 0) {
    return {};
  }

  // Parse payloads and filter to those matching the primaryMetric comparabilityKey.
  const observations: Array<{ timestamp: number; metric: MetricObservation }> = [];
  for (const event of metricEvents) {
    const parsed = MetricObservationSchema.safeParse(event.payload);
    if (parsed.success && parsed.data.comparabilityKey === primaryMetric) {
      observations.push({ timestamp: event.timestamp.getTime(), metric: parsed.data });
    }
  }

  if (observations.length === 0) {
    return {};
  }

  // Sort ascending by timestamp, take last N for sparkline.
  observations.sort((a, b) => a.timestamp - b.timestamp);
  const recent = observations.slice(-SPARKLINE_MAX_POINTS);
  const sparkline = recent.map((obs) => ({ timestamp: obs.timestamp, value: obs.metric.value }));

  const latest = observations[observations.length - 1]!;
  const currentValue = latest.metric.value;
  const unit = latest.metric.unit;

  // Trend: compare latest value to the value closest to 7 days ago.
  const trendLabel = computeTrendLabel(observations, currentValue);

  return {
    metricSparkline: sparkline,
    metricCurrentValue: currentValue,
    metricUnit: unit,
    metricTrendLabel: trendLabel,
  };
}

function computeTrendLabel(
  observations: Array<{ timestamp: number; metric: MetricObservation }>,
  currentValue: number,
): string | undefined {
  if (observations.length < 2) {
    return undefined;
  }

  const now = observations[observations.length - 1]!.timestamp;
  const targetTs = now - SEVEN_DAYS_MS;

  // Find the observation closest to 7 days ago.
  let closest = observations[0]!;
  let closestDiff = Math.abs(closest.timestamp - targetTs);
  for (const obs of observations) {
    const diff = Math.abs(obs.timestamp - targetTs);
    if (diff < closestDiff) {
      closest = obs;
      closestDiff = diff;
    }
  }

  // Don't compute trend if the "baseline" is the same as the latest observation.
  if (closest.timestamp === now) {
    return undefined;
  }

  const baselineValue = closest.metric.value;
  if (baselineValue === 0) {
    return undefined;
  }

  const changePercent = ((currentValue - baselineValue) / Math.abs(baselineValue)) * 100;
  const absPercent = Math.abs(changePercent).toFixed(1);
  const arrow = changePercent > 0 ? "\u2191" : changePercent < 0 ? "\u2193" : "";
  const daysDiff = Math.round((now - closest.timestamp) / (24 * 60 * 60 * 1000));
  const period = daysDiff === 1 ? "1 day" : `${daysDiff} days`;

  return `${arrow} ${absPercent}% over ${period}`;
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
