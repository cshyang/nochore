import { getSkillDefinitionById, listSkillDefinitions } from "../catalog";

export interface PromptSkill {
  id: string;
  name: string;
  description: string;
  path: string;
  knowledgeFiles: string[];
  instructions: string;
  product: boolean;
}

export function listPromptSkills(options?: { rootDir?: string; productOnly?: boolean }): PromptSkill[] {
  return listSkillDefinitions(options);
}

export function getPromptSkillById(
  skillId: string,
  options?: { rootDir?: string; productOnly?: boolean },
): PromptSkill | null {
  return getSkillDefinitionById(skillId, options);
}
