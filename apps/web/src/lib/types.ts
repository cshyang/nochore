export type LifecycleStatus = "draft" | "live" | "paused" | "archived";
export type AgentOperationalStatus = "running" | "attention" | "idle" | "error";
export type RunStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "waiting_for_children"
  | "stopped"
  | "completed"
  | "failed"
  | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "blocked" | "expired";
export type RunEventType =
  | "run_started"
  | "prompt_built"
  | "tool_called"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "tool_approval_expired"
  | "policy_rule_suggested"
  | "policy_rule_accepted"
  | "tool_executed"
  | "finding_recorded"
  | "notification_sent"
  | "lesson_distilled"
  | "run_completed"
  | "run_stopped"
  | "metric_observed"
  | "run_cancelled"
  | "run_failed";

export interface LearnedRuleConditionView {
  operator: "eq" | "lt" | "gt" | "lte" | "gte" | "in";
  value?: unknown;
}

export interface LearnedRuleView {
  id: string;
  toolName: string;
  learnedDecision: "auto" | "approval" | "blocked";
  conditions: Record<string, LearnedRuleConditionView> | null;
  evidenceCount: number;
  consistencyRate: number;
  status: "suggested" | "accepted" | "revoked" | "expired" | "dismissed";
  suggestedAt: string;
  acceptedAt?: string;
}

export interface ProviderRequirementView {
  provider: string;
  reason: string;
  status?: string;
  active?: boolean;
}

export interface ToolConfigEntryView {
  toolName: string;
  slug: string;
  provider: string;
  title: string;
  description: string;
  mode: "read" | "write";
  enabled: boolean;
  approvalMode: "auto" | "approval" | "blocked";
  cooldownMinutes?: number;
  budgetThreshold?: number;
}

export interface ToolConfigView {
  globalApprovalRequired: boolean;
  requiredProviders: ProviderRequirementView[];
  tools: Record<string, ToolConfigEntryView>;
}

export interface NotificationConfigView {
  inApp: boolean;
  email: boolean;
  slack: boolean;
}

export interface RunSummaryView {
  status: "completed" | "failed";
  headline: string;
  details: string[];
  finalText?: string;
}

export interface RunStepView {
  step: string;
  duration: number;
  data?: unknown;
}

export interface RunProposalView {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
  requestEventId?: string;
}

export interface RunResultView {
  runId: string;
  agentId: string;
  duration: number;
  steps: RunStepView[];
  proposals: RunProposalView[];
  eventsLogged: number;
}

export interface PendingActionView {
  id: string;
  runId: string;
  agentId: string;
  workItemId?: string;
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

export interface ActionableApprovalStateView extends PendingActionView {
  status: "pending" | "expired";
}

export interface ProjectNeedsInputView {
  id: string;
  agentId: string;
  agentName: string;
  runId: string;
  approval: PendingActionView;
}

export interface RunEventView {
  id: string;
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface TimelineEvent {
  id: string;
  type: string;
  summary: string;
  timestamp: number; // epoch ms
}

export interface WorkItemView {
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

export interface RunView {
  id: string;
  agentId: string;
  triggerType: string;
  status: RunStatus;
  hasActionableApprovals: boolean;
  startedAt: string;
  completedAt?: string;
  error?: string;
  triggerRunId?: string;
  events: RunEventView[];
  approvals: PendingActionView[];
  workItems: WorkItemView[];
  result?: RunResultView;
  summary?: RunSummaryView;
}

export interface RunActivityStateView extends RunView {}

export interface ApprovalView {
  id: string;
  runId: string;
  agentId: string;
  approvalId: string;
  waitTokenId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  status: ApprovalStatus;
  requestReason?: string;
  requestEventId?: string;
  decisionReason?: string;
  workItemId?: string;
  createdAt: string;
  expiresAt?: string;
  resolvedAt?: string;
}

export interface SkillView {
  id: string;
  name: string;
  description: string;
}

export interface ChatMessageView {
  id: string;
  role: "user" | "assistant";
  parts: Array<Record<string, unknown>>;
}

export interface LessonView {
  id: string;
  content: string;
  scope: string;
  confidence: "high" | "medium" | "low";
  createdAt: string;
  expiresAt?: string;
}

export interface ConversationStateView {
  threadId: string;
  threadTitle: string;
  isPrimary: boolean;
  checkpointSummary?: string;
  checkpointMessageCount: number;
  messages: ChatMessageView[];
  lessons: LessonView[];
  episodicLessons: LessonView[];
}

export interface ConversationThreadSummaryView {
  id: string;
  title: string;
  scope: "primary" | "manual" | "channel" | "investigation";
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt?: string;
}

export interface ConnectionView {
  id: string;
  provider: string;
  status: string;
  createdAt: number;
  connectedAccountId?: string | null;
  config?: Record<string, unknown>;
  authorizedByUserId?: string | null;
}

export interface AgentView {
  id: string;
  projectId?: string;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  schedule: string;
  lifecycleStatus: LifecycleStatus;
  status: AgentOperationalStatus;
  lastRunAt: number | null;
  lastRunRelative: string | null;
  lastRunHeadline?: string | null;
  nextRunAt: number | null;
  pendingCount: number;
  activeRunCount: number;
  lessonCount: number;
  runCount: number;
  connections: ProviderRequirementView[];
  toolConfig?: ToolConfigView;
  notificationConfig?: NotificationConfigView;
  createdAt: number;
  updatedAt?: number;
  requiredProviders?: ProviderRequirementView[];
  learnedRuleSuggestions?: LearnedRuleView[];
  learnedRules?: LearnedRuleView[];

  // Metric sparkline (populated when agent has a primaryMetric configured)
  primaryMetric?: string;
  metricSparkline?: { timestamp: number; value: number }[];
  metricCurrentValue?: number;
  metricUnit?: string;
  metricTrendLabel?: string; // e.g., "↓ 8.2% over 7 days"

  // Transitional optional fields retained while route/component migration lands.
  intent?: string;
  policyRules?: string[];
  globalApprovalRequired?: boolean;
  scopeStrategy?: "static" | "llm";
}

export interface ProjectAgentActivityView {
  id: string;
  primaryStatus: AgentOperationalStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  lastRunAt: number | null;
  lastRunRelative: string | null;
}

export interface AgentActivityStateView {
  agentId: string;
  version: number;
  primaryStatus: AgentOperationalStatus;
  activeRunCount: number;
  pendingApprovalCount: number;
  activeRunId: string | null;
  runs: RunActivityStateView[];
}

export interface ProjectActivityStateView {
  projectId: string;
  version: number;
  agents: ProjectAgentActivityView[];
  needsInput: ProjectNeedsInputView[];
}

export interface ProjectView {
  id: string;
  name: string;
  icon: string;
  color: string;
  agents: AgentView[];
  needsInput: ProjectNeedsInputView[];
  connectionCount: number;
  attentionCount: number;
  createdAt: number;
}

export function relativeTime(timestamp: number): string {
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
