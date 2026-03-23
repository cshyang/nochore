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
import { tasks, runs } from "@trigger.dev/sdk/v3";
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
import type { agentRunTask } from "../../../../services/worker/src/triggers/agent-run";

// ---------------------------------------------------------------------------
// createBlankAgent — create an untitled agent and return its id
// ---------------------------------------------------------------------------

export const createBlankAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const agentId = crypto.randomUUID().slice(0, 12);
    const { db } = getProjectDeps(projectId);
    const now = Date.now();
    const config = {
      name: "Untitled Agent",
      description: "",
      intent: "",
      skills: [],
      triggers: [],
      policyRules: [],
      globalApprovalRequired: false,
      scopeStrategy: "llm",
    };
    db.insert(agents)
      .values({
        id: agentId,
        projectId,
        config: JSON.stringify(config),
        status: "live",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return jsonSafe({ id: agentId });
  });

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
        status: "live",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Initialize workspace
    await initializeWorkspace(workspacePath, data.name, data.intent);

    return jsonSafe({ id: agentId });
  });

// ---------------------------------------------------------------------------
// createDraftAgent — create an agent in draft status (from blueprint)
// ---------------------------------------------------------------------------

export const createDraftAgent = createServerFn({ method: "POST" })
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

    const { db } = getProjectDeps(data.projectId);
    const now = Date.now();
    db.insert(agents)
      .values({
        id: agentId,
        projectId: data.projectId,
        config: JSON.stringify(config),
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Initialize workspace (even for drafts — needed for workspace files)
    await initializeWorkspace(workspacePath, data.name, data.intent);

    return jsonSafe({ id: agentId });
  });

// ---------------------------------------------------------------------------
// updateDraftAgent — save blueprint edits to an existing draft
// ---------------------------------------------------------------------------

export const updateDraftAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      agentId: string;
      projectId: string;
      name?: string;
      description?: string;
      skills?: string[];
      policyRules?: string[];
      globalApprovalRequired?: boolean;
      schedule?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const row = db.select().from(agents).where(eq(agents.id, data.agentId)).get();
    if (!row) throw new Error("Agent not found");

    const config = JSON.parse(row.config) as AgentConfig;

    // Apply partial updates
    if (data.name !== undefined) config.name = data.name;
    if (data.description !== undefined) config.description = data.description;
    if (data.skills !== undefined) config.skills = data.skills;
    if (data.policyRules !== undefined) config.policyRules = data.policyRules;
    if (data.globalApprovalRequired !== undefined) config.globalApprovalRequired = data.globalApprovalRequired;
    if (data.schedule !== undefined) {
      const cronMap: Record<string, string> = {
        hourly: "0 * * * *", "6hours": "0 */6 * * *",
        daily: "0 9 * * *", weekly: "0 9 * * 1", manual: "",
      };
      const cronExpr = cronMap[data.schedule] ?? "0 9 * * *";
      config.triggers = cronExpr
        ? [{ type: "cron", config: { cron: cronExpr } }]
        : [{ type: "manual", config: {} }];
    }

    db.update(agents)
      .set({ config: JSON.stringify(config), updatedAt: Date.now() })
      .where(eq(agents.id, data.agentId))
      .run();

    return jsonSafe({ updated: true });
  });

// ---------------------------------------------------------------------------
// launchAgent — transition draft → live
// ---------------------------------------------------------------------------

export const launchAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { agentId: string; projectId: string }) => input,
  )
  .handler(async ({ data: { agentId, projectId } }) => {
    const { db } = getProjectDeps(projectId);

    db.update(agents)
      .set({ status: "live", updatedAt: Date.now() })
      .where(eq(agents.id, agentId))
      .run();

    // Trigger first run via trigger.dev and wait for completion
    const handle = await tasks.trigger<typeof agentRunTask>("agent-run", {
      agentId,
      projectId,
      trigger: { type: "manual", metadata: { source: "launch" } },
    });

    const completed = await runs.poll(handle, { pollIntervalMs: 1000 });

    return jsonSafe({ launched: true, runId: handle.id, ok: completed.isSuccess });
  });

// ---------------------------------------------------------------------------
// triggerManualRun — kick off a pipeline run for an agent on demand
// ---------------------------------------------------------------------------

export const triggerManualRun = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { agentId: string; projectId: string }) => input,
  )
  .handler(async ({ data: { agentId, projectId } }) => {
    const handle = await tasks.trigger<typeof agentRunTask>("agent-run", {
      agentId,
      projectId,
      trigger: { type: "manual", metadata: { source: "run_now" } },
    });

    // Wait for the pipeline to complete before returning
    const completed = await runs.poll(handle, { pollIntervalMs: 1000 });

    return jsonSafe({
      triggered: true,
      runId: handle.id,
      status: completed.status,
      ok: completed.isSuccess,
    });
  });

// ---------------------------------------------------------------------------
// updateAgentConfig — save blueprint results to an existing agent
// ---------------------------------------------------------------------------

export const updateAgentConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      agentId: string;
      projectId: string;
      name?: string;
      description?: string;
      skills?: string[];
      policyRules?: string[];
      globalApprovalRequired?: boolean;
      schedule?: string;
      connections?: Array<{ provider: string; reason: string }>;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const row = db.select().from(agents).where(eq(agents.id, data.agentId)).get();
    if (!row) throw new Error("Agent not found");

    const config = JSON.parse(row.config) as AgentConfig & { connections?: Array<{ provider: string; reason: string }> };
    if (data.name !== undefined) config.name = data.name;
    if (data.description !== undefined) config.description = data.description;
    if (data.skills !== undefined) config.skills = data.skills;
    if (data.policyRules !== undefined) config.policyRules = data.policyRules;
    if (data.globalApprovalRequired !== undefined) config.globalApprovalRequired = data.globalApprovalRequired;
    if (data.connections !== undefined) config.connections = data.connections;
    if (data.schedule !== undefined) {
      config.triggers = data.schedule === "manual"
        ? [{ type: "manual", config: {} }]
        : [{ type: "cron", config: { cron: scheduleToCron(data.schedule) } }];
    }

    db.update(agents)
      .set({ config: JSON.stringify(config), updatedAt: Date.now() })
      .where(eq(agents.id, data.agentId))
      .run();

    return jsonSafe({ updated: true });
  });

function scheduleToCron(schedule: string): string {
  switch (schedule) {
    case "hourly": return "0 */1 * * *";
    case "6hours": return "0 */6 * * *";
    case "daily": return "0 9 * * *";
    case "weekly": return "0 9 * * 1";
    default: return "0 9 * * *";
  }
}

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
