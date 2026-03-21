import type { StepOutput } from "../../types/run";
import type { SkillRegistry } from "../../skills/registry";
import type { ConnectionManager } from "../../connections/types";

// ---------------------------------------------------------------------------
// fetchData — collect data from external sources for the selected skills
// ---------------------------------------------------------------------------

export async function fetchData(params: {
  skillIds: string[];
  skillRegistry: SkillRegistry;
  connectionManager: ConnectionManager;
}): Promise<{ data: Record<string, unknown>; stepOutput: StepOutput }> {
  const start = performance.now();
  const { skillIds, skillRegistry, connectionManager } = params;

  // Collect all consumes arrays from selected skills and deduplicate
  const allDataTypes = new Set<string>();
  for (const skillId of skillIds) {
    const skill = skillRegistry.get(skillId);
    for (const dataType of skill.consumes) {
      allDataTypes.add(dataType);
    }
  }

  // Filter to only available data types
  const available = new Set(connectionManager.availableDataTypes());
  const dataTypeIds = [...allDataTypes].filter((id) => available.has(id));

  // Fetch all in parallel
  const results = await Promise.allSettled(
    dataTypeIds.map(async (id) => ({ id, value: await connectionManager.fetch(id) })),
  );

  const data: Record<string, unknown> = {};
  let fetched = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      data[result.value.id] = result.value.value;
      fetched++;
    } else {
      failed++;
      // Log warning but continue with partial data
      console.warn(
        `[fetch] Failed to fetch data type: ${result.reason?.message ?? result.reason}`,
      );
    }
  }

  const duration = performance.now() - start;

  return {
    data,
    stepOutput: {
      step: "fetch",
      duration,
      data: {
        requested: dataTypeIds.length,
        fetched,
        failed,
      },
    },
  };
}
