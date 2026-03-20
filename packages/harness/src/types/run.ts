import { z } from "zod";
import type { AgentConfig } from "./agent-config";
import type { MemoryStore } from "./memory";

// ---------------------------------------------------------------------------
// TriggerEvent — the event that initiated a run
// ---------------------------------------------------------------------------

export const TriggerEventSchema = z.object({
  type: z.enum(["cron", "webhook", "manual", "chat"]),
  timestamp: z.date(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type TriggerEvent = z.infer<typeof TriggerEventSchema>;

// ---------------------------------------------------------------------------
// StepOutput — result of a single pipeline step
// ---------------------------------------------------------------------------

export const LlmUsageSchema = z.object({
  inputTokens: z.number(),
  outputTokens: z.number(),
  cost: z.number(),
});

export type LlmUsage = z.infer<typeof LlmUsageSchema>;

export const StepOutputSchema = z.object({
  step: z.enum([
    "scope",
    "fetch",
    "analyze",
    "plan",
    "policy",
    "execute",
    "memory",
  ]),
  duration: z.number(),
  data: z.unknown(),
  llmUsage: LlmUsageSchema.optional(),
});

export type StepOutput = z.infer<typeof StepOutputSchema>;

// ---------------------------------------------------------------------------
// ActionProposal placeholder
//
// Task 2 (action.ts) is being built in parallel. Once it lands we will
// import ActionProposalSchema from there. Until then, use a permissive
// passthrough so RunResult can validate without blocking.
// ---------------------------------------------------------------------------

const ActionProposalPlaceholder = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// RunResult — outcome of a completed agent run
// ---------------------------------------------------------------------------

export const RunResultSchema = z.object({
  runId: z.string(),
  agentId: z.string(),
  duration: z.number(),
  steps: z.array(StepOutputSchema),
  proposals: z.array(ActionProposalPlaceholder),
  eventsLogged: z.number(),
});

export type RunResult = z.infer<typeof RunResultSchema>;

// ---------------------------------------------------------------------------
// RunContext — runtime context passed into the pipeline (not a Zod schema)
// ---------------------------------------------------------------------------

export interface RunContext {
  runId: string;
  agentId: string;
  config: AgentConfig;
  trigger: TriggerEvent;
  memory: MemoryStore;
  startedAt: Date;
}
