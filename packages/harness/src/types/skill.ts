import { z } from "zod";

// ---------------------------------------------------------------------------
// SkillDefinition — declares a skill's identity, data needs, and execution mode
// ---------------------------------------------------------------------------

/**
 * Zod schema for validating skill definitions at runtime.
 *
 * A skill can be LLM-powered (has systemPrompt) or deterministic
 * (has hasDeterministicCompute=true, with actual compute function provided
 * separately since functions cannot be serialized in a Zod schema).
 *
 * The outputSchema field describes the expected shape of the skill's output
 * as a JSON Schema object (not a Zod schema) for serialization purposes.
 */
export const SkillDefinitionSchema = z.object({
  /** Unique skill identifier */
  id: z.string().min(1),
  /** Human-readable skill name */
  name: z.string().min(1),
  /** What this skill does */
  description: z.string().min(1),
  /** Data type IDs this skill requires as input */
  consumes: z.array(z.string()),
  /** JSON Schema describing the expected output shape */
  outputSchema: z.record(z.string(), z.unknown()),
  /** System prompt for LLM-powered skills */
  systemPrompt: z.string().optional(),
  /** Whether this skill has a deterministic compute function (provided at registration) */
  hasDeterministicCompute: z.boolean().optional(),
  /** Key for looking up client-specific domain knowledge */
  knowledgeKey: z.string().optional(),
});

export type SkillDefinitionData = z.infer<typeof SkillDefinitionSchema>;

// ---------------------------------------------------------------------------
// SkillData — the data bag passed to a skill's compute function
// ---------------------------------------------------------------------------

export type SkillData = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Full SkillDefinition interface — includes the compute function
// ---------------------------------------------------------------------------

/**
 * Complete skill definition including the optional compute function.
 * Use SkillDefinitionSchema for serialization/validation of the data portion,
 * and this interface for runtime registration.
 */
export interface SkillDefinition<TOutput = unknown> {
  id: string;
  name: string;
  description: string;
  consumes: string[];
  outputSchema: Record<string, unknown>;
  systemPrompt?: string;
  compute?: (data: SkillData, knowledge?: string) => TOutput | Promise<TOutput>;
  knowledgeKey?: string;
}
