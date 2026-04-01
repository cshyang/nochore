import { createServerFn } from "@tanstack/react-start";
import { getProjectDeps } from "./deps";
import { buildSerializedRun } from "./models";
import { jsonSafe } from "./serializable";

export const getRunHistory = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string; limit?: number }) => input)
  .handler(async ({ data: { agentId, projectId, limit } }) => {
    const { runRepository, runEventRepository, approvalRepository } = getProjectDeps(projectId);
    const runs = await runRepository.getByAgent(agentId, limit ?? 20);

    const result = await Promise.all(
      runs.map(async (run) =>
        buildSerializedRun(run, await runEventRepository.listByRun(run.id), await approvalRepository.listByRun(run.id)),
      ),
    );

    return jsonSafe(result);
  });

export const getRun = createServerFn({ method: "GET" })
  .inputValidator((input: { runId: string; projectId: string }) => input)
  .handler(async ({ data: { runId, projectId } }) => {
    const { runRepository, runEventRepository, approvalRepository } = getProjectDeps(projectId);
    const run = await runRepository.getById(runId);
    if (!run) {
      return jsonSafe(null);
    }

    return jsonSafe(
      buildSerializedRun(run, await runEventRepository.listByRun(run.id), await approvalRepository.listByRun(run.id)),
    );
  });

export const syncRunTerminalState = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { runId: string; projectId: string; status: "failed" | "cancelled"; error?: string }) => input,
  )
  .handler(async ({ data: { runId, projectId, status, error } }) => {
    const { runRepository, runEventRepository, approvalRepository } = getProjectDeps(projectId);
    const run = await runRepository.getById(runId);
    if (!run) {
      return jsonSafe({ ok: false, synced: false, reason: "not_found" });
    }

    if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      return jsonSafe({ ok: true, synced: false, status: run.status });
    }

    const resolvedAt = new Date();
    const terminalReason =
      error ??
      (status === "cancelled"
        ? "Cancelled in Trigger.dev"
        : "Run failed in Trigger.dev before local persistence completed");

    if (status === "cancelled") {
      await runRepository.cancel(runId, resolvedAt, terminalReason);
    } else {
      await runRepository.fail(runId, resolvedAt, terminalReason);
    }

    const pendingApprovals = await approvalRepository.listByRun(runId, ["pending"]);
    for (const approval of pendingApprovals) {
      const approvalReason =
        status === "cancelled"
          ? "Run cancelled before approval was resolved"
          : "Run ended before approval was resolved";
      await approvalRepository.markExpired(approval.id, approvalReason, resolvedAt);
      await runEventRepository.append({
        runId,
        agentId: run.agentId,
        timestamp: resolvedAt,
        type: "tool_approval_expired",
        payload: {
          approvalId: approval.id,
          toolName: approval.toolName,
          reason: approvalReason,
        },
      });
    }

    await runEventRepository.append({
      runId,
      agentId: run.agentId,
      timestamp: resolvedAt,
      type: status === "cancelled" ? "run_cancelled" : "run_failed",
      payload:
        status === "cancelled"
          ? { reason: terminalReason, cancelledInTriggerDev: true }
          : { reason: terminalReason, syncedFromTriggerDev: true },
    });

    return jsonSafe({ ok: true, synced: true, status });
  });
