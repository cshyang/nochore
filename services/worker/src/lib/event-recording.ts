import { logger } from "@trigger.dev/sdk";
import type { AgentRuntime } from "./agent-runtime";

export type RunEventType =
  | "run_started"
  | "prompt_built"
  | "tool_called"
  | "tool_executed"
  | "tool_approval_requested"
  | "tool_approval_resolved"
  | "tool_approval_expired"
  | "policy_rule_suggested"
  | "agent_message"
  | "finding_recorded"
  | "task_started"
  | "task_completed"
  | "metric_observed"
  | "lesson_distilled"
  | "run_completed"
  | "run_stopped"
  | "run_failed";

export async function recordEvent(
  runtime: AgentRuntime,
  runId: string,
  agentId: string,
  type: RunEventType,
  payload: Record<string, unknown>,
): Promise<string> {
  const id = await runtime.runEventRepository.append({
    runId,
    agentId,
    timestamp: new Date(),
    type,
    payload,
  });

  logger.info("Agent run event", { runId, agentId, type });
  return id;
}
