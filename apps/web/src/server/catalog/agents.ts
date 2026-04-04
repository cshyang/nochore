import { getAgentDefinitionById, listAgentDefinitions } from "@nochore/harness";
import { createServerFn } from "@tanstack/react-start";
import { jsonSafe } from "../serializable";

export const listAgents = createServerFn({ method: "GET" }).handler(async () => {
  return jsonSafe(listAgentDefinitions());
});

export const getAgent = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string }) => input)
  .handler(async ({ data: { agentId } }) => {
    return jsonSafe(getAgentDefinitionById(agentId));
  });
