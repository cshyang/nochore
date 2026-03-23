import { generateText, Output, jsonSchema } from "ai";
import type { LanguageModelV1 } from "ai";
import type { SkillDefinition, SkillData } from "../types/skill";

// ---------------------------------------------------------------------------
// createModel — configurable LLM provider
// ---------------------------------------------------------------------------

/**
 * Create an AI SDK model from environment configuration.
 *
 * Supports multiple providers via LLM_PROVIDER env var:
 * - "zai" → Zai GLM (bigmodel.cn), model default: "glm-4"
 * - "anthropic" → Anthropic Claude (default), model default: "claude-sonnet-4-20250514"
 * - "openai" → OpenAI GPT, model default: "gpt-4o"
 *
 * Any OpenAI-compatible endpoint can be used by setting:
 *   LLM_PROVIDER=custom
 *   LLM_BASE_URL=https://your-api.example.com/v1
 *   LLM_API_KEY=your-key
 *   LLM_MODEL=model-name
 */
export function createModel(modelOverride?: string): LanguageModelV1 {
  const provider = process.env.LLM_PROVIDER ?? "anthropic";

  switch (provider) {
    case "zai": {
      const { createOpenAICompatible } = require("@ai-sdk/openai-compatible");
      const zai = createOpenAICompatible({
        name: "zai",
        baseURL: process.env.LLM_BASE_URL ?? "https://open.bigmodel.cn/api/paas/v4",
        apiKey: process.env.ZAI_API_KEY,
      });
      return zai(modelOverride ?? process.env.LLM_MODEL ?? "glm-4.7");
    }

    case "openai": {
      const { createOpenAICompatible } = require("@ai-sdk/openai-compatible");
      const openai = createOpenAICompatible({
        name: "openai",
        baseURL: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: process.env.OPENAI_API_KEY ?? process.env.LLM_API_KEY,
      });
      return openai(modelOverride ?? process.env.LLM_MODEL ?? "gpt-4o");
    }

    case "custom": {
      const { createOpenAICompatible } = require("@ai-sdk/openai-compatible");
      const custom = createOpenAICompatible({
        name: "custom",
        baseURL: process.env.LLM_BASE_URL!,
        apiKey: process.env.LLM_API_KEY,
      });
      return custom(modelOverride ?? process.env.LLM_MODEL ?? "default");
    }

    case "anthropic":
    default: {
      const { createAnthropic } = require("@ai-sdk/anthropic");
      const anthropic = createAnthropic();
      return anthropic(modelOverride ?? process.env.LLM_MODEL ?? "claude-sonnet-4-20250514");
    }
  }
}

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

    const model = createModel(options?.model);

    const result = await generateText({
      model,
      system: systemPrompt,
      prompt: JSON.stringify(data),
      output: Output.object({ schema: jsonSchema(skill.outputSchema) }),
    });

    if (result.output === undefined) {
      throw new Error(
        `Skill "${skill.id}" LLM returned no structured output — model may not support JSON schema`,
      );
    }

    return result.output;
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
