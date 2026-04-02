import { createServerFn } from "@tanstack/react-start";
import { jsonSafe } from "./serializable";

export const getAgentActivityState = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data }) => {
    const { loadAgentActivityState } = await import("./activity-core");
    return jsonSafe(await loadAgentActivityState(data.projectId, data.agentId));
  });

export const getProjectActivityState = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data }) => {
    const { loadProjectActivityState } = await import("./activity-core");
    return jsonSafe(await loadProjectActivityState(data.projectId));
  });
