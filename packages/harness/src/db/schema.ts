import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  createdAt: integer("created_at").notNull(),
});

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    instructions: text("instructions").notNull().default(""),
    skills: text("skills").notNull().default("[]"),
    toolConfig: text("tool_config").notNull().default("{}"),
    notificationConfig: text("notification_config").notNull().default("{}"),
    schedule: text("schedule").notNull().default("manual"),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_agents_project").on(table.projectId),
  ],
);

export const runs = sqliteTable(
  "runs",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    triggerType: text("trigger_type").notNull(),
    status: text("status").notNull().default("queued"),
    startedAt: integer("started_at").notNull(),
    completedAt: integer("completed_at"),
    error: text("error"),
    summary: text("summary"),
    triggerRunId: text("trigger_run_id"),
  },
  (table) => [
    index("idx_runs_agent_started").on(table.agentId, table.startedAt),
  ],
);

export const runEvents = sqliteTable(
  "run_events",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    agentId: text("agent_id").notNull(),
    timestamp: integer("timestamp").notNull(),
    type: text("type").notNull(),
    payload: text("payload").notNull(),
  },
  (table) => [
    index("idx_run_events_run_ts").on(table.runId, table.timestamp),
    index("idx_run_events_agent_ts").on(table.agentId, table.timestamp),
  ],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    runId: text("run_id").notNull(),
    agentId: text("agent_id").notNull(),
    approvalId: text("approval_id").notNull(),
    waitTokenId: text("wait_token_id").notNull(),
    toolName: text("tool_name").notNull(),
    toolInput: text("tool_input").notNull(),
    status: text("status").notNull().default("pending"),
    decisionReason: text("decision_reason"),
    createdAt: integer("created_at").notNull(),
    resolvedAt: integer("resolved_at"),
  },
  (table) => [
    uniqueIndex("idx_approvals_approval_id").on(table.approvalId),
    index("idx_approvals_agent_created").on(table.agentId, table.createdAt),
    index("idx_approvals_run").on(table.runId),
  ],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    content: text("content").notNull(),
    scope: text("scope").notNull(),
    confidence: text("confidence").notNull(),
    sourceRunEventIds: text("source_run_event_ids").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (table) => [
    index("idx_lessons_agent_scope").on(table.agentId, table.scope),
  ],
);

export const connections = sqliteTable(
  "connections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    provider: text("provider").notNull(),
    composioEntityId: text("composio_entity_id"),
    status: text("status").notNull(),
    config: text("config"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [
    index("idx_connections_project_provider").on(table.projectId, table.provider),
  ],
);
