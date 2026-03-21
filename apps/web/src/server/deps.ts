/**
 * Shared dependency factory for server functions.
 *
 * Caches DB connections per project and provides ready-to-use repository
 * instances. Every server function calls getProjectDeps() or getAgentDeps()
 * rather than constructing its own instances.
 */

import { eq } from "drizzle-orm";
import { createDb } from "../../../../packages/harness/src/db/client";
import { agents } from "../../../../packages/harness/src/db/schema";
import { SqliteMemoryStore } from "../../../../packages/harness/src/memory/store";
import { RunRepository } from "../../../../packages/harness/src/repositories/run";
import { ApprovalRepository } from "../../../../packages/harness/src/repositories/approval";
import { ChatSessionStore } from "../../../../packages/harness/src/repositories/chat-session";
import { SkillRegistry } from "../../../../packages/harness/src/skills/registry";
import { WorkspaceStore } from "../../../../packages/harness/src/workspace/store";
import { ContextAssembler } from "../../../../packages/harness/src/context/assembler";
import { searchTermsSkill } from "../../../../packages/harness/src/skills/built-in/search-terms";
import type { AgentConfig } from "../../../../packages/harness/src/types/agent-config";

// ---------------------------------------------------------------------------
// DB cache — one connection per project, reused across requests
// ---------------------------------------------------------------------------

const dbCache = new Map<string, ReturnType<typeof createDb>>();

function getDb(projectId: string) {
  if (!dbCache.has(projectId)) {
    dbCache.set(projectId, createDb(`data/projects/${projectId}/nochore.db`));
  }
  return dbCache.get(projectId)!;
}

// ---------------------------------------------------------------------------
// Project-level dependencies (DB + repositories)
// ---------------------------------------------------------------------------

export function getProjectDeps(projectId: string) {
  const db = getDb(projectId);
  return {
    db,
    memoryStore: new SqliteMemoryStore(db),
    runRepository: new RunRepository(db),
    approvalRepository: new ApprovalRepository(db),
    chatSessionStore: new ChatSessionStore(db),
  };
}

// ---------------------------------------------------------------------------
// Agent-level dependencies (project deps + workspace + skills + context)
// ---------------------------------------------------------------------------

export function getAgentDeps(projectId: string, config: AgentConfig) {
  const base = getProjectDeps(projectId);
  const skillRegistry = new SkillRegistry();
  skillRegistry.register(searchTermsSkill);

  const workspaceStore = new WorkspaceStore(config.workspacePath);
  const contextAssembler = new ContextAssembler(
    workspaceStore,
    base.memoryStore,
  );

  return { ...base, skillRegistry, workspaceStore, contextAssembler };
}

// ---------------------------------------------------------------------------
// Agent query helpers — keep drizzle-orm usage contained in this module
// ---------------------------------------------------------------------------

/** Agent record with parsed config and Date fields. */
export interface AgentRecord {
  id: string;
  projectId: string;
  config: AgentConfig;
  createdAt: Date;
  updatedAt: Date;
}

/** List all agents in a project. */
export function listAgentRows(projectId: string): AgentRecord[] {
  const { db } = getProjectDeps(projectId);
  const rows = db
    .select()
    .from(agents)
    .where(eq(agents.projectId, projectId))
    .all();
  return rows.map(toAgentRecord);
}

/** Get a single agent by id. Returns null if not found. */
export function getAgentRow(
  projectId: string,
  agentId: string,
): AgentRecord | null {
  const { db } = getProjectDeps(projectId);
  const row = db
    .select()
    .from(agents)
    .where(eq(agents.id, agentId))
    .get();
  return row ? toAgentRecord(row) : null;
}

function toAgentRecord(row: typeof agents.$inferSelect): AgentRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    config: JSON.parse(row.config) as AgentConfig,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}
