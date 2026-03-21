/**
 * Agent CRUD server functions.
 *
 * Provides list, get, and create operations for agents within a project.
 * DB queries are delegated to deps.ts helpers.
 */

import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { listAgentRows, getAgentRow, getProjectDeps } from "./deps";
import { agents } from "../../../../packages/harness/src/db/schema";
import { initializeWorkspace } from "../../../../packages/harness/src/workspace/templates";
import { jsonSafe } from "./serializable";
import type { AgentConfig } from "../../../../packages/harness/src/types/agent-config";

// ---------------------------------------------------------------------------
// listAgents — all agents for a project
// ---------------------------------------------------------------------------

export const listAgents = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    return jsonSafe(listAgentRows(projectId));
  });

// ---------------------------------------------------------------------------
// getAgent — single agent by id
// ---------------------------------------------------------------------------

export const getAgent = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    return jsonSafe(getAgentRow(projectId, agentId));
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
    }) => input,
  )
  .handler(async ({ data }) => {
    const agentId = crypto.randomUUID().slice(0, 8);
    const workspacePath = `data/projects/${data.projectId}/agents/${agentId}`;

    const config: AgentConfig = {
      id: agentId,
      projectId: data.projectId,
      name: data.name,
      description: data.description,
      intent: data.intent,
      workspacePath,
      skills: data.skills,
      skillKnowledge: {},
      triggers: [{ type: "cron", config: { cron: "0 9 * * *" } }],
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
    db.insert(agents)
      .values({
        id: agentId,
        projectId: data.projectId,
        config: JSON.stringify(config),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    // Initialize workspace
    await initializeWorkspace(workspacePath, data.name, data.intent);

    return jsonSafe(config);
  });
