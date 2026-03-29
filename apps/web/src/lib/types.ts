export type LifecycleStatus = "draft" | "live" | "paused" | "archived";
export type AgentOperationalStatus = "running" | "attention" | "idle" | "error";
export type RunStatus = "queued" | "running" | "waiting_for_approval" | "completed" | "failed";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "blocked" | "expired";
export type RunEventType =
  | "run_started"
  | "prompt_built"
  | "tool_called"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "tool_executed"
  | "finding_recorded"
  | "notification_sent"
  | "lesson_distilled"
  | "run_completed"
  | "run_failed";

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
  data: unknown;
}

export interface RunProposalView {
  id: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  reason: string;
}

export interface RunResultView {
  runId: string;
  agentId: string;
  duration: number;
  steps: RunStepView[];
  proposals: RunProposalView[];
  eventsLogged: number;
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
  decisionReason?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface SkillView {
  id: string;
  name: string;
  description: string;
}

export interface ConnectionView {
  id: string;
  provider: string;
  status: string;
  createdAt: number;
  connectedAccountId?: string | null;
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
