import { generateText, Output, jsonSchema } from "ai";
import type { ActionProposal } from "../../types/action";
import type { StepOutput, LlmUsage } from "../../types/run";
import type { AssembledContext } from "../../context/assembler";
import { createModel } from "../../skills/executor";

// ---------------------------------------------------------------------------
// JSON Schema for the planning LLM's structured output
// ---------------------------------------------------------------------------

const PROPOSALS_SCHEMA = {
  type: "object",
  properties: {
    proposals: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: { type: "string" },
          toolCategory: { type: "string" },
          args: { type: "object" },
          reason: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          skillSource: { type: "string" },
          reversible: { type: "boolean" },
        },
        required: [
          "action",
          "toolCategory",
          "args",
          "reason",
          "confidence",
          "skillSource",
          "reversible",
        ],
      },
    },
  },
  required: ["proposals"],
} as const;

// ---------------------------------------------------------------------------
// SkillOutput shape coming from the pipeline
// ---------------------------------------------------------------------------

interface SkillOutput {
  skillId: string;
  result: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// planActions — pipeline step 5: decide what actions to propose
// ---------------------------------------------------------------------------

/**
 * Takes successful skill outputs and uses an LLM to propose concrete actions.
 *
 * - Filters out errored skill outputs (only passes successful ones to the LLM)
 * - If no successful outputs exist, returns empty proposals without calling LLM
 * - Ensures every proposal has an id and an idempotencyKey
 */
export async function planActions(params: {
  skillOutputs: SkillOutput[];
  context: AssembledContext;
  model?: string;
}): Promise<{ proposals: ActionProposal[]; stepOutput: StepOutput }> {
  const start = performance.now();

  // Filter to only successful skill outputs
  const successfulOutputs = params.skillOutputs.filter((o) => !o.error);

  // No successful outputs → no proposals, no LLM call
  if (successfulOutputs.length === 0) {
    return {
      proposals: [],
      stepOutput: {
        step: "plan",
        duration: performance.now() - start,
        data: { proposalCount: 0 },
      },
    };
  }

  // Call AI SDK generateObject to produce proposals
  const model = createModel(params.model);

  const result = await generateText({
    model,
    system: params.context.systemPrompt,
    prompt: JSON.stringify({ skillOutputs: successfulOutputs }),
    output: Output.object({ schema: jsonSchema(PROPOSALS_SCHEMA) }),
  });

  const raw = result.output as {
    proposals: Array<Partial<ActionProposal>>;
  } | undefined;

  // If LLM output is undefined (e.g., model doesn't support structured output),
  // return empty proposals
  if (!raw?.proposals) {
    const duration = performance.now() - start;
    return {
      proposals: [],
      stepOutput: {
        step: "plan" as const,
        duration,
        data: { proposalCount: 0, note: "LLM returned no structured output" },
      },
    };
  }

  // Post-process: ensure every proposal has id and idempotencyKey
  const proposals: ActionProposal[] = raw.proposals.map((p) => ({
    ...p,
    id: p.id || crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  })) as ActionProposal[];

  // Build LLM usage if available
  const usage = result.usage;

  let llmUsage: LlmUsage | undefined;
  if (usage) {
    llmUsage = {
      inputTokens: usage.promptTokens ?? 0,
      outputTokens: usage.completionTokens ?? 0,
      cost: 0, // Cost calculation is a future concern
    };
  }

  return {
    proposals,
    stepOutput: {
      step: "plan",
      duration: performance.now() - start,
      data: { proposalCount: proposals.length },
      llmUsage,
    },
  };
}
