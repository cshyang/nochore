import { z } from "zod";
import type {
  AgentActivityStateView,
  AgentView,
  ProjectActivityStateView,
  ConnectionView,
  ConversationStateView,
  ConversationThreadSummaryView,
  ProjectView,
  RunActivityStateView,
  RunView,
  SkillView,
  ToolConfigEntryView,
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

const RunSummaryViewSchema = z.object({
  status: z.string(),
  headline: z.string(),
  details: z.array(z.string()),
  finalText: z.string().optional(),
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
  workItemId: z.string().optional(),
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

const ActionableApprovalStateViewSchema = PendingActionViewSchema.extend({
  status: z.enum(["pending", "expired"]),
});

const WorkItemViewSchema = z.object({
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
    "waiting_for_children",
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
  workItems: z.array(WorkItemViewSchema).default([]),
  result: RunResultViewSchema.optional(),
  summary: RunSummaryViewSchema.optional(),
});

const RunActivityStateViewSchema = RunViewSchema;

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
  runs: z.array(RunActivityStateViewSchema).default([]),
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
