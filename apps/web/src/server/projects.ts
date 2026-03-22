/**
 * Project CRUD server functions.
 *
 * Provides list, get, and create operations for projects.
 * Scans data/projects/ directory for project databases and builds
 * the frontend ProjectView type from harness DB data.
 */

import crypto from "node:crypto";
import { readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import { getProjectDeps } from "./deps";
import {
  projects,
  agents,
  runs,
  lessons,
  pendingActions,
  connections,
} from "../../../../packages/harness/src/db/schema";
import { jsonSafe } from "./serializable";
import type { AgentConfig } from "../../../../packages/harness/src/types/agent-config";
import { relativeTime } from "../lib/types";
import type { AgentView, ProjectView } from "../lib/types";

// ---------------------------------------------------------------------------
// Icon mapping — DB stores icon names, UI expects emoji
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, string> = {
  building: "\u{1F3E2}",
  hospital: "\u{1F3E5}",
  gear: "\u2699\uFE0F",
  rocket: "\u{1F680}",
  chart: "\u{1F4C8}",
  star: "\u2B50",
  briefcase: "\u{1F4BC}",
  globe: "\u{1F310}",
  shield: "\u{1F6E1}\uFE0F",
  lightning: "\u26A1",
};

function resolveIcon(icon: string | null): string {
  if (!icon) return "\u{1F4C1}";
  // If it's already an emoji (starts with a high codepoint), return as-is
  if (icon.codePointAt(0)! > 255) return icon;
  return ICON_MAP[icon] ?? "\u{1F4C1}";
}

// ---------------------------------------------------------------------------
// Schedule extraction helper
// ---------------------------------------------------------------------------

function extractSchedule(config: AgentConfig): string {
  const trigger = config.triggers?.[0];
  if (!trigger) return "manual";
  const cron = (trigger.config as { cron?: string })?.cron;
  if (!cron) return "manual";
  // Map common cron patterns to labels
  if (cron.includes("*/1 ")) return "hourly";
  if (cron.includes("*/6 ") || cron === "0 */6 * * *") return "6hours";
  if (cron === "0 9 * * *" || cron.match(/^0 \d+ \* \* \*$/)) return "daily";
  if (cron.includes("0 9 * * 1")) return "weekly";
  return "daily"; // default
}

// ---------------------------------------------------------------------------
// Build AgentView from DB data
// ---------------------------------------------------------------------------

type DrizzleDb = ReturnType<typeof getProjectDeps>["db"];

export function buildAgentView(
  agentRow: { id: string; config: string; createdAt: number },
  db: DrizzleDb,
): AgentView {
  const config = JSON.parse(agentRow.config) as AgentConfig;

  // Count pending actions (status = 'pending')
  const pendingCount = db
    .select()
    .from(pendingActions)
    .where(
      and(
        eq(pendingActions.agentId, agentRow.id),
        eq(pendingActions.status, "pending"),
      ),
    )
    .all().length;

  // Count non-expired lessons
  const now = Date.now();
  const lessonCount = db
    .select()
    .from(lessons)
    .where(
      and(
        eq(lessons.agentId, agentRow.id),
        or(isNull(lessons.expiresAt), gt(lessons.expiresAt, now)),
      ),
    )
    .all().length;

  // Get runs (count + latest)
  const allRuns = db
    .select()
    .from(runs)
    .where(eq(runs.agentId, agentRow.id))
    .all();
  const latestRun = allRuns.sort((a, b) => b.startedAt - a.startedAt)[0];

  // Compute status
  let status: AgentView["status"] = "idle";
  if (pendingCount > 0) {
    status = "attention";
  } else if (allRuns.length > 0) {
    status = "running";
  }

  return {
    id: agentRow.id,
    name: config.name,
    description: config.description,
    intent: config.intent,
    skills: config.skills,
    schedule: extractSchedule(config),
    policyRules: config.policyRules,
    globalApprovalRequired: config.globalApprovalRequired,
    scopeStrategy: config.scopeStrategy,
    status,
    lastRunAt: latestRun?.startedAt ?? null,
    lastRunRelative: latestRun ? relativeTime(latestRun.startedAt) : null,
    nextRunAt: null, // TODO: compute from schedule + lastRunAt
    pendingCount,
    lessonCount,
    runCount: allRuns.length,
    createdAt: agentRow.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Build ProjectView from DB data
// ---------------------------------------------------------------------------

function buildProjectView(
  projectRow: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
    createdAt: number;
  },
  db: DrizzleDb,
): ProjectView {
  const agentRows = db
    .select()
    .from(agents)
    .where(eq(agents.projectId, projectRow.id))
    .all();

  const builtAgents = agentRows.map((row) => buildAgentView(row, db));

  // Count active connections
  const connectionCount = db
    .select()
    .from(connections)
    .where(
      and(
        eq(connections.projectId, projectRow.id),
        eq(connections.status, "active"),
      ),
    )
    .all().length;

  const attentionCount = builtAgents.filter(
    (a) => a.status === "attention",
  ).length;

  return {
    id: projectRow.id,
    name: projectRow.name,
    icon: resolveIcon(projectRow.icon),
    color: projectRow.color ?? "#6C5CE7",
    agents: builtAgents,
    connectionCount,
    attentionCount,
    createdAt: projectRow.createdAt,
  };
}

// ---------------------------------------------------------------------------
// listProjects — scan filesystem for project DBs
// ---------------------------------------------------------------------------

export const listProjects = createServerFn({ method: "GET" }).handler(
  async () => {
    const projectsDir = "data/projects";
    if (!existsSync(projectsDir)) return jsonSafe([]);

    const dirs = readdirSync(projectsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);

    const result: ProjectView[] = [];

    for (const dir of dirs) {
      const dbPath = join(projectsDir, dir, "nochore.db");
      if (!existsSync(dbPath)) continue;

      try {
        const { db } = getProjectDeps(dir);
        const projectRow = db.select().from(projects).get();
        if (!projectRow) continue;
        result.push(buildProjectView(projectRow, db));
      } catch {
        // Skip projects with corrupted DBs
        continue;
      }
    }

    return jsonSafe(result);
  },
);

// ---------------------------------------------------------------------------
// getProject — single project by id
// ---------------------------------------------------------------------------

export const getProject = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const dbPath = join("data/projects", projectId, "nochore.db");
    if (!existsSync(dbPath)) return jsonSafe(null);

    try {
      const { db } = getProjectDeps(projectId);
      const projectRow = db.select().from(projects).get();
      if (!projectRow) return jsonSafe(null);
      return jsonSafe(buildProjectView(projectRow, db));
    } catch {
      return jsonSafe(null);
    }
  });

// ---------------------------------------------------------------------------
// createProject — create a new project with directory + DB
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export const createProject = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { name: string; icon?: string; color?: string }) => input,
  )
  .handler(async ({ data }) => {
    const projectId =
      slugify(data.name) || crypto.randomUUID().slice(0, 8);
    const projectDir = join("data/projects", projectId);

    // Create directory
    mkdirSync(projectDir, { recursive: true });

    // Create DB and tables
    const dbPath = join(projectDir, "nochore.db");
    const Database = (await import("better-sqlite3")).default;
    const sqlite = new Database(dbPath);
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.exec(DDL);
    sqlite.close();

    // Now open via drizzle and insert project record
    const { db } = getProjectDeps(projectId);
    const now = Date.now();
    db.insert(projects)
      .values({
        id: projectId,
        name: data.name,
        icon: data.icon ?? "briefcase",
        color: data.color ?? "#6C5CE7",
        createdAt: now,
      })
      .run();

    const project: ProjectView = {
      id: projectId,
      name: data.name,
      icon: resolveIcon(data.icon ?? "briefcase"),
      color: data.color ?? "#6C5CE7",
      agents: [],
      connectionCount: 0,
      attentionCount: 0,
      createdAt: now,
    };

    return jsonSafe(project);
  });

// ---------------------------------------------------------------------------
// deleteProject — remove a project and all its data
// ---------------------------------------------------------------------------

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    // Remove the entire project directory (DB + agent workspaces)
    const projectDir = join("data/projects", projectId);
    try {
      rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }

    return jsonSafe({ deleted: true });
  });
