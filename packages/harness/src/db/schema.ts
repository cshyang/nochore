import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  config: text("config").notNull(), // AgentConfig as JSON string
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const agentEvents = sqliteTable(
  "agent_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    agentId: text("agent_id").notNull(),
    timestamp: integer("timestamp").notNull(),
    type: text("type").notNull(),
    data: text("data").notNull(), // JSON string
  },
  (table) => [
    index("idx_events_agent_ts").on(table.agentId, table.timestamp),
    index("idx_events_run").on(table.runId),
  ]
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    content: text("content").notNull(),
    scope: text("scope").notNull(),
    confidence: text("confidence").notNull(), // "high" | "medium" | "low"
    sourceEventIds: text("source_event_ids").notNull(), // JSON array
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (table) => [
    index("idx_lessons_agent_scope").on(table.agentId, table.scope),
  ]
);

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  triggerType: text("trigger_type").notNull(),
  startedAt: integer("started_at").notNull(),
  completedAt: integer("completed_at"),
  result: text("result"), // JSON string of RunResult
});

export const pendingActions = sqliteTable("pending_actions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  agentId: text("agent_id").notNull(),
  proposal: text("proposal").notNull(), // JSON string of ActionProposal
  status: text("status").notNull(), // "pending" | "approved" | "rejected" | "expired"
  createdAt: integer("created_at").notNull(),
  resolvedAt: integer("resolved_at"),
  resolvedReason: text("resolved_reason"),
});

export const chatMessages = sqliteTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    role: text("role").notNull(), // "user" | "assistant" | "tool"
    content: text("content").notNull(), // Message content (text or JSON for tool calls)
    toolCallId: text("tool_call_id"), // For tool result messages
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_chat_agent_ts").on(table.agentId, table.createdAt),
  ]
);

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  provider: text("provider").notNull(),
  composioEntityId: text("composio_entity_id"),
  status: text("status").notNull(), // "active" | "expired" | "error"
  config: text("config"), // JSON string
  createdAt: integer("created_at").notNull(),
});
