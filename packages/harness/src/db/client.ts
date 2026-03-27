import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

const RESET_TABLES = [
  "chat_messages",
  "action_executions",
  "pending_actions",
  "agent_events",
  "runs",
  "approvals",
  "run_events",
  "lessons",
  "agents",
  "connections",
  "projects",
] as const;

const CURRENT_SCHEMA_VERSION = 2;

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
    decision_reason TEXT,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_approval_id ON approvals (approval_id);
  CREATE INDEX IF NOT EXISTS idx_approvals_agent_created ON approvals (agent_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals (run_id);

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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_connections_project_provider ON connections (project_id, provider);
`;

export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite);
  return drizzle(sqlite, { schema });
}

export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  ensureSchema(sqlite, true);
  return drizzle(sqlite, { schema });
}

function ensureSchema(sqlite: Database.Database, forceReset = false) {
  const version = sqlite.pragma("user_version", { simple: true }) as number;
  const needsReset = forceReset || version !== CURRENT_SCHEMA_VERSION || hasLegacyAgentSchema(sqlite);

  if (needsReset) {
    sqlite.exec("BEGIN");
    try {
      for (const table of RESET_TABLES) {
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

  sqlite.exec(CREATE_DDL);
  migrateAddColumns(sqlite);
}

function migrateAddColumns(sqlite: Database.Database) {
  const runCols = sqlite.prepare("PRAGMA table_info(runs)").all() as Array<{ name: string }>;
  if (runCols.length > 0 && !runCols.some((c) => c.name === "trigger_run_id")) {
    sqlite.exec("ALTER TABLE runs ADD COLUMN trigger_run_id TEXT");
  }
}

function hasLegacyAgentSchema(sqlite: Database.Database): boolean {
  try {
    const cols = sqlite
      .prepare("PRAGMA table_info(agents)")
      .all() as Array<{ name: string }>;

    if (cols.length === 0) {
      return false;
    }

    return cols.some((col) => col.name === "config") || !cols.some((col) => col.name === "instructions");
  } catch {
    return false;
  }
}
