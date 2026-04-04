import { listSkillDefinitions } from "@nochore/harness";
import { createServerFn } from "@tanstack/react-start";
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
