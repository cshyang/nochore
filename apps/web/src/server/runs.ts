/**
 * Run history server functions.
 *
 * Delegates to RunRepository for querying agent run history.
 */

import { createServerFn } from "@tanstack/react-start";
import { getProjectDeps } from "./deps";
import { jsonSafe } from "./serializable";

// ---------------------------------------------------------------------------
// getRunHistory — recent runs for an agent
// ---------------------------------------------------------------------------

export const getRunHistory = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { agentId: string; projectId: string; limit?: number }) => input,
  )
  .handler(async ({ data: { agentId, projectId, limit } }) => {
    const { runRepository } = getProjectDeps(projectId);
    const runs = await runRepository.getByAgent(agentId, limit ?? 20);
    return jsonSafe(runs);
  });

// ---------------------------------------------------------------------------
// getRun — single run by id
// ---------------------------------------------------------------------------

export const getRun = createServerFn({ method: "GET" })
  .inputValidator((input: { runId: string; projectId: string }) => input)
  .handler(async ({ data: { runId, projectId } }) => {
    const { runRepository } = getProjectDeps(projectId);
    const run = await runRepository.getById(runId);
    return jsonSafe(run);
  });
