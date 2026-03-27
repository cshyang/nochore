import { createServerFn } from "@tanstack/react-start";
import { listPromptSkills } from "../../../../packages/harness/src/skills";
import { jsonSafe } from "./serializable";

export const listAvailableSkills = createServerFn({ method: "GET" }).handler(async () => {
  return jsonSafe(listPromptSkills());
});

