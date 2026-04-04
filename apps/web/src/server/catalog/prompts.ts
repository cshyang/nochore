import { getPromptDefinitionById, listPromptDefinitions } from "@nochore/harness";
import { createServerFn } from "@tanstack/react-start";
import { jsonSafe } from "../serializable";

export const listPrompts = createServerFn({ method: "GET" }).handler(async () => {
  return jsonSafe(listPromptDefinitions());
});

export const getPrompt = createServerFn({ method: "GET" })
  .inputValidator((input: { promptId: string }) => input)
  .handler(async ({ data: { promptId } }) => {
    return jsonSafe(getPromptDefinitionById(promptId));
  });
