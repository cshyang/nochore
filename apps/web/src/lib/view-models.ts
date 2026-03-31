import { z } from "zod";
import type {
  AgentView,
  ConnectionView,
  LearnedRuleConditionView,
  LearnedRuleView,
  NotificationConfigView,
  PendingActionView,
  ProjectNeedsInputView,
  ProjectView,
  ProviderRequirementView,
  RunEventView,
  RunResultView,
  RunView,
  SkillView,
  ToolConfigView,
} from "./types";

type ViewSchema<T> = z.ZodType<T, z.ZodTypeDef, unknown>;

const ProviderRequirementViewSchema: ViewSchema<ProviderRequirementView> = z.object({
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

const ToolConfigViewSchema: ViewSchema<ToolConfigView> = z.object({
  globalApprovalRequired: z.boolean().default(false),
  requiredProviders: z.array(ProviderRequirementViewSchema),
  tools: z.record(z.string(), ToolConfigEntryViewSchema),
});

const NotificationConfigViewSchema: ViewSchema<NotificationConfigView> = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  slack: z.boolean(),
});

const RunEventViewSchema: ViewSchema<RunEventView> = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()),
});

const LearnedRuleConditionViewSchema: ViewSchema<LearnedRuleConditionView> = z.object({
  operator: z.enum(["eq", "lt", "gt", "lte", "gte", "in"]),
  value: z.unknown(),
});

const LearnedRuleViewSchema: ViewSchema<LearnedRuleView> = z.object({
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

const RunResultViewSchema: ViewSchema<RunResultView> = z.object({
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

const PendingActionViewSchema: ViewSchema<PendingActionView> = z.object({
  id: z.string(),
  runId: z.string(),
  agentId: z.string(),
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

const RunViewSchema: ViewSchema<RunView> = z.object({
  id: z.string(),
  agentId: z.string(),
  triggerType: z.string(),
  status: z.enum(["queued", "running", "waiting_for_approval", "completed", "failed"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  triggerRunId: z.string().optional(),
  events: z.array(RunEventViewSchema).default([]),
  approvals: z.array(PendingActionViewSchema).default([]),
  result: RunResultViewSchema.optional(),
});

const SkillViewSchema: ViewSchema<SkillView> = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional().default(""),
});

const ConnectionViewSchema: ViewSchema<ConnectionView> = z.object({
  id: z.string(),
  provider: z.string(),
  status: z.string(),
  createdAt: z.number(),
  connectedAccountId: z.string().nullable().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});

const AgentViewSchema: ViewSchema<AgentView> = z.object({
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
  nextRunAt: z.number().nullable(),
  pendingCount: z.number(),
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
  intent: z.string().optional(),
  policyRules: z.array(z.string()).optional(),
  globalApprovalRequired: z.boolean().optional(),
  scopeStrategy: z.enum(["static", "llm"]).optional(),
});

const ProjectNeedsInputViewSchema: ViewSchema<ProjectNeedsInputView> = z.object({
  id: z.string(),
  agentId: z.string(),
  agentName: z.string(),
  runId: z.string(),
  approval: PendingActionViewSchema,
});

const ProjectViewSchema: ViewSchema<ProjectView> = z.object({
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

function parseNullableSchema<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function parseArraySchema<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T[] {
  const result = z.array(schema).safeParse(value);
  return result.success ? result.data : [];
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

export function parseRunViews(value: unknown): RunView[] {
  return parseArraySchema(RunViewSchema, value);
}

export function parseToolConfigEntryViews(value: unknown) {
  return parseArraySchema(ToolConfigEntryViewSchema, value);
}
