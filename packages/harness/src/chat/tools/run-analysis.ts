import { tool } from "ai";
import { z } from "zod";
import type { TriggerEvent, RunResult } from "../../types/run";
import type { AgentConfig } from "../../types/agent-config";
import type { PipelineDependencies } from "../../pipeline/runner";

export interface RunAnalysisDeps {
  runPipeline: (params: {
    agentId: string;
    trigger: TriggerEvent;
    config: AgentConfig;
    deps: PipelineDependencies;
  }) => Promise<RunResult>;
  pipelineDeps: PipelineDependencies;
  config: AgentConfig;
  agentId: string;
}

export function createRunAnalysisTool(deps: RunAnalysisDeps) {
  return tool({
    description:
      "Run the agent analysis pipeline on demand. Returns a summary of the run including proposals found, steps executed, and duration.",
    parameters: z.object({
      scope: z
        .string()
        .optional()
        .describe(
          "Optional scope to narrow analysis (e.g., a specific skill id)"
        ),
    }),
    execute: async ({ scope }) => {
      const trigger: TriggerEvent = {
        type: "chat",
        timestamp: new Date(),
        ...(scope ? { metadata: { scope } } : {}),
      };

      const result = await deps.runPipeline({
        agentId: deps.agentId,
        trigger,
        config: deps.config,
        deps: deps.pipelineDeps,
      });

      return {
        runId: result.runId,
        duration: result.duration,
        proposalCount: result.proposals.length,
        eventsLogged: result.eventsLogged,
        steps: result.steps.map((s) => ({
          step: s.step,
          duration: s.duration,
        })),
      };
    },
  });
}
