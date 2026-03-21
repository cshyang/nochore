/**
 * Project CRUD server functions.
 *
 * Provides list, get, and create operations for projects.
 * Scans data/projects/ directory for project databases and builds
 * the frontend Project type from harness DB data.
 */

import crypto from "node:crypto";
import { readdirSync, existsSync, mkdirSync } from "node:fs";
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
import type { Project, Agent } from "../lib/types";

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
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

// ---------------------------------------------------------------------------
// Build frontend Agent from DB data
// ---------------------------------------------------------------------------

type DrizzleDb = ReturnType<typeof getProjectDeps>["db"];

function buildAgent(
  agentRow: { id: string; config: string },
  db: DrizzleDb,
): Agent {
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

  // Get latest run (sort in JS since drizzle's orderBy needs desc import)
  const allRuns = db
    .select()
    .from(runs)
    .where(eq(runs.agentId, agentRow.id))
    .all();
  const latestRun = allRuns.sort((a, b) => b.startedAt - a.startedAt)[0];

  const lastRunText = latestRun
    ? relativeTime(latestRun.startedAt)
    : "Never";

  return {
    id: agentRow.id,
    name: config.name,
    status: pendingCount > 0 ? "attention" : "running",
    statusText:
      pendingCount > 0
        ? `${pendingCount} action${pendingCount === 1 ? "" : "s"} need${pendingCount === 1 ? "s" : ""} approval`
        : "All clear",
    lastRun: lastRunText,
    skills: config.skills.length,
    lessons: lessonCount,
    confidence: 75,
    domain: config.description?.toLowerCase().includes("ad")
      ? "ads"
      : config.skills[0] ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Build frontend Project from DB data
// ---------------------------------------------------------------------------

function buildProject(
  projectRow: {
    id: string;
    name: string;
    icon: string | null;
    color: string | null;
  },
  db: DrizzleDb,
): Project {
  const agentRows = db
    .select()
    .from(agents)
    .where(eq(agents.projectId, projectRow.id))
    .all();

  const builtAgents = agentRows.map((row) => buildAgent(row, db));

  // Get shared tools from connections
  const connectionRows = db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectRow.id))
    .all();
  const sharedTools = connectionRows.map((c) => c.provider);

  const attentionCount = builtAgents.filter(
    (a) => a.status === "attention",
  ).length;

  return {
    id: projectRow.id,
    name: projectRow.name,
    icon: resolveIcon(projectRow.icon),
    color: projectRow.color ?? "#6C5CE7",
    sharedTools,
    agents: builtAgents,
    attentionCount,
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

    const result: Project[] = [];

    for (const dir of dirs) {
      const dbPath = join(projectsDir, dir, "nochore.db");
      if (!existsSync(dbPath)) continue;

      try {
        const { db } = getProjectDeps(dir);
        const projectRow = db.select().from(projects).get();
        if (!projectRow) continue;
        result.push(buildProject(projectRow, db));
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
      return jsonSafe(buildProject(projectRow, db));
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
    db.insert(projects)
      .values({
        id: projectId,
        name: data.name,
        icon: data.icon ?? "briefcase",
        color: data.color ?? "#6C5CE7",
        createdAt: Date.now(),
      })
      .run();

    const project: Project = {
      id: projectId,
      name: data.name,
      icon: resolveIcon(data.icon ?? "briefcase"),
      color: data.color ?? "#6C5CE7",
      sharedTools: [],
      agents: [],
      attentionCount: 0,
    };

    return jsonSafe(project);
  });
