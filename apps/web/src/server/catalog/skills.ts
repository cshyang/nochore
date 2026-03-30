import { createServerFn } from "@tanstack/react-start";
import { getSkillDefinitionById, listSkillDefinitions } from "../../../../../packages/harness/src/catalog";
import { jsonSafe } from "../serializable";

export const listSkills = createServerFn({ method: "GET" }).handler(async () => {
  return jsonSafe(listSkillDefinitions({ productOnly: false }));
});

export const getSkill = createServerFn({ method: "GET" })
  .inputValidator((input: { skillId: string }) => input)
  .handler(async ({ data: { skillId } }) => {
    return jsonSafe(getSkillDefinitionById(skillId, { productOnly: false }));
  });
