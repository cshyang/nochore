import { z } from "zod";

export const ConversationThreadScopeSchema = z.enum(["primary", "channel", "investigation"]);
export type ConversationThreadScope = z.infer<typeof ConversationThreadScopeSchema>;

export const ConversationChannelKindSchema = z.enum([
  "web",
  "slack_dm",
  "telegram_dm",
  "slack_channel",
  "telegram_group",
]);
export type ConversationChannelKind = z.infer<typeof ConversationChannelKindSchema>;

export const ConversationEventSourceSchema = z.enum(["web", "run", "system", "slack", "telegram"]);
export type ConversationEventSource = z.infer<typeof ConversationEventSourceSchema>;

export const ConversationEventRoleSchema = z.enum(["user", "assistant", "tool", "system"]);
export type ConversationEventRole = z.infer<typeof ConversationEventRoleSchema>;

export const ConversationEventTypeSchema = z.enum([
  "message",
  "tool_call",
  "tool_output",
  "run_result",
  "checkpoint_marker",
  "memory_write",
  "memory_superseded",
]);
export type ConversationEventType = z.infer<typeof ConversationEventTypeSchema>;

export const ConversationCheckpointKindSchema = z.enum(["rolling_summary", "handoff", "investigation_close"]);
export type ConversationCheckpointKind = z.infer<typeof ConversationCheckpointKindSchema>;

export const ConversationMessagePayloadSchema = z.object({
  messageId: z.string(),
  parts: z.array(z.record(z.string(), z.unknown())),
});
export type ConversationMessagePayload = z.infer<typeof ConversationMessagePayloadSchema>;

export const ConversationEventPayloadSchema = z.record(z.string(), z.unknown());
export type ConversationEventPayload = z.infer<typeof ConversationEventPayloadSchema>;

export const ConversationThreadSchema = z.object({
  id: z.string(),
  agentId: z.string(),
  scope: ConversationThreadScopeSchema,
  channelKind: ConversationChannelKindSchema,
  channelKey: z.string().optional(),
  title: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastMessageAt: z.date().optional(),
  lastInputTokens: z.number().int().nonnegative().optional(),
  lastOutputTokens: z.number().int().nonnegative().optional(),
  lastTotalTokens: z.number().int().nonnegative().optional(),
  lastCompactedAt: z.date().optional(),
  consecutiveCompactionFailures: z.number().int().nonnegative(),
});
export type ConversationThread = z.infer<typeof ConversationThreadSchema>;

export const ConversationEventSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  agentId: z.string(),
  source: ConversationEventSourceSchema,
  role: ConversationEventRoleSchema,
  eventType: ConversationEventTypeSchema,
  messageId: z.string().optional(),
  eventKey: z.string().optional(),
  payload: ConversationEventPayloadSchema,
  createdAt: z.date(),
});
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;

export const ConversationCheckpointSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  kind: ConversationCheckpointKindSchema,
  summary: z.string(),
  messageCount: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative().optional(),
  coversThroughMessageId: z.string().optional(),
  summaryVersion: z.number().int().positive(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type ConversationCheckpoint = z.infer<typeof ConversationCheckpointSchema>;
