import { generateObject, jsonSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { SkillDefinition, SkillData } from "../types/skill";

// ---------------------------------------------------------------------------
// Default model for LLM-powered skills
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

// ---------------------------------------------------------------------------
// executeSkill — runs a skill via deterministic compute or LLM
// ---------------------------------------------------------------------------

/**
 * Execute a skill against the provided data.
 *
 * - **Deterministic path**: if the skill has a `compute` function, call it
 *   directly and optionally validate the result against `outputSchema`
 *   (when the schema is a Zod schema with a `parse` method).
 *
 * - **LLM path**: if the skill has a `systemPrompt`, use Vercel AI SDK's
 *   `generateObject` to produce structured output from the skill's prompt
 *   and the input data.
 *
 * Deterministic compute is always preferred when both paths are available.
 *
 * @throws if the skill has neither `compute` nor `systemPrompt`
 * @throws if deterministic output fails Zod validation
 */
export async function executeSkill(
  skill: SkillDefinition,
  data: SkillData,
  options?: {
    knowledge?: string;
    model?: string;
  },
): Promise<unknown> {
  // Path 1: Deterministic
  if (skill.compute) {
    const result = await skill.compute(data, options?.knowledge);

    // Validate against outputSchema if it's a Zod schema (has a parse method)
    if (isZodSchema(skill.outputSchema)) {
      (skill.outputSchema as { parse: (v: unknown) => unknown }).parse(result);
    }

    return result;
  }

  // Path 2: LLM-powered
  if (skill.systemPrompt) {
    const systemPrompt = options?.knowledge
      ? `${skill.systemPrompt}\n\nDomain knowledge:\n${options.knowledge}`
      : skill.systemPrompt;

    const anthropic = createAnthropic();
    const modelId = options?.model ?? DEFAULT_MODEL;

    const result = await generateObject({
      model: anthropic(modelId),
      system: systemPrompt,
      prompt: JSON.stringify(data),
      schema: jsonSchema(skill.outputSchema),
    });

    return result.object;
  }

  throw new Error(
    `Skill "${skill.id}" has neither compute nor systemPrompt`,
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Duck-type check for whether a value is a Zod schema (has _def and parse).
 */
function isZodSchema(value: unknown): boolean {
  return (
    value != null &&
    typeof value === "object" &&
    "parse" in (value as Record<string, unknown>) &&
    typeof (value as Record<string, unknown>).parse === "function"
  );
}
