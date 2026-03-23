import { generateText, Output, jsonSchema } from "ai";
import type { AgentConfig } from "../../types/agent-config";
import type { TriggerEvent, StepOutput } from "../../types/run";
import type { AssembledContext } from "../../context/assembler";
import type { SkillRegistry } from "../../skills/registry";
import { createModel } from "../../skills/executor";

export async function resolveScope(params: {
  config: AgentConfig;
  trigger: TriggerEvent;
  context: AssembledContext;
  skillRegistry: SkillRegistry;
}): Promise<{ skillIds: string[]; stepOutput: StepOutput }> {
  const start = performance.now();
  const { config, trigger, context, skillRegistry } = params;

  // Priority 1: trigger-level skills override
  const triggerSkills = trigger.metadata?.skills as string[] | undefined;
  if (Array.isArray(triggerSkills) && triggerSkills.length > 0) {
    const duration = performance.now() - start;
    return {
      skillIds: triggerSkills,
      stepOutput: {
        step: "scope",
        duration,
        data: { skillIds: triggerSkills, strategy: "override" },
      },
    };
  }

  // Priority 2: static strategy — return config.skills as-is
  if (config.scopeStrategy === "static") {
    const duration = performance.now() - start;
    return {
      skillIds: config.skills,
      stepOutput: {
        step: "scope",
        duration,
        data: { skillIds: config.skills, strategy: "static" },
      },
    };
  }

  // Priority 3: LLM-based scope resolution
  const model = createModel(config.model);

  const result = await generateText({
    model,
    system: context.systemPrompt,
    prompt: JSON.stringify({
      availableSkills: config.skills,
      triggerType: trigger.type,
      triggerMetadata: trigger.metadata,
    }),
    output: Output.object({
      schema: jsonSchema({
        type: "object",
        properties: {
          selectedSkills: { type: "array", items: { type: "string" } },
          reasoning: { type: "string" },
        },
        required: ["selectedSkills", "reasoning"],
      }),
    }),
  });

  const llmResult = result.output as {
    selectedSkills: string[];
    reasoning: string;
  } | undefined;

  // If LLM output is undefined (e.g., model doesn't support structured output),
  // fall back to running all configured skills
  if (!llmResult?.selectedSkills) {
    const duration = performance.now() - start;
    return {
      skillIds: config.skills,
      stepOutput: {
        step: "scope" as const,
        duration,
        data: { strategy: "llm-fallback", selectedSkills: config.skills },
      },
    };
  }

  // Validate: filter out any skill IDs that don't exist in the registry
  const validSkillIds = llmResult.selectedSkills.filter((id) => {
    try {
      skillRegistry.get(id);
      return true;
    } catch {
      return false;
    }
  });

  const duration = performance.now() - start;

  // Extract LLM usage
  const usage = result.usage;
  const llmUsage = usage
    ? {
        inputTokens: usage.promptTokens ?? 0,
        outputTokens: usage.completionTokens ?? 0,
        cost: 0,
      }
    : undefined;

  return {
    skillIds: validSkillIds,
    stepOutput: {
      step: "scope",
      duration,
      data: { skillIds: validSkillIds, strategy: "llm" },
      llmUsage,
    },
  };
}
