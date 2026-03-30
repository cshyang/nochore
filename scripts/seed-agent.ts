#!/usr/bin/env npx tsx

/**
 * Seed script: creates the first Nochore agent — Ad Spend Guardian.
 *
 * What it does:
 *   1. Creates the project directory and SQLite database
 *   2. Creates all tables (idempotent — uses IF NOT EXISTS)
 *   3. Inserts the Acme Corp project and Ad Spend Guardian agent
 *   4. Initializes the agent workspace (AGENT.md, POLICY.md, KNOWLEDGE.md)
 *   5. Writes enriched KNOWLEDGE.md with Google Ads domain context
 *
 * Safe to run multiple times — uses INSERT OR REPLACE and IF NOT EXISTS.
 *
 * Usage:
 *   npx tsx scripts/seed-agent.ts
 */

import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../packages/harness/src/db/schema";
import { initializeWorkspace } from "../packages/harness/src/workspace/templates";
import type { AgentConfig } from "../packages/harness/src/types/agent-config";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = "acme";
const AGENT_ID = "ad-guardian";
const ROOT = path.resolve(__dirname, "..");
const DB_PATH = path.join(ROOT, "data", "projects", PROJECT_ID, "nochore.db");
const WORKSPACE_PATH = path.join(
  ROOT,
  "data",
  "projects",
  PROJECT_ID,
  "agents",
  AGENT_ID
);

// ---------------------------------------------------------------------------
// DDL — mirrors packages/harness/src/db/client.ts createTables()
// ---------------------------------------------------------------------------

const DDL = `
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
    config TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS agent_events (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    type TEXT NOT NULL,
    data TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_events_agent_ts ON agent_events (agent_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_events_run ON agent_events (run_id);

  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    content TEXT NOT NULL,
    scope TEXT NOT NULL,
    confidence TEXT NOT NULL,
    source_event_ids TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    expires_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_lessons_agent_scope ON lessons (agent_id, scope);

  CREATE TABLE IF NOT EXISTS runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    trigger_type TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    result TEXT
  );

  CREATE TABLE IF NOT EXISTS pending_actions (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    proposal TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    resolved_at INTEGER,
    resolved_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_call_id TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_chat_agent_ts ON chat_messages (agent_id, created_at);

  CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    composio_entity_id TEXT,
    status TEXT NOT NULL,
    config TEXT,
    created_at INTEGER NOT NULL
  );
`;

// ---------------------------------------------------------------------------
// Agent config
// ---------------------------------------------------------------------------

const agentConfig: AgentConfig = {
  id: AGENT_ID,
  projectId: PROJECT_ID,
  name: "Ad Spend Guardian",
  description:
    "Monitors Google Ads for wasteful spend and budget inefficiencies",
  intent:
    "Find and eliminate wasted ad spend. Surface search term waste, budget misallocation, and quality score issues. Recommend and execute optimizations within policy bounds.",
  workspacePath: WORKSPACE_PATH,
  skills: ["search_terms"],
  skillKnowledge: {},
  triggers: [{ type: "cron", config: { cron: "0 9 * * *" } }],
  policyRules: ["budget_delta", "cooldown"],
  policyOverrides: [],
  globalApprovalRequired: false,
  operationalConstraints: [],
  connectionIds: [],
  memoryEnabled: true,
  lessonDistillationInterval: 5,
  scopeStrategy: "static",
};

// ---------------------------------------------------------------------------
// Enriched KNOWLEDGE.md — Google Ads domain context
// ---------------------------------------------------------------------------

const KNOWLEDGE_MD = `# Domain Knowledge

## Brand Terms
- (Add client brand terms here)
- (Add competitor terms here)

## Business Context
- Industry: (specify)
- Primary KPI: Cost Per Lead (CPL)
- Target CPL: (specify)
- Secondary KPIs: CTR, Conversion Rate, Impression Share

## Google Ads Account Structure
- (Will be populated after first analysis)

## Search Term Waste Patterns
- Irrelevant queries that burn budget without conversions
- Competitor brand terms with high CPC and low conversion
- Broad match terms that drift from intent
- Geographic mismatches (ads showing in wrong regions)

## Quality Score Signals
- Landing page experience: relevance, load speed, mobile-friendliness
- Ad relevance: alignment between keywords, ads, and landing pages
- Expected CTR: historical click-through rate vs benchmarks

## Budget Allocation Heuristics
- Campaigns with high CPL should have budget reduced or paused
- High-performing campaigns with limited impression share deserve more budget
- Seasonal patterns affect optimal budget distribution
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const now = Date.now();

  // 1. Create directories
  console.log("Creating directories...");
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  // 2. Create DB with tables
  console.log("Initializing database...");
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);

  const db = drizzle(sqlite, { schema });

  // 3. Insert project (upsert)
  console.log("Inserting project...");
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO projects (id, name, icon, color, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(PROJECT_ID, "Acme Corp", "building", "#6C5CE7", now);

  // 4. Insert agent (upsert)
  console.log("Inserting agent...");
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO agents (id, project_id, config, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      AGENT_ID,
      PROJECT_ID,
      JSON.stringify(agentConfig),
      now,
      now
    );

  // 5. Initialize workspace (creates AGENT.md, POLICY.md, default KNOWLEDGE.md)
  console.log("Initializing workspace...");
  await initializeWorkspace(WORKSPACE_PATH, agentConfig.name, agentConfig.intent);

  // 6. Overwrite KNOWLEDGE.md with enriched Google Ads domain content
  const knowledgePath = path.join(WORKSPACE_PATH, "KNOWLEDGE.md");
  writeFileSync(knowledgePath, KNOWLEDGE_MD, "utf-8");

  // 7. Close DB
  sqlite.close();

  // 8. Print success
  console.log("");
  console.log("Agent created successfully!");
  console.log(`   Project: ${PROJECT_ID} (Acme Corp)`);
  console.log(`   Agent: ${AGENT_ID} (Ad Spend Guardian)`);
  console.log(`   DB: ${DB_PATH}`);
  console.log(`   Workspace: ${WORKSPACE_PATH}`);
  console.log("");
  console.log("Next steps:");
  console.log("  1. Start the web app: cd apps/web && npm run dev");
  console.log("  2. Navigate to /acme/agents/ad-guardian");
  console.log("  3. Chat with your agent or trigger a run");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
