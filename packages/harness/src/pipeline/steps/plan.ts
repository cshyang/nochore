import { generateObject, jsonSchema } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ActionProposal } from "../../types/action";
import type { StepOutput, LlmUsage } from "../../types/run";
import type { AssembledContext } from "../../context/assembler";

// ---------------------------------------------------------------------------
// Default model for the planning step
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "claude-sonnet-4-20250514";

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
  const anthropic = createAnthropic();
  const modelId = params.model ?? DEFAULT_MODEL;

  const result = await generateObject({
    model: anthropic(modelId),
    system: params.context.systemPrompt,
    prompt: JSON.stringify({ skillOutputs: successfulOutputs }),
    schema: jsonSchema(PROPOSALS_SCHEMA),
  });

  const raw = (result as any).object as {
    proposals: Array<Partial<ActionProposal>>;
  };

  // Post-process: ensure every proposal has id and idempotencyKey
  const proposals: ActionProposal[] = raw.proposals.map((p) => ({
    ...p,
    id: p.id || crypto.randomUUID(),
    idempotencyKey: crypto.randomUUID(),
  })) as ActionProposal[];

  // Build LLM usage if available
  const usage = (result as any).usage as
    | { promptTokens?: number; completionTokens?: number }
    | undefined;

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
