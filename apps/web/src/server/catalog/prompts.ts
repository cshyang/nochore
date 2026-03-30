import { createServerFn } from "@tanstack/react-start";
import { getPromptDefinitionById, listPromptDefinitions } from "../../../../../packages/harness/src/catalog";
import { jsonSafe } from "../serializable";

export const listPrompts = createServerFn({ method: "GET" }).handler(async () => {
  return jsonSafe(listPromptDefinitions());
});

export const getPrompt = createServerFn({ method: "GET" })
  .inputValidator((input: { promptId: string }) => input)
  .handler(async ({ data: { promptId } }) => {
    return jsonSafe(getPromptDefinitionById(promptId));
  });
