import type { StepOutput } from "../../types/run";
import type { SkillRegistry } from "../../skills/registry";
import { executeSkill } from "../../skills/executor";

// ---------------------------------------------------------------------------
// SkillOutput — result of executing a single skill
// ---------------------------------------------------------------------------

export interface SkillOutput {
  skillId: string;
  result: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// analyzeSkills — execute all selected skills against fetched data
// ---------------------------------------------------------------------------

export async function analyzeSkills(params: {
  skillIds: string[];
  data: Record<string, unknown>;
  skillRegistry: SkillRegistry;
  skillKnowledge: Record<string, string>;
  model?: string;
}): Promise<{ outputs: SkillOutput[]; stepOutput: StepOutput }> {
  const start = performance.now();
  const { skillIds, data, skillRegistry, skillKnowledge, model } = params;

  // Build per-skill execution tasks
  const tasks = skillIds.map((skillId) => {
    const skill = skillRegistry.get(skillId);

    // Extract only the data keys this skill consumes
    const relevantData: Record<string, unknown> = {};
    for (const key of skill.consumes) {
      if (key in data) {
        relevantData[key] = data[key];
      }
    }

    // Look up knowledge if the skill has a knowledgeKey
    const knowledge = skill.knowledgeKey
      ? skillKnowledge[skill.knowledgeKey]
      : undefined;

    return { skillId, skill, relevantData, knowledge };
  });

  // Run all skills in parallel
  const results = await Promise.allSettled(
    tasks.map(async ({ skillId, skill, relevantData, knowledge }) => {
      const result = await executeSkill(skill, relevantData, {
        knowledge,
        model,
      });
      return { skillId, result } as SkillOutput;
    }),
  );

  // Process results
  const outputs: SkillOutput[] = [];
  let succeeded = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      outputs.push(result.value);
      succeeded++;
    } else {
      const reason = result.reason as Error;
      // Find the corresponding skillId from the task order
      const taskIndex = results.indexOf(result);
      const skillId = tasks[taskIndex]!.skillId;
      outputs.push({
        skillId,
        result: null,
        error: reason.message,
      });
      failed++;
    }
  }

  const duration = performance.now() - start;

  return {
    outputs,
    stepOutput: {
      step: "analyze",
      duration,
      data: {
        total: skillIds.length,
        succeeded,
        failed,
      },
    },
  };
}
