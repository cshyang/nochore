import { SkillDefinitionSchema, type SkillDefinition } from "../types/skill";
import type { AgentConfig } from "../types/agent-config";

// ---------------------------------------------------------------------------
// SkillRegistry — simple Map-based registry for skill definitions
// ---------------------------------------------------------------------------

export class SkillRegistry {
  private skills = new Map<string, SkillDefinition>();

  /**
   * Register a skill definition. Validates the serializable portion via
   * SkillDefinitionSchema and stores the full definition (including compute).
   *
   * @throws if validation fails or a skill with the same id is already registered
   */
  register(skill: SkillDefinition): void {
    // Validate the serializable portion of the definition
    SkillDefinitionSchema.parse({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      consumes: skill.consumes,
      outputSchema: skill.outputSchema,
      systemPrompt: skill.systemPrompt,
      hasDeterministicCompute: skill.compute != null ? true : undefined,
      knowledgeKey: skill.knowledgeKey,
    });

    if (this.skills.has(skill.id)) {
      throw new Error(`Skill "${skill.id}" is already registered`);
    }

    this.skills.set(skill.id, skill);
  }

  /**
   * Look up a skill by id.
   *
   * @throws if the skill is not found
   */
  get(id: string): SkillDefinition {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new Error(`Skill "${id}" not found in registry`);
    }
    return skill;
  }

  /**
   * Return all registered skills.
   */
  list(): SkillDefinition[] {
    return Array.from(this.skills.values());
  }

  /**
   * Return skills matching the agent config's skill ids, in the order
   * specified by the config.
   *
   * @throws if any skill id in the config is not found in the registry
   */
  getForAgent(config: AgentConfig): SkillDefinition[] {
    return config.skills.map((id) => this.get(id));
  }
}
