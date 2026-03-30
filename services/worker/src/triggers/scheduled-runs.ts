import { schedules } from "@trigger.dev/sdk/v3";
import { agentRunTask } from "./agent-run";

// ---------------------------------------------------------------------------
// Scheduled Agent Run — trigger.dev cron schedule
// ---------------------------------------------------------------------------

/**
 * Scheduled task that fires agent runs on a cron schedule.
 *
 * Schedules are created dynamically when agents are configured:
 *
 * ```ts
 * import { schedules } from "@trigger.dev/sdk/v3";
 *
 * await schedules.create({
 *   task: "scheduled-agent-run",
 *   cron: "0 9 * * *",            // Daily at 9am
 *   externalId: agentId,           // Links schedule to agent
 *   deduplicationKey: agentId,     // One schedule per agent
 *   metadata: { projectId },
 * });
 * ```
 */
export const scheduledAgentRun = schedules.task({
  id: "scheduled-agent-run",
  run: async (payload) => {
    const agentId = payload.externalId;
    if (!agentId) {
      throw new Error("Schedule missing externalId (agentId)");
    }

    const projectId = (payload as unknown as { metadata?: Record<string, string> }).metadata?.projectId ?? "";
    if (!projectId) {
      throw new Error("Schedule missing projectId in metadata");
    }

    await agentRunTask.triggerAndWait({
      agentId,
      projectId,
      trigger: {
        type: "cron",
        timestamp: payload.timestamp,
      },
    });
  },
});
