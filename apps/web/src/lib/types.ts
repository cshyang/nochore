export type LifecycleStatus = "draft" | "live" | "paused" | "archived";
export type AgentOperationalStatus = "running" | "attention" | "idle" | "error";
export type RunStatus = "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled";
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

export interface RunView {
  id: string;
  agentId: string;
  triggerType: string;
  status: RunStatus;
  startedAt: string;
  completedAt?: string;
  error?: string;
  triggerRunId?: string;
  events: RunEventView[];
  approvals: PendingActionView[];
  result?: RunResultView;
}

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
}

export interface ConversationStateView {
  threadId: string;
  checkpointSummary?: string;
  checkpointMessageCount: number;
  messages: ChatMessageView[];
  lessons: LessonView[];
}

export interface ConnectionView {
  id: string;
  provider: string;
  status: string;
  createdAt: number;
  connectedAccountId?: string | null;
  config?: Record<string, unknown>;
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
  nextRunAt: number | null;
  pendingCount: number;
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

  // Transitional optional fields retained while route/component migration lands.
  intent?: string;
  policyRules?: string[];
  globalApprovalRequired?: boolean;
  scopeStrategy?: "static" | "llm";
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
