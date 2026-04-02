import type { ApprovalRecord, RunRecord, RunStatus } from "../../../../packages/harness/src/types";
import { getProjectDeps } from "./deps";
import { buildSerializedPendingAction, buildSerializedRun } from "./models";

const ACTIVE_RUN_STATUSES = new Set<RunStatus>(["queued", "running", "waiting_for_approval"]);
const ACTIONABLE_APPROVAL_STATUSES = new Set<ApprovalRecord["status"]>(["pending", "expired"]);

export async function loadAgentActivityState(projectId: string, agentId: string) {
  const deps = getProjectDeps(projectId);
  const agent = await deps.agentRepository.getById(agentId);
  if (!agent) {
    return null;
  }

  const runs = await deps.runRepository.getByAgent(agentId);
  const serializedRuns = await Promise.all(
    runs.map(async (run) =>
      buildSerializedRun(
        run,
        await deps.runEventRepository.listByRun(run.id),
        (await deps.approvalRepository.listByRun(run.id)).filter(isActionableApproval),
      ),
    ),
  );

  const actionableApprovals = (await deps.approvalRepository.listByAgent(agentId)).filter(isActionableApproval);
  const activeRuns = runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status));
  const latestRun = runs[0] ?? null;
  const latestActiveRun =
    activeRuns.sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0] ?? null;
  const timestamps = [
    agent.updatedAt.getTime(),
    ...collectRunTimestamps(runs),
    ...collectApprovalTimestamps(actionableApprovals),
    ...(await deps.runEventRepository.listByAgent(agentId, 200)).map((event) => event.timestamp.getTime()),
  ];

  return {
    agentId,
    version: deriveActivityVersion(timestamps),
    primaryStatus: derivePrimaryStatus({
      pendingApprovalCount: actionableApprovals.length,
      activeRunCount: activeRuns.length,
      latestRunStatus: latestRun?.status,
    }),
    activeRunCount: activeRuns.length,
    pendingApprovalCount: actionableApprovals.length,
    activeRunId: latestActiveRun?.id ?? null,
    runs: serializedRuns,
  };
}

export async function loadProjectActivityState(projectId: string) {
  const deps = getProjectDeps(projectId);
  const agents = await deps.agentRepository.listByProject(projectId);
  const agentNameById = new Map(agents.map((agent) => [agent.id, agent.name]));
  const actionableApprovals = (await deps.approvalRepository.listByProject(projectId)).filter(isActionableApproval);
  const approvalByAgentId = new Map<string, ApprovalRecord[]>();
  for (const approval of actionableApprovals) {
    const existing = approvalByAgentId.get(approval.agentId) ?? [];
    existing.push(approval);
    approvalByAgentId.set(approval.agentId, existing);
  }

  const agentSummaries = await Promise.all(
    agents.map(async (agent) => {
      const runs = await deps.runRepository.getByAgent(agent.id);
      const activeRunCount = runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).length;
      const pendingApprovalCount = (approvalByAgentId.get(agent.id) ?? []).length;
      const latestRun = runs[0] ?? null;
      const timestamps = [
        agent.updatedAt.getTime(),
        ...collectRunTimestamps(runs),
        ...collectApprovalTimestamps(approvalByAgentId.get(agent.id) ?? []),
      ];

      return {
        id: agent.id,
        primaryStatus: derivePrimaryStatus({
          pendingApprovalCount,
          activeRunCount,
          latestRunStatus: latestRun?.status,
        }),
        activeRunCount,
        pendingApprovalCount,
        lastRunAt: latestRun ? latestRun.startedAt.getTime() : null,
        lastRunRelative: latestRun ? relativeTime(latestRun.startedAt.getTime()) : null,
        version: deriveActivityVersion(timestamps),
      };
    }),
  );

  const needsInput = actionableApprovals
    .map((approval) => ({
      id: approval.id,
      agentId: approval.agentId,
      agentName: agentNameById.get(approval.agentId) ?? "Agent",
      runId: approval.runId,
      approval: buildSerializedPendingAction(approval),
    }))
    .sort((left, right) => right.approval.createdAt.localeCompare(left.approval.createdAt));

  return {
    projectId,
    version: deriveActivityVersion([
      ...agentSummaries.map((agent) => agent.version),
      ...collectApprovalTimestamps(actionableApprovals),
    ]),
    agents: agentSummaries.map(({ version: _version, ...agent }) => agent),
    needsInput,
  };
}

export function derivePrimaryStatus(params: {
  pendingApprovalCount: number;
  activeRunCount: number;
  latestRunStatus?: RunStatus;
}): "attention" | "running" | "error" | "idle" {
  if (params.pendingApprovalCount > 0) {
    return "attention";
  }
  if (params.activeRunCount > 0) {
    return "running";
  }
  if (params.latestRunStatus === "failed") {
    return "error";
  }
  return "idle";
}

export function deriveActivityVersion(timestamps: number[]): number {
  if (timestamps.length === 0) {
    return 0;
  }

  const maxTimestamp = Math.max(...timestamps);
  const checksum = timestamps.reduce((sum, timestamp) => (sum + timestamp) % 1000, 0);
  return maxTimestamp * 1000 + checksum;
}

export function isActionableApproval(
  approval: ApprovalRecord,
): approval is ApprovalRecord & { status: "pending" | "expired" } {
  return ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
}

function collectRunTimestamps(runs: RunRecord[]): number[] {
  return runs.flatMap((run) => [run.startedAt.getTime(), run.completedAt?.getTime()].filter(isNumber));
}

function collectApprovalTimestamps(approvals: ApprovalRecord[]): number[] {
  return approvals.flatMap((approval) =>
    [approval.createdAt.getTime(), approval.resolvedAt?.getTime(), approval.expiresAt?.getTime()].filter(isNumber),
  );
}

function isNumber(value: number | undefined): value is number {
  return typeof value === "number";
}

function relativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMins = Math.floor(diffMs / 60_000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}
