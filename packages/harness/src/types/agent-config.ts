import { z } from "zod";
import {
  OperationalConstraintSchema,
  type OperationalConstraint,
} from "./policy";

// ---------------------------------------------------------------------------
// TriggerConfig — how / when an agent run is initiated
// ---------------------------------------------------------------------------

export const TriggerConfigSchema = z.object({
  type: z.enum(["cron", "webhook", "manual"]),
  config: z.record(z.string(), z.unknown()),
  /** Optional override of which skills run for this trigger. */
  skills: z.array(z.string()).optional(),
});

export type TriggerConfig = z.infer<typeof TriggerConfigSchema>;

// ---------------------------------------------------------------------------
// PolicyOverride — per-action decision overrides
// ---------------------------------------------------------------------------

export const PolicyOverrideSchema = z.object({
  pattern: z.string(),
  decision: z.enum(["always_approve", "always_ask", "always_block"]),
});

export type PolicyOverride = z.infer<typeof PolicyOverrideSchema>;

// Re-export OperationalConstraint from policy for convenience
export { OperationalConstraintSchema, type OperationalConstraint };

// ---------------------------------------------------------------------------
// AgentConfig — full agent configuration
// ---------------------------------------------------------------------------

export const AgentConfigSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  intent: z.string(),
  /** Filesystem path to agent workspace directory (contains AGENT.md, KNOWLEDGE.md, etc.) */
  workspacePath: z.string(),
  skills: z.array(z.string()),
  skillKnowledge: z.record(z.string(), z.string()),
  triggers: z.array(TriggerConfigSchema),
  policyRules: z.array(z.string()),
  policyOverrides: z.array(PolicyOverrideSchema),
  globalApprovalRequired: z.boolean(),
  operationalConstraints: z.array(OperationalConstraintSchema),
  connectionIds: z.array(z.string()),
  memoryEnabled: z.boolean(),
  lessonDistillationInterval: z.number(),
  scopeStrategy: z.enum(["static", "llm"]),
  model: z.string().optional(),
  thinkingLevel: z.enum(["off", "low", "medium", "high"]).optional(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;
