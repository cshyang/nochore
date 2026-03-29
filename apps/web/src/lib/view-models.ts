import { z } from "zod";
import type { AgentView, ConnectionView, ProjectView, RunView, SkillView } from "./types";

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
    }),
  ),
  eventsLogged: z.number(),
});

const RunViewSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  triggerType: z.string(),
  status: z.enum(["queued", "running", "waiting_for_approval", "completed", "failed"]),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  triggerRunId: z.string().optional(),
  events: z.array(RunEventViewSchema).default([]),
  result: RunResultViewSchema.optional(),
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
  intent: z.string().optional(),
  policyRules: z.array(z.string()).optional(),
  globalApprovalRequired: z.boolean().optional(),
  scopeStrategy: z.enum(["static", "llm"]).optional(),
});

const ProjectViewSchema: z.ZodType<ProjectView> = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string(),
  color: z.string(),
  agents: z.array(AgentViewSchema),
  connectionCount: z.number(),
  attentionCount: z.number(),
  createdAt: z.number(),
});

function parseNullableSchema<T>(schema: z.ZodType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function parseArraySchema<T>(schema: z.ZodType<T>, value: unknown): T[] {
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
