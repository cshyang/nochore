import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

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
    primaryMetric: text("primary_metric"),
    status: text("status").notNull().default("draft"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_agents_project").on(table.projectId)],
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
  (table) => [index("idx_runs_agent_started").on(table.agentId, table.startedAt)],
);

export const conversationThreads = sqliteTable(
  "conversation_threads",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    scope: text("scope").notNull(),
    channelKind: text("channel_kind").notNull(),
    channelKey: text("channel_key"),
    title: text("title").notNull().default(""),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
    lastMessageAt: integer("last_message_at"),
    lastInputTokens: integer("last_input_tokens"),
    lastOutputTokens: integer("last_output_tokens"),
    lastTotalTokens: integer("last_total_tokens"),
    lastCompactedAt: integer("last_compacted_at"),
    consecutiveCompactionFailures: integer("consecutive_compaction_failures").notNull().default(0),
  },
  (table) => [
    index("idx_conversation_threads_agent_scope").on(table.agentId, table.scope),
    uniqueIndex("idx_conversation_threads_agent_primary").on(table.agentId).where(sql`${table.scope} = 'primary'`),
    index("idx_conversation_threads_agent_updated").on(table.agentId, table.updatedAt),
  ],
);

export const conversationEvents = sqliteTable(
  "conversation_events",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    agentId: text("agent_id").notNull(),
    source: text("source").notNull(),
    role: text("role").notNull(),
    eventType: text("event_type").notNull(),
    messageId: text("message_id"),
    eventKey: text("event_key"),
    payload: text("payload").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    index("idx_conversation_events_thread_created").on(table.threadId, table.createdAt),
    index("idx_conversation_events_agent_created").on(table.agentId, table.createdAt),
    uniqueIndex("idx_conversation_events_thread_message").on(table.threadId, table.messageId),
    uniqueIndex("idx_conversation_events_thread_event_key").on(table.threadId, table.eventKey),
  ],
);

export const conversationCheckpoints = sqliteTable(
  "conversation_checkpoints",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id").notNull(),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    messageCount: integer("message_count").notNull().default(0),
    estimatedTokens: integer("estimated_tokens"),
    coversThroughMessageId: text("covers_through_message_id"),
    summaryVersion: integer("summary_version").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [uniqueIndex("idx_conversation_checkpoints_thread_kind").on(table.threadId, table.kind)],
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
    requestReason: text("request_reason"),
    requestEventId: text("request_event_id"),
    decisionReason: text("decision_reason"),
    taskId: text("agent_task_id"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
    resolvedAt: integer("resolved_at"),
  },
  (table) => [
    uniqueIndex("idx_approvals_approval_id").on(table.approvalId),
    index("idx_approvals_agent_created").on(table.agentId, table.createdAt),
    index("idx_approvals_run").on(table.runId),
  ],
);

export const learnedPolicyRules = sqliteTable(
  "learned_policy_rules",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    toolName: text("tool_name").notNull(),
    learnedDecision: text("learned_decision").notNull(),
    conditions: text("conditions"),
    evidenceCount: integer("evidence_count").notNull(),
    consistencyRate: real("consistency_rate").notNull(),
    status: text("status").notNull().default("suggested"),
    suggestedAt: integer("suggested_at").notNull(),
    acceptedAt: integer("accepted_at"),
    revokedAt: integer("revoked_at"),
    expiresAt: integer("expires_at"),
    userNote: text("user_note"),
    sourceApprovalIds: text("source_approval_ids").notNull(),
  },
  (table) => [
    index("idx_learned_rules_agent_status").on(table.agentId, table.status),
    index("idx_learned_rules_agent_tool").on(table.agentId, table.toolName),
  ],
);

export const suggestionSuppressions = sqliteTable(
  "suggestion_suppressions",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    toolName: text("tool_name").notNull(),
    suppressedAt: integer("suppressed_at").notNull(),
  },
  (table) => [uniqueIndex("idx_suppressions_agent_tool").on(table.agentId, table.toolName)],
);

export const lessons = sqliteTable(
  "lessons",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id").notNull(),
    content: text("content").notNull(),
    scope: text("scope").notNull(),
    confidence: text("confidence").notNull(),
    sourceEventIds: text("source_run_event_ids").notNull(),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at"),
  },
  (table) => [index("idx_lessons_agent_scope").on(table.agentId, table.scope)],
);

export const agentTasks = sqliteTable(
  "agent_tasks",
  {
    id: text("id").primaryKey(),
    parentRunId: text("parent_run_id").notNull(),
    rootRunId: text("root_run_id").notNull(),
    agentId: text("agent_id").notNull(),
    kind: text("kind").notNull().default("agent_task_run"),
    role: text("role").notNull(),
    title: text("title").notNull(),
    status: text("status").notNull().default("queued"),
    blockingReason: text("blocking_reason"),
    error: text("error"),
    result: text("result"),
    triggerTaskRunId: text("trigger_task_run_id"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: integer("created_at").notNull(),
    startedAt: integer("started_at"),
    completedAt: integer("completed_at"),
  },
  (table) => [
    index("idx_agent_tasks_parent_run").on(table.parentRunId),
    index("idx_agent_tasks_root_run").on(table.rootRunId),
    index("idx_agent_tasks_agent_created").on(table.agentId, table.createdAt),
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
    authorizedByUserId: text("authorized_by_user_id"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("idx_connections_project_provider").on(table.projectId, table.provider)],
);
