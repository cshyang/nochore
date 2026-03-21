import { tool } from "ai";
import { z } from "zod";
import type { MemoryStore } from "../../types/memory";

export interface ExplainDecisionDeps {
  memoryStore: MemoryStore;
  agentId: string;
}

export function createExplainDecisionTool(deps: ExplainDecisionDeps) {
  return tool({
    description:
      "Explain why the agent made certain decisions. Returns policy decisions, action proposals, and execution results, optionally filtered by a specific run.",
    parameters: z.object({
      runId: z
        .string()
        .optional()
        .describe("Optional run ID to filter decisions to a specific run"),
    }),
    execute: async ({ runId }) => {
      const events = await deps.memoryStore.queryEvents({
        agentId: deps.agentId,
        type: ["policy_decision", "action_proposed", "action_executed"],
        ...(runId ? { runId } : {}),
      });

      const decisions = events.map((e) => ({
        id: e.id,
        runId: e.runId,
        timestamp: e.timestamp,
        type: e.type,
        data: e.data,
      }));

      return { decisions };
    },
  });
}
