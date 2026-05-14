import type {
  AgentSessionRecord,
  ApprovalRecord,
  ContextSnapshotRecord,
  RunRecord,
  RunStatus,
  SandboxLeaseRecord,
  WorkItemRecord,
  WorkItemStatus,
} from "@nochore/harness";
import { getProjectDeps } from "./deps";
import { buildSerializedPendingAction, buildSerializedRun } from "./models";

const ACTIVE_RUN_STATUSES = new Set<RunStatus>(["queued", "running", "waiting_for_approval", "waiting_for_tasks"]);
const ACTIVE_WORK_ITEM_STATUSES = new Set<WorkItemStatus>([
  "queued",
  "running",
  "waiting_for_input",
  "waiting_for_approval",
  "waiting_for_tasks",
]);
const ACTIONABLE_APPROVAL_STATUSES = new Set<ApprovalRecord["status"]>(["pending"]);

export async function loadAgentActivityState(projectId: string, agentId: string) {
  const deps = getProjectDeps(projectId);
  const agent = await deps.agentRepository.getById(agentId);
  if (!agent) {
    return null;
  }

  const runs = await deps.runRepository.getByAgent(agentId);
  const sessions = await deps.agentSessionRepository.listByAgent(agentId);
  const workItems = await deps.workItemRepository.listByAgent(agentId, 100);
  const sessionById = new Map(sessions.map((session) => [session.id, session]));
  const serializedRuns = await Promise.all(
    runs.map(async (run) =>
      buildSerializedRun(
        run,
        await deps.runEventRepository.listByRun(run.id),
        await deps.approvalRepository.listByRun(run.id),
        await deps.agentTaskRepository.listByParentRun(run.id),
      ),
    ),
  );
  const serializedRunById = new Map(serializedRuns.map((run) => [run.id, run]));
  const childWorkItems = await deps.workItemRepository.listChildrenByParents(workItems.map((workItem) => workItem.id));
  const childWorkItemsByParent = groupWorkItemsByParent(childWorkItems);
  const latestSnapshotsByWorkItemId = new Map<string, ContextSnapshotRecord | null>();
  const currentLeaseBySessionId = new Map<string, SandboxLeaseRecord | null>();

  for (const workItem of workItems) {
    latestSnapshotsByWorkItemId.set(
      workItem.id,
      (await deps.contextSnapshotRepository.listByWorkItem(workItem.id, 1))[0] ?? null,
    );
  }
  for (const session of sessions) {
    const currentLease =
      session.currentSandboxLeaseId != null
        ? await deps.sandboxLeaseRepository.getById(session.currentSandboxLeaseId)
        : ((await deps.sandboxLeaseRepository.listBySession(session.id))[0] ?? null);
    currentLeaseBySessionId.set(session.id, currentLease);
  }

  const serializedWorkItems = workItems.map((workItem) =>
    buildSerializedWorkItem({
      workItem,
      session: sessionById.get(workItem.sessionId) ?? null,
      latestSnapshot: latestSnapshotsByWorkItemId.get(workItem.id) ?? null,
      currentSandboxLease: currentLeaseBySessionId.get(workItem.sessionId) ?? null,
      run: workItem.runId ? (serializedRunById.get(workItem.runId) ?? null) : null,
      childWorkItems: childWorkItemsByParent.get(workItem.id) ?? [],
    }),
  );
  const linkedRunIds = new Set(workItems.flatMap((workItem) => (workItem.runId ? [workItem.runId] : [])));
  const legacyRunWorkItems = serializedRuns
    .filter((run) => !linkedRunIds.has(run.id))
    .map((run) => buildLegacyRunWorkItem(run));
  const allSerializedWorkItems = [...serializedWorkItems, ...legacyRunWorkItems].sort(
    (left, right) => workItemSortTimestamp(right) - workItemSortTimestamp(left),
  );

  const actionableApprovals = (await deps.approvalRepository.listByAgent(agentId)).filter(isActionableApproval);
  const activeRuns = runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status));
  const activeWorkItems = workItems.filter((workItem) => ACTIVE_WORK_ITEM_STATUSES.has(workItem.status));
  const latestRun = runs[0] ?? null;
  const latestWorkItem = workItems[0] ?? null;
  const latestActiveRun =
    activeRuns.sort((left, right) => right.startedAt.getTime() - left.startedAt.getTime())[0] ?? null;
  const latestActiveWorkItem = resolveLatestActiveWorkItem(sessions, activeWorkItems);
  const taskTimestamps = serializedRuns.flatMap((sr) =>
    sr.tasks.flatMap((task) =>
      [task.startedAt, task.completedAt].filter((t): t is string => t != null).map((t) => new Date(t).getTime()),
    ),
  );
  const timestamps = [
    agent.updatedAt.getTime(),
    ...collectRunTimestamps(runs),
    ...collectSessionTimestamps(sessions),
    ...collectWorkItemTimestamps(workItems),
    ...collectApprovalTimestamps(actionableApprovals),
    ...(await deps.runEventRepository.listByAgent(agentId, 200)).map((event) => event.timestamp.getTime()),
    ...taskTimestamps,
  ];

  return {
    agentId,
    version: deriveActivityVersion(timestamps),
    primaryStatus: derivePrimaryStatus({
      pendingApprovalCount: actionableApprovals.length,
      activeRunCount: activeWorkItems.length || activeRuns.length,
      latestRunStatus: latestWorkItem?.status === "failed" ? "failed" : latestRun?.status,
    }),
    activeRunCount: activeWorkItems.length || activeRuns.length,
    pendingApprovalCount: actionableApprovals.length,
    activeRunId: latestActiveWorkItem?.runId ?? latestActiveRun?.id ?? null,
    activeWorkItemId: latestActiveWorkItem?.id ?? (latestActiveRun ? `legacy-run:${latestActiveRun.id}` : null),
    runs: serializedRuns,
    workItems: allSerializedWorkItems,
    sessions: sessions.map(buildSerializedAgentSession),
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
      const workItems = await deps.workItemRepository.listByAgent(agent.id, 100);
      const activeWorkItemCount = workItems.filter((workItem) => ACTIVE_WORK_ITEM_STATUSES.has(workItem.status)).length;
      const activeRunCount = activeWorkItemCount || runs.filter((run) => ACTIVE_RUN_STATUSES.has(run.status)).length;
      const pendingApprovalCount = (approvalByAgentId.get(agent.id) ?? []).length;
      const latestRun = runs[0] ?? null;
      const latestWorkItem = workItems[0] ?? null;
      const timestamps = [
        agent.updatedAt.getTime(),
        ...collectRunTimestamps(runs),
        ...collectWorkItemTimestamps(workItems),
        ...collectApprovalTimestamps(approvalByAgentId.get(agent.id) ?? []),
      ];
      const lastActivityTimestamp = latestWorkItem
        ? (latestWorkItem.startedAt ?? latestWorkItem.createdAt).getTime()
        : (latestRun?.startedAt.getTime() ?? null);

      return {
        id: agent.id,
        primaryStatus: derivePrimaryStatus({
          pendingApprovalCount,
          activeRunCount,
          latestRunStatus: latestWorkItem?.status === "failed" ? "failed" : latestRun?.status,
        }),
        activeRunCount,
        pendingApprovalCount,
        lastRunAt: lastActivityTimestamp,
        lastRunRelative: lastActivityTimestamp ? relativeTime(lastActivityTimestamp) : null,
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

export function isActionableApproval(approval: ApprovalRecord): approval is ApprovalRecord & { status: "pending" } {
  return ACTIONABLE_APPROVAL_STATUSES.has(approval.status);
}

function collectRunTimestamps(runs: RunRecord[]): number[] {
  return runs.flatMap((run) => [run.startedAt.getTime(), run.completedAt?.getTime()].filter(isNumber));
}

function collectWorkItemTimestamps(workItems: WorkItemRecord[]): number[] {
  return workItems.flatMap((workItem) =>
    [workItem.createdAt.getTime(), workItem.startedAt?.getTime(), workItem.completedAt?.getTime()].filter(isNumber),
  );
}

function collectSessionTimestamps(sessions: AgentSessionRecord[]): number[] {
  return sessions.flatMap((session) =>
    [session.createdAt.getTime(), session.updatedAt.getTime(), session.lastActiveAt?.getTime()].filter(isNumber),
  );
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

function resolveLatestActiveWorkItem(
  sessions: AgentSessionRecord[],
  activeWorkItems: WorkItemRecord[],
): WorkItemRecord | null {
  const activeById = new Map(activeWorkItems.map((workItem) => [workItem.id, workItem]));
  const sessionActive = sessions
    .flatMap((session) => (session.activeWorkItemId ? [activeById.get(session.activeWorkItemId)] : []))
    .filter((workItem): workItem is WorkItemRecord => workItem != null)
    .sort((left, right) => workItemRecordSortTimestamp(right) - workItemRecordSortTimestamp(left))[0];
  if (sessionActive) {
    return sessionActive;
  }
  return (
    activeWorkItems.sort((left, right) => workItemRecordSortTimestamp(right) - workItemRecordSortTimestamp(left))[0] ??
    null
  );
}

function groupWorkItemsByParent(workItems: WorkItemRecord[]): Map<string, WorkItemRecord[]> {
  const grouped = new Map<string, WorkItemRecord[]>();
  for (const workItem of workItems) {
    if (!workItem.parentWorkItemId) {
      continue;
    }
    const existing = grouped.get(workItem.parentWorkItemId) ?? [];
    existing.push(workItem);
    grouped.set(workItem.parentWorkItemId, existing);
  }
  return grouped;
}

function buildSerializedWorkItem(params: {
  workItem: WorkItemRecord;
  session: AgentSessionRecord | null;
  latestSnapshot: ContextSnapshotRecord | null;
  currentSandboxLease: SandboxLeaseRecord | null;
  run: ReturnType<typeof buildSerializedRun> | null;
  childWorkItems: WorkItemRecord[];
}) {
  return {
    ...buildSerializedWorkItemChild(params.workItem),
    input: params.workItem.input,
    result: params.workItem.result,
    run: params.run ?? undefined,
    childWorkItems: params.childWorkItems.map(buildSerializedWorkItemChild),
    session: params.session ? buildSerializedAgentSession(params.session) : undefined,
    latestSnapshot: params.latestSnapshot ? buildSerializedContextSnapshot(params.latestSnapshot) : undefined,
    currentSandboxLease: params.currentSandboxLease
      ? buildSerializedSandboxLease(params.currentSandboxLease)
      : undefined,
  };
}

function buildSerializedWorkItemChild(workItem: WorkItemRecord) {
  return {
    id: workItem.id,
    sessionId: workItem.sessionId,
    agentId: workItem.agentId,
    kind: workItem.kind,
    status: workItem.status,
    parentWorkItemId: workItem.parentWorkItemId,
    runId: workItem.runId,
    agentTaskId: workItem.agentTaskId,
    triggerRunId: workItem.triggerRunId,
    title: workItem.title,
    createdAt: workItem.createdAt.toISOString(),
    startedAt: workItem.startedAt?.toISOString(),
    completedAt: workItem.completedAt?.toISOString(),
    error: workItem.error,
  };
}

function buildLegacyRunWorkItem(run: ReturnType<typeof buildSerializedRun>) {
  return {
    id: `legacy-run:${run.id}`,
    sessionId: `legacy-run:${run.id}`,
    agentId: run.agentId,
    kind: "run" as const,
    status: run.status,
    runId: run.id,
    triggerRunId: run.triggerRunId,
    title: `${humanizeToken(run.triggerType)} run`,
    createdAt: run.startedAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    error: run.error,
    run,
    childWorkItems: [],
  };
}

function buildSerializedAgentSession(session: AgentSessionRecord) {
  return {
    id: session.id,
    projectId: session.projectId,
    agentId: session.agentId,
    conversationThreadId: session.conversationThreadId,
    contextKey: session.contextKey,
    status: session.status,
    currentSandboxLeaseId: session.currentSandboxLeaseId,
    lastContextSnapshotId: session.lastContextSnapshotId,
    activeWorkItemId: session.activeWorkItemId,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    lastActiveAt: session.lastActiveAt?.toISOString(),
  };
}

function buildSerializedContextSnapshot(snapshot: ContextSnapshotRecord) {
  const payload = snapshot.payload;
  return {
    id: snapshot.id,
    sessionId: snapshot.sessionId,
    agentId: snapshot.agentId,
    workItemId: snapshot.workItemId,
    conversationThreadId: snapshot.conversationThreadId,
    kind: snapshot.kind,
    messagesVersion: snapshot.messagesVersion,
    memoryVersion: snapshot.memoryVersion,
    toolBindingsVersion: snapshot.toolBindingsVersion,
    policyVersion: snapshot.policyVersion,
    promptHash: snapshot.promptHash,
    executor: stringPayload(payload, "executor"),
    model: stringPayload(payload, "model"),
    provider: stringPayload(payload, "provider"),
    messageCount: numberPayload(payload, "messageCount"),
    memoryCount: inferMemoryCount(payload),
    toolBindingCount: arrayPayloadLength(payload, "toolNames"),
    policyRuleCount: arrayPayloadLength(payload, "policyRules"),
    createdAt: snapshot.createdAt.toISOString(),
  };
}

function buildSerializedSandboxLease(lease: SandboxLeaseRecord) {
  return {
    id: lease.id,
    sessionId: lease.sessionId,
    provider: lease.provider,
    providerHandle: lease.providerHandle,
    status: lease.status,
    startedAt: lease.startedAt.toISOString(),
    stoppedAt: lease.stoppedAt?.toISOString(),
  };
}

function stringPayload(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function numberPayload(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return typeof value === "number" ? value : undefined;
}

function arrayPayloadLength(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key];
  return Array.isArray(value) ? value.length : undefined;
}

function inferMemoryCount(payload: Record<string, unknown>): number | undefined {
  const explicit = numberPayload(payload, "memoryCount");
  if (explicit != null) {
    return explicit;
  }
  const memoryContextLength = numberPayload(payload, "memoryContextLength");
  if (memoryContextLength != null) {
    return memoryContextLength > 0 ? 1 : 0;
  }
  return arrayPayloadLength(payload, "selectedSkills");
}

function workItemSortTimestamp(workItem: { startedAt?: string; createdAt: string }): number {
  return new Date(workItem.startedAt ?? workItem.createdAt).getTime();
}

function workItemRecordSortTimestamp(workItem: WorkItemRecord): number {
  return (workItem.startedAt ?? workItem.createdAt).getTime();
}

function humanizeToken(value: string): string {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (match) => match.toUpperCase());
}
