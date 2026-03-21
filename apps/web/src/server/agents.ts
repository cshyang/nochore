/**
 * Agent CRUD server functions.
 *
 * Provides list and get operations for agents within a project.
 * DB queries are delegated to deps.ts helpers.
 */

import { createServerFn } from "@tanstack/react-start";
import { listAgentRows, getAgentRow } from "./deps";
import { jsonSafe } from "./serializable";

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
