import { createServerFn } from "@tanstack/react-start";
import { listSkillDefinitions } from "../../../../packages/harness/src/catalog";
import { jsonSafe } from "./serializable";

export const listAvailableSkills = createServerFn({ method: "GET" }).handler(async () => {
  return jsonSafe(
    listSkillDefinitions().map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
    })),
  );
});
