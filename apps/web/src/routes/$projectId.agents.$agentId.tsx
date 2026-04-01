import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentWorkspace } from "~/components/AgentWorkspace";
import { isDirectProvider } from "~/lib/provider-metadata";
import {
  parseAgentView,
  parseConnectionViews,
  parseConversationStateView,
  parseProjectView,
  parseRunViews,
  parseSkillViews,
  parseToolConfigEntryViews,
} from "~/lib/view-models";
import { cancelRun, deleteAgent, getAgent, triggerManualRun, updateAgentConfig } from "~/server/agent-instances";
import { approveAction, rejectAction } from "~/server/approvals";
import { getPrimaryConversationState } from "~/server/chat";
import {
  createDirectConnection,
  disconnectProvider,
  fetchToolkitSummaries,
  initiateConnection,
  listConnections,
} from "~/server/connections";
import {
  acceptLearnedRuleSuggestion,
  dismissLearnedRuleSuggestion,
  revokeLearnedRule,
  suppressLearnedRuleSuggestion,
} from "~/server/learned-rules";
import { getPolicyToolCatalog } from "~/server/policy-tools";
import { getProject } from "~/server/projects";
import { getRealtimeToken } from "~/server/realtime";
import { getRunHistory, syncRunTerminalState } from "~/server/runs";
import { listAvailableSkills } from "~/server/skills";

export const Route = createFileRoute("/$projectId/agents/$agentId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: "activity" | "chat" | "memory" | "settings";
    runId?: string;
    pendingActionId?: string;
  } => ({
    tab:
      search.tab === "activity" || search.tab === "chat" || search.tab === "memory" || search.tab === "settings"
        ? search.tab
        : undefined,
    runId: typeof search.runId === "string" ? search.runId : undefined,
    pendingActionId: typeof search.pendingActionId === "string" ? search.pendingActionId : undefined,
  }),
  loader: async ({ params }) => {
    const { projectId, agentId } = params;
    try {
      const [project, agent, runs, conversation, skills, projectConnections, toolkitSummaries, policyToolCatalog] =
        await Promise.all([
          getProject({ data: { projectId } }),
          getAgent({ data: { agentId, projectId } }),
          getRunHistory({ data: { agentId, projectId, limit: 20 } }),
          getPrimaryConversationState({ data: { agentId, projectId, limit: 12 } }),
          listAvailableSkills(),
          listConnections({ data: { projectId } }),
          fetchToolkitSummaries({ data: { projectId } }).catch(() => []),
          getPolicyToolCatalog({ data: { projectId } }).catch(() => []),
        ]);
      return {
        project,
        agent,
        runs: runs ?? [],
        conversation,
        skills: skills ?? [],
        projectConnections: projectConnections ?? [],
        toolkitSummaries: toolkitSummaries ?? [],
        policyToolCatalog: policyToolCatalog ?? [],
      };
    } catch {
      return {
        project: null,
        agent: null,
        runs: [],
        conversation: null,
        skills: [],
        projectConnections: [],
        toolkitSummaries: [],
        policyToolCatalog: [],
      };
    }
  },
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { projectId, agentId } = useParams({
    from: "/$projectId/agents/$agentId",
  });
  const navigate = useNavigate();
  const router = useRouter();
  const loaderData = Route.useLoaderData();
  const search = Route.useSearch();

  const project = parseProjectView(loaderData.project);
  const agent = parseAgentView(loaderData.agent);
  const skills = parseSkillViews(loaderData.skills);
  const projectConnections = parseConnectionViews(loaderData.projectConnections);
  const runs = parseRunViews(loaderData.runs);
  const conversation = parseConversationStateView(loaderData.conversation);
  const policyToolCatalog = parseToolConfigEntryViews(loaderData.policyToolCatalog);

  // Build provider logo map from Composio toolkit summaries
  const toolkitSummaries = (loaderData.toolkitSummaries ?? []) as Array<{
    slug: string;
    name: string;
    logo: string | null;
  }>;
  const providerLogos = Object.fromEntries(
    toolkitSummaries.filter((tk) => tk.logo).map((tk) => [tk.slug, tk.logo as string]),
  );
  const [activeRun, setActiveRun] = useState<{
    runId: string;
    triggerRunId: string;
    accessToken: string;
  } | null>(null);

  // Track runs that completed/failed via LiveRunView so the auto-activate
  // effect doesn't re-connect to a run whose DB status is stale (e.g. still
  // "queued" in SQLite but already FAILED on trigger.dev).
  const exhaustedRunIds = useRef<Set<string>>(new Set());

  const activateRun = useCallback(async (runId: string, triggerRunId: string) => {
    try {
      const tokenResult = await getRealtimeToken({ data: { triggerRunId } });
      const token = (tokenResult as { token?: string })?.token;
      if (token) {
        setActiveRun({ runId, triggerRunId, accessToken: token });
      }
    } catch {
      // Token creation failed — mark as exhausted so we don't retry
      exhaustedRunIds.current.add(runId);
    }
  }, []);

  const handleLiveRunComplete = useCallback(
    async (status: "completed" | "failed" | "cancelled") => {
      const completedRun = activeRun;
      if (completedRun) {
        exhaustedRunIds.current.add(completedRun.runId);
      }

      setActiveRun(null);

      if (completedRun && (status === "failed" || status === "cancelled")) {
        try {
          await syncRunTerminalState({
            data: {
              runId: completedRun.runId,
              projectId,
              status,
            },
          });
        } catch {
          // Realtime run reached a terminal state but local reconciliation failed.
        }
      }

      void router.invalidate();
    },
    [activeRun, projectId, router],
  );

  const handleConnect = useCallback(
    async (provider: string) => {
      try {
        if (isDirectProvider(provider)) {
          // Direct connections don't need OAuth — create the record immediately
          await createDirectConnection({ data: { projectId, provider } });
          void router.invalidate();
          return;
        }

        const callbackUrl = `${window.location.origin}/${projectId}/callback/composio?provider=${provider}`;
        const result = await initiateConnection({ data: { projectId, provider, callbackUrl } });
        const data = result as { redirectUrl?: string };
        if (data.redirectUrl) {
          window.open(data.redirectUrl, "composio-oauth", "width=600,height=700");
        }
      } catch {
        // Connection initiation failed
      }
    },
    [projectId, router],
  );

  const handleDisconnect = useCallback(
    async (provider: string, connectedAccountId: string) => {
      await disconnectProvider({ data: { projectId, provider, connectedAccountId } });
      void router.invalidate();
    },
    [projectId, router],
  );

  // Refresh data when OAuth popup signals a successful connection
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "composio:connected") {
        void router.invalidate();
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [router]);

  // Auto-activate LiveRunView if page loads with an active run
  useEffect(() => {
    if (activeRun) return;
    const activeRunRecord = runs.find(
      (r) =>
        (r.status === "running" || r.status === "queued" || r.status === "waiting_for_approval") &&
        !exhaustedRunIds.current.has(r.id),
    );
    if (!activeRunRecord) return;
    const triggerRunId = (activeRunRecord as { triggerRunId?: string }).triggerRunId;
    if (triggerRunId) {
      void activateRun(activeRunRecord.id, triggerRunId);
    }
  }, [activeRun, activateRun, runs]);

  const [runError, setRunError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const handleCancelRun = useCallback(async () => {
    if (!activeRun || cancelling) return;
    setCancelling(true);
    try {
      await cancelRun({
        data: { runId: activeRun.runId, triggerRunId: activeRun.triggerRunId, projectId },
      });
      exhaustedRunIds.current.add(activeRun.runId);
      setActiveRun(null);
      void router.invalidate();
    } catch {
      // Cancel failed — run may have already completed
    } finally {
      setCancelling(false);
    }
  }, [activeRun, cancelling, projectId, router]);

  if (!project || !agent) {
    return <div>Agent not found.</div>;
  }

  const handleRunNow = async () => {
    setRunError(null);
    try {
      const result = await triggerManualRun({ data: { agentId, projectId } });
      const data = result as { runId?: string; triggerRunId?: string };
      if (data.runId && data.triggerRunId) {
        void activateRun(data.runId, data.triggerRunId);
      }
      void router.invalidate();
      return data;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRunError(
        msg.includes("fetch") || msg.includes("ECONNREFUSED")
          ? "Could not reach the task runner. Is trigger.dev running? (npx trigger.dev dev)"
          : `Run failed: ${msg}`,
      );
      return {};
    }
  };

  const handleDeleteAgent = async () => {
    await deleteAgent({ data: { agentId, projectId } });
    await router.invalidate();
    navigate({ to: "/$projectId", params: { projectId } });
  };

  return (
    <AgentWorkspace
      agent={agent}
      project={project}
      availableSkills={skills}
      projectConnections={projectConnections}
      policyToolCatalog={policyToolCatalog}
      initialTab={search.tab}
      initialRunId={search.runId ?? null}
      initialPendingActionId={search.pendingActionId ?? null}
      activeRun={activeRun}
      onLiveRunComplete={handleLiveRunComplete}
      onCancelRun={handleCancelRun}
      cancelling={cancelling}
      runError={runError}
      onBack={() => navigate({ to: "/$projectId", params: { projectId } })}
      onDeleteAgent={handleDeleteAgent}
      onRunNow={handleRunNow}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      providerLogos={providerLogos}
      onUpdateAgent={async (updates) => {
        await updateAgentConfig({
          data: {
            agentId,
            projectId,
            ...(updates.name !== undefined ? { name: updates.name } : {}),
            ...(updates.description !== undefined ? { description: updates.description } : {}),
            ...(updates.instructions !== undefined ? { instructions: updates.instructions } : {}),
            ...(updates.skills !== undefined ? { skills: updates.skills } : {}),
            ...(updates.schedule !== undefined
              ? { schedule: updates.schedule as "hourly" | "6hours" | "daily" | "weekly" | "manual" }
              : {}),
            ...(updates.toolConfig !== undefined ? { toolConfig: updates.toolConfig as never } : {}),
            ...(updates.notificationConfig !== undefined
              ? { notificationConfig: updates.notificationConfig as never }
              : {}),
            ...(updates.status !== undefined ? { status: updates.status as "draft" | "live" } : {}),
          },
        });
        void router.invalidate();
      }}
      runs={runs}
      conversation={conversation ?? undefined}
      onRunTriggered={async (runId, triggerRunId) => {
        void activateRun(runId, triggerRunId);
        void router.invalidate();
      }}
      onApprove={async (actionId, reason) => {
        await approveAction({ data: { actionId, projectId, reason } });
        void router.invalidate();
      }}
      onReject={async (actionId, reason) => {
        await rejectAction({ data: { actionId, projectId, reason } });
        void router.invalidate();
      }}
      onAcceptLearnedRule={async (ruleId) => {
        await acceptLearnedRuleSuggestion({ data: { projectId, ruleId } });
        void router.invalidate();
      }}
      onDismissLearnedRule={async (ruleId) => {
        await dismissLearnedRuleSuggestion({ data: { projectId, ruleId } });
        void router.invalidate();
      }}
      onSuppressLearnedRule={async (ruleId) => {
        await suppressLearnedRuleSuggestion({ data: { projectId, ruleId } });
        void router.invalidate();
      }}
      onRevokeLearnedRule={async (ruleId) => {
        await revokeLearnedRule({ data: { projectId, ruleId } });
        void router.invalidate();
      }}
    />
  );
}
