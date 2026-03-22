/**
 * Agent CRUD server functions.
 *
 * Provides list, get, and create operations for agents within a project.
 * Returns AgentView (computed from DB joins) for list/get operations.
 */

import crypto from "node:crypto";
import { rmSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getProjectDeps } from "./deps";
import { buildAgentView } from "./projects";
import {
  agents,
  runs,
  agentEvents,
  lessons,
  pendingActions,
  chatMessages,
} from "../../../../packages/harness/src/db/schema";
import { initializeWorkspace } from "../../../../packages/harness/src/workspace/templates";
import { jsonSafe } from "./serializable";
import type { AgentConfig } from "../../../../packages/harness/src/types/agent-config";

// ---------------------------------------------------------------------------
// listAgents — all agents for a project, as AgentView[]
// ---------------------------------------------------------------------------

export const listAgents = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const { db } = getProjectDeps(projectId);
    const rows = db
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId))
      .all();
    return jsonSafe(rows.map((row) => buildAgentView(row, db)));
  });

// ---------------------------------------------------------------------------
// getAgent — single agent by id, as AgentView
// ---------------------------------------------------------------------------

export const getAgent = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const { db } = getProjectDeps(projectId);
    const row = db
      .select()
      .from(agents)
      .where(eq(agents.id, agentId))
      .get();
    if (!row) return jsonSafe(null);
    return jsonSafe(buildAgentView(row, db));
  });

// ---------------------------------------------------------------------------
// createAgent — create a new agent in a project
// ---------------------------------------------------------------------------

export const createAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: string;
      name: string;
      description: string;
      intent: string;
      skills: string[];
      scopeStrategy: "static" | "llm";
      policyRules: string[];
      globalApprovalRequired: boolean;
      schedule?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const agentId = crypto.randomUUID().slice(0, 8);
    const workspacePath = `data/projects/${data.projectId}/agents/${agentId}`;

    // Map schedule string to cron expression
    const cronMap: Record<string, string> = {
      hourly: "0 * * * *",
      "6hours": "0 */6 * * *",
      daily: "0 9 * * *",
      weekly: "0 9 * * 1",
      manual: "",
    };
    const cronExpr = cronMap[data.schedule ?? "daily"] ?? "0 9 * * *";

    const config: AgentConfig = {
      id: agentId,
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      intent: data.intent,
      workspacePath,
      skills: data.skills,
      skillKnowledge: {},
      triggers: cronExpr
        ? [{ type: "cron", config: { cron: cronExpr } }]
        : [{ type: "manual", config: {} }],
      policyRules: data.policyRules,
      policyOverrides: [],
      globalApprovalRequired: data.globalApprovalRequired,
      operationalConstraints: [],
      connectionIds: [],
      memoryEnabled: true,
      lessonDistillationInterval: 5,
      scopeStrategy: data.scopeStrategy,
    };

    // Insert agent record
    const { db } = getProjectDeps(data.projectId);
    const now = Date.now();
    db.insert(agents)
      .values({
        id: agentId,
        projectId: data.projectId,
        config: JSON.stringify(config),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Initialize workspace
    await initializeWorkspace(workspacePath, data.name, data.intent);

    return jsonSafe({ id: agentId });
  });

// ---------------------------------------------------------------------------
// deleteAgent — remove an agent and all related data
// ---------------------------------------------------------------------------

export const deleteAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { agentId: string; projectId: string }) => input,
  )
  .handler(async ({ data: { agentId, projectId } }) => {
    const { db } = getProjectDeps(projectId);

    // Delete related rows (no FK cascades in SQLite schema)
    db.delete(chatMessages).where(eq(chatMessages.agentId, agentId)).run();
    db.delete(pendingActions).where(eq(pendingActions.agentId, agentId)).run();
    db.delete(lessons).where(eq(lessons.agentId, agentId)).run();
    db.delete(agentEvents).where(eq(agentEvents.agentId, agentId)).run();
    db.delete(runs).where(eq(runs.agentId, agentId)).run();
    db.delete(agents).where(eq(agents.id, agentId)).run();

    // Remove workspace directory
    const workspacePath = `data/projects/${projectId}/agents/${agentId}`;
    try {
      rmSync(workspacePath, { recursive: true, force: true });
    } catch {
      // Directory may not exist
    }

    return jsonSafe({ deleted: true });
  });
