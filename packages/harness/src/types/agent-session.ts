import { z } from "zod";

export const AgentSessionStatusSchema = z.enum([
  "idle",
  "thinking",
  "working",
  "waiting_for_input",
  "waiting_for_approval",
  "failed",
  "closed",
]);
export type AgentSessionStatus = z.infer<typeof AgentSessionStatusSchema>;

export const WorkItemKindSchema = z.enum(["chat_turn", "run", "delegated_task", "scheduled_check", "external_event"]);
export type WorkItemKind = z.infer<typeof WorkItemKindSchema>;

export const WorkItemStatusSchema = z.enum([
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
export type WorkItemStatus = z.infer<typeof WorkItemStatusSchema>;

export const SandboxProviderSchema = z.enum([
  "none",
  "inline",
  "trigger",
  "flue",
  "e2b",
  "litellm",
  "cloudflare",
  "local",
]);
export type SandboxProvider = z.infer<typeof SandboxProviderSchema>;

export const SandboxLeaseStatusSchema = z.enum(["starting", "ready", "stopped", "failed"]);
export type SandboxLeaseStatus = z.infer<typeof SandboxLeaseStatusSchema>;

export const ContextSnapshotKindSchema = z.enum(["chat_turn", "work_item", "restart", "scheduled_check"]);
export type ContextSnapshotKind = z.infer<typeof ContextSnapshotKindSchema>;

export const AgentSessionSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  agentId: z.string(),
  conversationThreadId: z.string().optional(),
  contextKey: z.string(),
  status: AgentSessionStatusSchema,
  currentSandboxLeaseId: z.string().optional(),
  lastContextSnapshotId: z.string().optional(),
  activeWorkItemId: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastActiveAt: z.date().optional(),
});
export type AgentSessionRecord = z.infer<typeof AgentSessionSchema>;

export const WorkItemSchema = z.object({
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
  input: z.record(z.string(), z.unknown()).optional(),
  result: z.record(z.string(), z.unknown()).optional(),
  error: z.string().optional(),
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});
export type WorkItemRecord = z.infer<typeof WorkItemSchema>;

export const ContextSnapshotSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  agentId: z.string(),
  workItemId: z.string().optional(),
  conversationThreadId: z.string().optional(),
  kind: ContextSnapshotKindSchema,
  messagesVersion: z.string().optional(),
  memoryVersion: z.string().optional(),
  toolBindingsVersion: z.string().optional(),
  policyVersion: z.string().optional(),
  promptHash: z.string(),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
});
export type ContextSnapshotRecord = z.infer<typeof ContextSnapshotSchema>;

export const SandboxLeaseSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  provider: SandboxProviderSchema,
  providerHandle: z.string().optional(),
  status: SandboxLeaseStatusSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
  startedAt: z.date(),
  stoppedAt: z.date().optional(),
});
export type SandboxLeaseRecord = z.infer<typeof SandboxLeaseSchema>;
