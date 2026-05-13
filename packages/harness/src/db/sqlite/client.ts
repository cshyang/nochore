import crypto from "node:crypto";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { HarnessDb } from "../types";
import * as schema from "./schema";

const FULL_RESET_TABLES = [
  "chat_messages",
  "action_executions",
  "pending_actions",
  "agent_events",
  "conversation_checkpoints",
  "conversation_events",
  "conversation_threads",
  "runs",
  "approvals",
  "learned_policy_rules",
  "suggestion_suppressions",
  "work_items",
  "agent_tasks",
  "run_events",
  "lessons",
  "agents",
  "agent_connection_bindings",
  "connections",
  "projects",
] as const;

const RUNTIME_RESET_TABLES = ["runs", "approvals", "work_items", "agent_tasks", "run_events"] as const;

const CURRENT_SCHEMA_VERSION = 5;

const CREATE_DDL = `
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    skills TEXT NOT NULL DEFAULT '[]',
    tool_config TEXT NOT NULL DEFAULT '{}',
    notification_config TEXT NOT NULL DEFAULT '{}',
    schedule TEXT NOT NULL DEFAULT 'manual',
    primary_metric TEXT,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agents_project ON agents (project_id);

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    error TEXT,
    summary TEXT,
    trigger_run_id TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_runs_agent_started ON runs (agent_id, started_at);

  CREATE TABLE IF NOT EXISTS conversation_threads (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    scope TEXT NOT NULL,
    channel_kind TEXT NOT NULL,
    channel_key TEXT,
    title TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    last_message_at INTEGER,
    last_input_tokens INTEGER,
    last_output_tokens INTEGER,
    last_total_tokens INTEGER,
    last_compacted_at INTEGER,
    consecutive_compaction_failures INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_agent_scope ON conversation_threads (agent_id, scope);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_threads_agent_primary ON conversation_threads (agent_id) WHERE scope = 'primary';
  CREATE INDEX IF NOT EXISTS idx_conversation_threads_agent_updated ON conversation_threads (agent_id, updated_at);

  CREATE TABLE IF NOT EXISTS conversation_events (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    source TEXT NOT NULL,
    role TEXT NOT NULL,
    event_type TEXT NOT NULL,
    message_id TEXT,
    event_key TEXT,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversation_events_thread_created ON conversation_events (thread_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_conversation_events_agent_created ON conversation_events (agent_id, created_at);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_events_thread_message ON conversation_events (thread_id, message_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_events_thread_event_key ON conversation_events (thread_id, event_key);

  CREATE TABLE IF NOT EXISTS conversation_checkpoints (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    message_count INTEGER NOT NULL DEFAULT 0,
    estimated_tokens INTEGER,
    covers_through_message_id TEXT,
    summary_version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_checkpoints_thread_kind ON conversation_checkpoints (thread_id, kind);

  CREATE TABLE IF NOT EXISTS run_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    payload TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_run_events_run_ts ON run_events (run_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_run_events_agent_ts ON run_events (agent_id, timestamp);

  CREATE TABLE IF NOT EXISTS approvals (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    approval_id TEXT NOT NULL,
    wait_token_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    tool_input TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    request_reason TEXT,
    request_event_id TEXT,
    decision_reason TEXT,
    agent_task_id TEXT,
    created_at INTEGER NOT NULL,
    expires_at INTEGER,
    resolved_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_approval_id ON approvals (approval_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_agent_created ON approvals (agent_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals (run_id);

  CREATE TABLE IF NOT EXISTS learned_policy_rules (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    learned_decision TEXT NOT NULL,
    conditions TEXT,
    evidence_count INTEGER NOT NULL,
    consistency_rate REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'suggested',
    suggested_at INTEGER NOT NULL,
    accepted_at INTEGER,
    revoked_at INTEGER,
    expires_at INTEGER,
    user_note TEXT,
    source_approval_ids TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_learned_rules_agent_status ON learned_policy_rules (agent_id, status);
  CREATE INDEX IF NOT EXISTS idx_learned_rules_agent_tool ON learned_policy_rules (agent_id, tool_name);

  CREATE TABLE IF NOT EXISTS suggestion_suppressions (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    suppressed_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_suppressions_agent_tool ON suggestion_suppressions (agent_id, tool_name);

  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    scope TEXT NOT NULL,
    confidence TEXT NOT NULL,
    source_run_event_ids TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_lessons_agent_scope ON lessons (agent_id, scope);

  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    composio_entity_id TEXT,
    status TEXT NOT NULL,
    config TEXT,
    authorized_by_user_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_connections_project_provider ON connections (project_id, provider);

  CREATE TABLE IF NOT EXISTS agent_connection_bindings (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    resource_type TEXT,
    resource_id TEXT,
    resource_label TEXT,
    alias TEXT NOT NULL,
    purpose TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    config TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_agent_connection_bindings_agent ON agent_connection_bindings (agent_id);
  CREATE INDEX IF NOT EXISTS idx_agent_connection_bindings_connection ON agent_connection_bindings (connection_id);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_connection_bindings_agent_alias ON agent_connection_bindings (agent_id, alias);

  CREATE TABLE IF NOT EXISTS agent_tasks (
    id TEXT PRIMARY KEY,
    parent_run_id TEXT NOT NULL,
    root_run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'agent_task_run',
    role TEXT NOT NULL,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    blocking_reason TEXT,
    error TEXT,
    result TEXT,
    trigger_task_run_id TEXT,
    input_tokens INTEGER,
    output_tokens INTEGER,
    created_at INTEGER NOT NULL,
    started_at INTEGER,
    completed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_parent_run ON agent_tasks (parent_run_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_root_run ON agent_tasks (root_run_id);
  CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_created ON agent_tasks (agent_id, created_at);
`;

export function createDb(dbPath: string): HarnessDb {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite);
  return drizzle(sqlite, { schema }) as HarnessDb;
}

export function createTestDb(): HarnessDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite, true);
  return drizzle(sqlite, { schema }) as HarnessDb;
}

function ensureSchema(sqlite: Database.Database, forceReset = false) {
  const version = sqlite.pragma("user_version", { simple: true }) as number;
  const needsFullReset = forceReset || hasLegacyAgentSchema(sqlite);

  if (needsFullReset) {
    sqlite.exec("BEGIN");
    try {
      for (const table of FULL_RESET_TABLES) {
        sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
      }
      sqlite.exec(CREATE_DDL);
      sqlite.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
    return;
  }

  if (version !== CURRENT_SCHEMA_VERSION) {
    sqlite.exec("BEGIN");
    try {
      for (const table of RUNTIME_RESET_TABLES) {
        sqlite.exec(`DROP TABLE IF EXISTS ${table}`);
      }
      sqlite.exec(CREATE_DDL);
      migrateAddColumns(sqlite);
      migrateAgentConnectionBindings(sqlite);
      deleteEpisodicLessons(sqlite);
      renameDelegationToolConfig(sqlite);
      sqlite.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
    return;
  }

  sqlite.exec(CREATE_DDL);
  migrateAddColumns(sqlite);
  migrateAgentConnectionBindings(sqlite);
  renameDelegationToolConfig(sqlite);
}

function migrateAddColumns(sqlite: Database.Database) {
  const runCols = sqlite.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
  if (runCols.length > 0 && !runCols.some((c) => c.name === "trigger_run_id")) {
    sqlite.exec("ALTER TABLE runs ADD COLUMN trigger_run_id TEXT");
  }

  const conversationThreadCols = sqlite.prepare("PRAGMA table_info(conversation_threads)").all() as Array<{
    name: string;
  }>;
  if (conversationThreadCols.length > 0 && !conversationThreadCols.some((c) => c.name === "last_input_tokens")) {
    sqlite.exec("ALTER TABLE conversation_threads ADD COLUMN last_input_tokens INTEGER");
  }
  if (conversationThreadCols.length > 0 && !conversationThreadCols.some((c) => c.name === "last_output_tokens")) {
    sqlite.exec("ALTER TABLE conversation_threads ADD COLUMN last_output_tokens INTEGER");
  }
  if (conversationThreadCols.length > 0 && !conversationThreadCols.some((c) => c.name === "last_total_tokens")) {
    sqlite.exec("ALTER TABLE conversation_threads ADD COLUMN last_total_tokens INTEGER");
  }
  if (conversationThreadCols.length > 0 && !conversationThreadCols.some((c) => c.name === "last_compacted_at")) {
    sqlite.exec("ALTER TABLE conversation_threads ADD COLUMN last_compacted_at INTEGER");
  }
  if (
    conversationThreadCols.length > 0 &&
    !conversationThreadCols.some((c) => c.name === "consecutive_compaction_failures")
  ) {
    sqlite.exec(
      "ALTER TABLE conversation_threads ADD COLUMN consecutive_compaction_failures INTEGER NOT NULL DEFAULT 0",
    );
  }
  const conversationThreadIndexes = sqlite.prepare("PRAGMA index_list(conversation_threads)").all() as Array<{
    name: string;
    unique: number;
  }>;
  const legacyScopeIndex = conversationThreadIndexes.find(
    (index) => index.name === "idx_conversation_threads_agent_scope",
  );
  if (legacyScopeIndex?.unique) {
    sqlite.exec("DROP INDEX IF EXISTS idx_conversation_threads_agent_scope");
  }
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS idx_conversation_threads_agent_scope ON conversation_threads (agent_id, scope)",
  );
  sqlite.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_threads_agent_primary ON conversation_threads (agent_id) WHERE scope = 'primary'",
  );

  const conversationEventCols = sqlite.prepare("PRAGMA table_info(conversation_events)").all() as Array<{
    name: string;
  }>;
  if (conversationEventCols.length > 0 && !conversationEventCols.some((c) => c.name === "event_key")) {
    sqlite.exec("ALTER TABLE conversation_events ADD COLUMN event_key TEXT");
  }
  sqlite.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_conversation_events_thread_event_key ON conversation_events (thread_id, event_key)",
  );

  const conversationCheckpointCols = sqlite.prepare("PRAGMA table_info(conversation_checkpoints)").all() as Array<{
    name: string;
  }>;
  if (conversationCheckpointCols.length > 0 && !conversationCheckpointCols.some((c) => c.name === "estimated_tokens")) {
    sqlite.exec("ALTER TABLE conversation_checkpoints ADD COLUMN estimated_tokens INTEGER");
  }
  if (conversationCheckpointCols.length > 0 && !conversationCheckpointCols.some((c) => c.name === "summary_version")) {
    sqlite.exec("ALTER TABLE conversation_checkpoints ADD COLUMN summary_version INTEGER NOT NULL DEFAULT 1");
  }

  const approvalCols = sqlite.prepare("PRAGMA table_info(approvals)").all() as Array<{ name: string }>;
  if (approvalCols.length > 0 && !approvalCols.some((c) => c.name === "request_reason")) {
    sqlite.exec("ALTER TABLE approvals ADD COLUMN request_reason TEXT");
  }
  if (approvalCols.length > 0 && !approvalCols.some((c) => c.name === "request_event_id")) {
    sqlite.exec("ALTER TABLE approvals ADD COLUMN request_event_id TEXT");
  }
  if (approvalCols.length > 0 && !approvalCols.some((c) => c.name === "expires_at")) {
    sqlite.exec("ALTER TABLE approvals ADD COLUMN expires_at INTEGER");
  }
  if (approvalCols.length > 0 && !approvalCols.some((c) => c.name === "agent_task_id")) {
    sqlite.exec("ALTER TABLE approvals ADD COLUMN agent_task_id TEXT");
  }

  const agentCols = sqlite.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>;
  if (agentCols.length > 0 && !agentCols.some((c) => c.name === "primary_metric")) {
    sqlite.exec("ALTER TABLE agents ADD COLUMN primary_metric TEXT");
  }

  const connectionCols = sqlite.prepare("PRAGMA table_info(connections)").all() as Array<{ name: string }>;
  if (connectionCols.length > 0 && !connectionCols.some((c) => c.name === "authorized_by_user_id")) {
    sqlite.exec("ALTER TABLE connections ADD COLUMN authorized_by_user_id TEXT");
  }
}

function migrateAgentConnectionBindings(sqlite: Database.Database) {
  if (
    !tableExists(sqlite, "agent_connection_bindings") ||
    !tableExists(sqlite, "agents") ||
    !tableExists(sqlite, "connections")
  ) {
    return;
  }

  const agents = sqlite.prepare("SELECT id, tool_config FROM agents").all() as Array<{
    id: string;
    tool_config: string | null;
  }>;
  const activeConnections = sqlite
    .prepare("SELECT id, provider, config, updated_at FROM connections WHERE status = 'active' ORDER BY updated_at ASC")
    .all() as Array<{ id: string; provider: string; config: string | null; updated_at: number }>;
  if (agents.length === 0 || activeConnections.length === 0) {
    return;
  }

  const existing = sqlite
    .prepare("SELECT agent_id, provider, connection_id, resource_id FROM agent_connection_bindings")
    .all() as Array<{ agent_id: string; provider: string; connection_id: string; resource_id: string | null }>;
  const existingKeys = new Set(
    existing.map((row) => `${row.agent_id}:${row.provider}:${row.connection_id}:${row.resource_id ?? ""}`),
  );
  const insert = sqlite.prepare(
    [
      "INSERT OR IGNORE INTO agent_connection_bindings",
      "(id, agent_id, provider, connection_id, resource_type, resource_id, resource_label, alias, purpose, is_default, status, config, created_at, updated_at)",
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)",
    ].join(" "),
  );
  const now = Date.now();

  for (const agent of agents) {
    const requiredProviders = parseRequiredProviders(agent.tool_config);
    for (const provider of requiredProviders) {
      const connection = activeConnections.filter((row) => row.provider === provider).at(-1);
      if (!connection) {
        continue;
      }
      const connectionConfig = parseObjectJson(connection.config);
      const resourceId = provider === "googleads" ? getGoogleAdsCustomerId(connectionConfig) : null;
      const resourceLabel = provider === "googleads" && resourceId ? formatGoogleAdsCustomerId(resourceId) : null;
      const resourceType = provider === "googleads" && resourceId ? "google_ads_customer" : null;
      const key = `${agent.id}:${provider}:${connection.id}:${resourceId ?? ""}`;
      if (existingKeys.has(key)) {
        continue;
      }
      existingKeys.add(key);
      insert.run(
        crypto.randomUUID().slice(0, 12),
        agent.id,
        provider,
        connection.id,
        resourceType,
        resourceId,
        resourceLabel,
        defaultBindingAlias(provider, resourceId),
        "Migrated from required provider",
        1,
        JSON.stringify({ migratedFrom: "requiredProviders" }),
        now,
        now,
      );
    }
  }
}

function parseRequiredProviders(value: string | null): string[] {
  const parsed = parseObjectJson(value);
  const required = parsed.requiredProviders;
  if (!Array.isArray(required)) {
    return [];
  }
  return Array.from(
    new Set(
      required
        .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>).provider : null))
        .filter((provider): provider is string => typeof provider === "string" && provider.trim().length > 0),
    ),
  );
}

function parseObjectJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function getGoogleAdsCustomerId(config: Record<string, unknown>): string | null {
  const value = config.selectedCustomerId ?? config.customerId;
  return typeof value === "string" && value.trim() ? value.replace(/\D/g, "") : null;
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function defaultBindingAlias(provider: string, resourceId: string | null): string {
  if (provider === "googleads" && resourceId) {
    return `googleads_${resourceId}`;
  }
  return provider;
}

function deleteEpisodicLessons(sqlite: Database.Database) {
  if (tableExists(sqlite, "lessons")) {
    sqlite.exec("DELETE FROM lessons WHERE scope LIKE 'episode:%'");
  }
}

function renameDelegationToolConfig(sqlite: Database.Database) {
  if (tableExists(sqlite, "agents")) {
    const rows = sqlite.prepare("SELECT id, tool_config FROM agents").all() as Array<{
      id: string;
      tool_config: string | null;
    }>;
    const update = sqlite.prepare("UPDATE agents SET tool_config = ? WHERE id = ?");

    for (const row of rows) {
      if (!row.tool_config?.includes("spawn_sub_run")) {
        continue;
      }

      try {
        const parsed = JSON.parse(row.tool_config) as {
          tools?: Record<string, Record<string, unknown>>;
        };
        const tools = parsed.tools ?? {};
        const legacy = tools.spawn_sub_run;
        if (!legacy) {
          continue;
        }

        tools.delegate_task = {
          ...legacy,
          toolName: "delegate_task",
          slug: "delegate_task",
          title: legacy.title ?? "Delegate tasks",
          description: legacy.description ?? "Delegate work to an agent task via the coordinated runtime.",
        };
        delete tools.spawn_sub_run;
        parsed.tools = tools;
        update.run(JSON.stringify(parsed), row.id);
      } catch {
        // Keep invalid config as-is; repository validation will surface it later.
      }
    }
  }

  if (tableExists(sqlite, "learned_policy_rules")) {
    sqlite.exec("UPDATE learned_policy_rules SET tool_name = 'delegate_task' WHERE tool_name = 'spawn_sub_run'");
  }
  if (tableExists(sqlite, "suggestion_suppressions")) {
    sqlite.exec("UPDATE suggestion_suppressions SET tool_name = 'delegate_task' WHERE tool_name = 'spawn_sub_run'");
  }
}

function tableExists(sqlite: Database.Database, tableName: string): boolean {
  return sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName) != null;
}

function hasLegacyAgentSchema(sqlite: Database.Database): boolean {
  try {
    const cols = sqlite.prepare("PRAGMA table_info(agents)").all() as Array<{ name: string }>;

    if (cols.length === 0) {
      return false;
    }

    return cols.some((col) => col.name === "config") || !cols.some((col) => col.name === "instructions");
  } catch {
    return false;
  }
}
