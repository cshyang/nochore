import { createServerFn } from "@tanstack/react-start";
import { getProjectDeps } from "./deps";
import { buildSerializedRun } from "./models";
import { jsonSafe } from "./serializable";

export const getRunHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string; limit?: number }) => input)
  .handler(async ({ data: { agentId, projectId, limit } }) => {
    const { runRepository, runEventRepository } = getProjectDeps(projectId);
    const runs = await runRepository.getByAgent(agentId, limit ?? 20);

    const result = await Promise.all(
      runs.map(async (run) =>
        buildSerializedRun(
          run,
          await runEventRepository.listByRun(run.id),
          [],
        ),
      ),
    );

    return jsonSafe(result);
  });

export const getRun = createServerFn({ method: "GET" })
  .inputValidator((input: { runId: string; projectId: string }) => input)
  .handler(async ({ data: { runId, projectId } }) => {
    const { runRepository, runEventRepository } = getProjectDeps(projectId);
    const run = await runRepository.getById(runId);
    if (!run) {
      return jsonSafe(null);
    }

    return jsonSafe(
      buildSerializedRun(
        run,
        await runEventRepository.listByRun(run.id),
        [],
      ),
    );
  });
