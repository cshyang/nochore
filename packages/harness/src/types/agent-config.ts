import { z } from "zod";

// ---------------------------------------------------------------------------
// Tool configuration
// ---------------------------------------------------------------------------

export const ToolApprovalModeSchema = z.enum(["auto", "approval", "blocked"]);
export type ToolApprovalMode = z.infer<typeof ToolApprovalModeSchema>;

export const ToolModeSchema = z.enum(["read", "write"]);
export type ToolMode = z.infer<typeof ToolModeSchema>;

export const ToolConfigEntrySchema = z.object({
  toolName: z.string(),
  slug: z.string(),
  provider: z.string(),
  title: z.string(),
  description: z.string(),
  mode: ToolModeSchema,
  enabled: z.boolean(),
  approvalMode: ToolApprovalModeSchema,
  cooldownMinutes: z.number().optional(),
  budgetThreshold: z.number().optional(),
});
export type ToolConfigEntry = z.infer<typeof ToolConfigEntrySchema>;

export const ProviderRequirementSchema = z.object({
  provider: z.string(),
  reason: z.string().optional(),
  logo: z.string().optional(),
});
export type ProviderRequirement = z.infer<typeof ProviderRequirementSchema>;

export const ToolConfigSchema = z.object({
  globalApprovalRequired: z.boolean().default(false),
  requiredProviders: z.array(ProviderRequirementSchema).default([]),
  tools: z.record(z.string(), ToolConfigEntrySchema).default({}),
});
export type ToolConfig = z.infer<typeof ToolConfigSchema>;

// ---------------------------------------------------------------------------
// Notification configuration
// ---------------------------------------------------------------------------

export const NotificationConfigSchema = z.object({
  inApp: z.boolean(),
  email: z.boolean(),
  slack: z.boolean(),
});
export type NotificationConfig = z.infer<typeof NotificationConfigSchema>;

// ---------------------------------------------------------------------------
// Agent schedule & status
// ---------------------------------------------------------------------------

export const AgentScheduleSchema = z.enum(["hourly", "6hours", "daily", "weekly", "manual"]);
export type AgentSchedule = z.infer<typeof AgentScheduleSchema>;

export const AgentStatusSchema = z.enum(["draft", "live"]);
export type AgentStatus = z.infer<typeof AgentStatusSchema>;

// ---------------------------------------------------------------------------
// Agent config (the configurable subset — AgentRecord extends this)
// ---------------------------------------------------------------------------

export const AgentConfigSchema = z.object({
  instructions: z.string(),
  skills: z.array(z.string()),
  toolConfig: ToolConfigSchema,
  notificationConfig: NotificationConfigSchema,
  schedule: AgentScheduleSchema,
});
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
