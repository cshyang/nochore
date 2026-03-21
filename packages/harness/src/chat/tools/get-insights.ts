import { tool } from "ai";
import { z } from "zod";
import type { MemoryStore } from "../../types/memory";

export interface GetInsightsDeps {
  memoryStore: MemoryStore;
  agentId: string;
}

export function createGetInsightsTool(deps: GetInsightsDeps) {
  return tool({
    description:
      "Retrieve recent skill analysis insights. Returns skill_output events which contain findings and analysis results from agent runs.",
    parameters: z.object({
      limit: z
        .number()
        .optional()
        .describe("Max number of insights to return (default: all)"),
    }),
    execute: async ({ limit }) => {
      const events = await deps.memoryStore.queryEvents({
        agentId: deps.agentId,
        type: "skill_output",
        ...(limit ? { limit } : {}),
      });

      const insights = events.map((e) => ({
        id: e.id,
        runId: e.runId,
        timestamp: e.timestamp,
        type: e.type,
        data: e.data,
      }));

      return { insights };
    },
  });
}
