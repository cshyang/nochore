import { z } from "zod";
import type {
  AgentActivityStateView,
  AgentView,
  ConnectionView,
  ConversationStateView,
  ConversationThreadSummaryView,
  ProjectActivityStateView,
  ProjectView,
  RunActivityStateView,
  RunView,
  SkillView,
  ToolConfigEntryView,
  WorkItemView,
} from "./types";

const ProviderRequirementViewSchema = z.object({
  provider: z.string(),
  reason: z.string(),
  status: z.string().optional(),
  active: z.boolean().optional(),
});

const ToolConfigEntryViewSchema = z.object({
  toolName: z.string(),
  slug: z.string(),
  provider: z.string(),
  title: z.string(),
  description: z.string(),
  mode: z.enum(["read", "write"]),
  enabled: z.boolean(),
  approvalMode: z.enum(["auto", "approval", "blocked"]),
  cooldownMinutes: z.number().optional(),
  budgetThreshold: z.number().optional(),
});

const ToolConfigViewSchema = z.object({
  globalApprovalRequired: z.boolean().default(false),
  requiredProviders: z.array(ProviderRequirementViewSchema),
  tools: z.record(z.string(), ToolConfigEntryViewSchema),
});

const NotificationConfigViewSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  slack: z.boolean(),
});

const RunEventViewSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

const LearnedRuleConditionViewSchema = z.object({
  operator: z.enum(["eq", "lt", "gt", "lte", "gte", "in"]),
  value: z.unknown(),
});

const LearnedRuleViewSchema = z.object({
  id: z.string(),
  toolName: z.string(),
  learnedDecision: z.enum(["auto", "approval", "blocked"]),
  conditions: z.record(z.string(), LearnedRuleConditionViewSchema).nullable(),
  evidenceCount: z.number(),
  consistencyRate: z.number(),
  status: z.enum(["suggested", "accepted", "revoked", "expired", "dismissed"]),
  suggestedAt: z.string(),
  acceptedAt: z.string().optional(),
});

const RunFindingSeverityViewSchema = z.enum(["critical", "warning", "watch", "winner", "info", "success"]);

const RunFindingViewSchema = z.object({
  severity: RunFindingSeverityViewSchema,
  title: z.string(),
  body: z.string(),
});

const RunTrailViewSchema = z.object({
  toolCalls: z.array(z.string()).optional(),
  eventCount: z.number().optional(),
});

const RunSummaryViewSchema = z.object({
  status: z.string(),
  headline: z.string(),
  details: z.array(z.string()),
  finalText: z.string().optional(),
  findings: z.array(RunFindingViewSchema).optional(),
  overallSeverity: RunFindingSeverityViewSchema.optional(),
  trail: RunTrailViewSchema.optional(),
});

const RunResultViewSchema = z.object({
  runId: z.string(),
  agentId: z.string(),
  duration: z.number(),
  steps: z.array(
    z.object({
      step: z.string(),
      duration: z.number(),
      data: z.unknown(),
    }),
  ),
  proposals: z.array(
    z.object({
      id: z.string(),
      toolName: z.string(),
      toolInput: z.record(z.string(), z.unknown()),
      reason: z.string(),
      requestEventId: z.string().optional(),
    }),
  ),
  eventsLogged: z.number(),
});

const PendingActionViewSchema = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
  taskId: z.string().optional(),
  proposal: z.object({
    id: z.string(),
    toolName: z.string(),
    toolInput: z.record(z.string(), z.unknown()),
    reason: z.string(),
    requestEventId: z.string().optional(),
  }),
  status: z.enum(["pending", "approved", "rejected", "blocked", "expired"]),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
  resolvedAt: z.string().optional(),
  resolvedReason: z.string().optional(),
});

const _ActionableApprovalStateViewSchema = PendingActionViewSchema.extend({
  status: z.enum(["pending", "expired"]),
});

const AgentTaskViewSchema = z.object({
  id: z.string(),
  parentRunId: z.string(),
  kind: z.string(),
  role: z.string(),
  title: z.string(),
  status: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  blockingReason: z.string().optional(),
  error: z.string().optional(),
  result: z.string().optional(),
});

const RunViewSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  triggerType: z.string(),
  status: z.enum([
    "queued",
    "running",
    "waiting_for_approval",
    "waiting_for_tasks",
    "stopped",
    "completed",
    "failed",
    "cancelled",
  ]),
  hasActionableApprovals: z.boolean().default(false),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  triggerRunId: z.string().optional(),
  events: z.array(RunEventViewSchema).default([]),
  approvals: z.array(PendingActionViewSchema).default([]),
  tasks: z.array(AgentTaskViewSchema).default([]),
  result: RunResultViewSchema.optional(),
  summary: RunSummaryViewSchema.optional(),
});

const RunActivityStateViewSchema = RunViewSchema;

const AgentSessionActivityViewSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  conversationThreadId: z.string().optional(),
  contextKey: z.string(),
  status: z.enum(["idle", "thinking", "working", "waiting_for_input", "waiting_for_approval", "failed", "closed"]),
  currentSandboxLeaseId: z.string().optional(),
  lastContextSnapshotId: z.string().optional(),
  activeWorkItemId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastActiveAt: z.string().optional(),
});

const ContextSnapshotActivityViewSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentId: z.string(),
  workItemId: z.string().optional(),
  conversationThreadId: z.string().optional(),
  kind: z.string(),
  messagesVersion: z.string().optional(),
  memoryVersion: z.string().optional(),
  toolBindingsVersion: z.string().optional(),
  policyVersion: z.string().optional(),
  promptHash: z.string(),
  executor: z.string().optional(),
  model: z.string().optional(),
  provider: z.string().optional(),
  messageCount: z.number().optional(),
  memoryCount: z.number().optional(),
  toolBindingCount: z.number().optional(),
  policyRuleCount: z.number().optional(),
  createdAt: z.string(),
});

const SandboxLeaseActivityViewSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  provider: z.string(),
  providerHandle: z.string().optional(),
  status: z.string(),
  startedAt: z.string(),
  stoppedAt: z.string().optional(),
});

const WorkItemKindSchema = z.enum(["chat_turn", "run", "delegated_task", "scheduled_check", "external_event"]);
const WorkItemStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "waiting_for_tasks",
  "stopped",
  "completed",
  "failed",
  "cancelled",
]);

const WorkItemChildViewSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentId: z.string(),
  kind: WorkItemKindSchema,
  status: WorkItemStatusSchema,
  parentWorkItemId: z.string().optional(),
  runId: z.string().optional(),
  agentTaskId: z.string().optional(),
  triggerRunId: z.string().optional(),
  title: z.string().optional(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
});

const WorkItemViewSchema = WorkItemChildViewSchema.extend({
  input: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  run: RunActivityStateViewSchema.optional(),
  childWorkItems: z.array(WorkItemChildViewSchema).default([]),
  session: AgentSessionActivityViewSchema.optional(),
  latestSnapshot: ContextSnapshotActivityViewSchema.optional(),
  currentSandboxLease: SandboxLeaseActivityViewSchema.optional(),
});

const SkillViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
});

const ConnectionViewSchema = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.string(),
  createdAt: z.number(),
  connectedAccountId: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  authorizedByUserId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  accountLabel: z.string().nullable().optional(),
  connector: z.enum(["composio", "direct"]).nullable().optional(),
  resourceSummary: z.string().nullable().optional(),
  logo: z.string().nullable().optional(),
  providerName: z.string().nullable().optional(),
});

const ChatMessageViewSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  parts: z.array(z.record(z.string(), z.unknown())),
});

const LessonViewSchema = z.object({
  id: z.string(),
  content: z.string(),
  scope: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  createdAt: z.string(),
  expiresAt: z.string().optional(),
});

const ConversationStateViewSchema = z.object({
  threadId: z.string(),
  threadTitle: z.string(),
  isPrimary: z.boolean(),
  checkpointSummary: z.string().optional(),
  checkpointMessageCount: z.number().int().nonnegative(),
  messages: z.array(ChatMessageViewSchema),
  lessons: z.array(LessonViewSchema),
  episodicLessons: z.array(LessonViewSchema).default([]),
});

const ConversationThreadSummaryViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  scope: z.enum(["primary", "manual", "channel", "investigation"]),
  isPrimary: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastMessageAt: z.string().optional(),
  messageCount: z.number().int().nonnegative(),
  hasMessages: z.boolean(),
});

const AgentViewSchema = z.object({
  id: z.string(),
  projectId: z.string().optional(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  skills: z.array(z.string()),
  schedule: z.string(),
  lifecycleStatus: z.enum(["draft", "live", "paused", "archived"]),
  status: z.enum(["running", "attention", "idle", "error"]),
  lastRunAt: z.number().nullable(),
  lastRunRelative: z.string().nullable(),
  lastRunHeadline: z.string().nullable().optional(),
  nextRunAt: z.number().nullable(),
  pendingCount: z.number(),
  activeRunCount: z.number().default(0),
  lessonCount: z.number(),
  runCount: z.number(),
  connections: z.array(ProviderRequirementViewSchema),
  toolConfig: ToolConfigViewSchema.optional(),
  notificationConfig: NotificationConfigViewSchema.optional(),
  createdAt: z.number(),
  updatedAt: z.number().optional(),
  requiredProviders: z.array(ProviderRequirementViewSchema).optional(),
  learnedRuleSuggestions: z.array(LearnedRuleViewSchema).optional(),
  learnedRules: z.array(LearnedRuleViewSchema).optional(),
  primaryMetric: z.string().optional(),
  metricSparkline: z.array(z.object({ timestamp: z.number(), value: z.number() })).optional(),
  metricCurrentValue: z.number().optional(),
  metricUnit: z.string().optional(),
  metricTrendLabel: z.string().optional(),
  intent: z.string().optional(),
  policyRules: z.array(z.string()).optional(),
  globalApprovalRequired: z.boolean().optional(),
  scopeStrategy: z.enum(["static", "llm"]).optional(),
});

const ProjectAgentActivityViewSchema = z.object({
  id: z.string(),
  primaryStatus: z.enum(["running", "attention", "idle", "error"]),
  activeRunCount: z.number(),
  pendingApprovalCount: z.number(),
  lastRunAt: z.number().nullable(),
  lastRunRelative: z.string().nullable(),
});

const AgentActivityStateViewSchema = z.object({
  agentId: z.string(),
  version: z.number(),
  primaryStatus: z.enum(["running", "attention", "idle", "error"]),
  activeRunCount: z.number(),
  pendingApprovalCount: z.number(),
  activeRunId: z.string().nullable(),
  activeWorkItemId: z.string().nullable().default(null),
  runs: z.array(RunActivityStateViewSchema).default([]),
  workItems: z.array(WorkItemViewSchema).default([]),
  sessions: z.array(AgentSessionActivityViewSchema).default([]),
});

const ProjectNeedsInputViewSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  runId: z.string(),
  approval: PendingActionViewSchema,
});

const ProjectActivityStateViewSchema = z.object({
  projectId: z.string(),
  version: z.number(),
  agents: z.array(ProjectAgentActivityViewSchema).default([]),
  needsInput: z.array(ProjectNeedsInputViewSchema).default([]),
});

const ProjectViewSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  agents: z.array(AgentViewSchema),
  needsInput: z.array(ProjectNeedsInputViewSchema).default([]),
  connectionCount: z.number(),
  attentionCount: z.number(),
  createdAt: z.number(),
});

function parseNullableSchema<T>(schema: z.ZodTypeAny, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? (result.data as T) : null;
}

function parseArraySchema<T>(schema: z.ZodTypeAny, value: unknown): T[] {
  const result = z.array(schema).safeParse(value);
  return result.success ? (result.data as T[]) : [];
}

export function parseProjectView(value: unknown): ProjectView | null {
  return parseNullableSchema(ProjectViewSchema, value);
}

export function parseAgentView(value: unknown): AgentView | null {
  return parseNullableSchema(AgentViewSchema, value);
}

export function parseSkillViews(value: unknown): SkillView[] {
  return parseArraySchema(SkillViewSchema, value);
}

export function parseConnectionViews(value: unknown): ConnectionView[] {
  return parseArraySchema(ConnectionViewSchema, value);
}

export function parseConversationStateView(value: unknown): ConversationStateView | null {
  return parseNullableSchema(ConversationStateViewSchema, value);
}

export function parseConversationThreadSummaryViews(value: unknown): ConversationThreadSummaryView[] {
  return parseArraySchema(ConversationThreadSummaryViewSchema, value);
}

export function parseRunViews(value: unknown): RunView[] {
  return parseArraySchema(RunViewSchema, value);
}

export function parseToolConfigEntryViews(value: unknown): ToolConfigEntryView[] {
  return parseArraySchema(ToolConfigEntryViewSchema, value);
}

export function parseAgentActivityStateView(value: unknown): AgentActivityStateView | null {
  return parseNullableSchema(AgentActivityStateViewSchema, value);
}

export function parseProjectActivityStateView(value: unknown): ProjectActivityStateView | null {
  return parseNullableSchema(ProjectActivityStateViewSchema, value);
}

export function parseRunActivityStateViews(value: unknown): RunActivityStateView[] {
  return parseArraySchema(RunActivityStateViewSchema, value);
}

export function parseWorkItemViews(value: unknown): WorkItemView[] {
  return parseArraySchema(WorkItemViewSchema, value);
}
