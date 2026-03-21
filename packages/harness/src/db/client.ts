import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema";

export function createDb(dbPath: string) {
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

/**
 * Creates an in-memory SQLite database with all tables for testing.
 * Tables are created via raw DDL statements matching the Drizzle schema.
 */
export function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  createTables(sqlite);
  return drizzle(sqlite, { schema });
}

function createTables(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      icon TEXT,
      color TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE agents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      config TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE agent_events (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      data TEXT NOT NULL
    );
    CREATE INDEX idx_events_agent_ts ON agent_events (agent_id, timestamp);
    CREATE INDEX idx_events_run ON agent_events (run_id);

    CREATE TABLE lessons (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      content TEXT NOT NULL,
      scope TEXT NOT NULL,
      confidence TEXT NOT NULL,
      source_event_ids TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER
    );
    CREATE INDEX idx_lessons_agent_scope ON lessons (agent_id, scope);

    CREATE TABLE runs (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      completed_at INTEGER,
      result TEXT
    );

    CREATE TABLE pending_actions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      proposal TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved_at INTEGER,
      resolved_reason TEXT
    );

    CREATE TABLE chat_messages (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_call_id TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX idx_chat_agent_ts ON chat_messages (agent_id, created_at);

    CREATE TABLE connections (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      composio_entity_id TEXT,
      status TEXT NOT NULL,
      config TEXT,
      created_at INTEGER NOT NULL
    );
  `);
}
