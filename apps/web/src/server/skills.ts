/**
 * Skill server functions — exposes available skills from the harness registry.
 */

import { createServerFn } from "@tanstack/react-start";
import { SkillRegistry } from "../../../../packages/harness/src/skills/registry";
import { searchTermsSkill } from "../../../../packages/harness/src/skills/built-in/search-terms";
import { jsonSafe } from "./serializable";

// ---------------------------------------------------------------------------
// Shared registry instance — registers all built-in skills
// ---------------------------------------------------------------------------

function getRegistry(): SkillRegistry {
  const registry = new SkillRegistry();
  registry.register(searchTermsSkill);
  // TODO: register additional built-in skills as they're ported
  return registry;
}

// ---------------------------------------------------------------------------
// listAvailableSkills — all skills in the registry
// ---------------------------------------------------------------------------

export const listAvailableSkills = createServerFn({ method: "GET" }).handler(
  async () => {
    const registry = getRegistry();
    const skills = registry.list().map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      consumes: s.consumes,
      hasCompute: !!s.compute,
      hasSystemPrompt: !!s.systemPrompt,
    }));
    return jsonSafe(skills);
  },
);
