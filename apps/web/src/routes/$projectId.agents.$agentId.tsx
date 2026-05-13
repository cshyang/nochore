import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentWorkspace } from "~/components/AgentWorkspace";
import { useProjectLiveContext } from "~/components/project-live-context";
import { useAgentActivityState } from "~/components/use-activity-state";
import { mergeAgentViewWithActivity } from "~/lib/activity";
import { isDirectProvider } from "~/lib/provider-metadata";
import {
  parseAgentActivityStateView,
  parseAgentView,
  parseConnectionViews,
  parseConversationStateView,
  parseConversationThreadSummaryViews,
  parseSkillViews,
  parseToolConfigEntryViews,
} from "~/lib/view-models";
import { getAgentActivityState } from "~/server/activity";
import { cancelRun, deleteAgent, getAgent, triggerManualRun, updateAgentConfig } from "~/server/agent-instances";
import { approveAction, rejectAction } from "~/server/approvals";
import { deleteConversationThread, getConversationState, listConversationThreads } from "~/server/chat";
import {
  createDirectConnection,
  disconnectProvider,
  fetchToolkitSummaries,
  initiateConnection,
  listConnections,
  listGoogleAdsAccounts,
  updateConnectionConfig,
  upsertAgentConnectionBinding,
} from "~/server/connections";
import {
  acceptLearnedRuleSuggestion,
  dismissLearnedRuleSuggestion,
  revokeLearnedRule,
  suppressLearnedRuleSuggestion,
} from "~/server/learned-rules";
import { getPolicyToolCatalog } from "~/server/policy-tools";
import { listAvailableSkills } from "~/server/skills";

const DRAFT_THREAD_ID = "draft:new-thread";
type GoogleAdsAccountListResult = {
  accounts?: Array<{ id: string; formattedId: string; label: string }>;
  error?: string;
};

export const Route = createFileRoute("/$projectId/agents/$agentId")({
  validateSearch: (
    search: Record<string, unknown>,
  ): {
    tab?: "runs" | "chat" | "learned" | "settings";
    runId?: string;
    threadId?: string;
    pendingActionId?: string;
  } => ({
    tab:
      search.tab === "runs" || search.tab === "chat" || search.tab === "learned" || search.tab === "settings"
        ? search.tab
        : undefined,
    runId: typeof search.runId === "string" ? search.runId : undefined,
    threadId: typeof search.threadId === "string" ? search.threadId : undefined,
    pendingActionId: typeof search.pendingActionId === "string" ? search.pendingActionId : undefined,
  }),
  loaderDeps: ({ search }) => ({ threadId: search.threadId }),
  loader: async ({ params, deps }) => {
    const { projectId, agentId } = params;
    const requestedThreadId = deps.threadId;
    try {
      const [
        agent,
        activity,
        conversation,
        conversationThreads,
        skills,
        projectConnections,
        toolkitSummaries,
        policyToolCatalog,
      ] = await Promise.all([
        getAgent({ data: { agentId, projectId } }),
        getAgentActivityState({ data: { agentId, projectId } }),
        getConversationState({ data: { agentId, projectId, threadId: requestedThreadId, limit: 12 } }),
        listConversationThreads({ data: { agentId, projectId } }),
        listAvailableSkills(),
        listConnections({ data: { projectId } }),
        fetchToolkitSummaries({ data: { projectId } }).catch(() => []),
        getPolicyToolCatalog({ data: { projectId } }).catch(() => []),
      ]);
      return {
        agent,
        activity,
        conversation,
        conversationThreads,
        skills: skills ?? [],
        projectConnections: projectConnections ?? [],
        toolkitSummaries: toolkitSummaries ?? [],
        policyToolCatalog: policyToolCatalog ?? [],
      };
    } catch {
      return {
        agent: null,
        activity: null,
        conversation: null,
        conversationThreads: [],
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
  const { project } = useProjectLiveContext();

  const staticAgent = parseAgentView(loaderData.agent);
  const initialActivity = parseAgentActivityStateView(loaderData.activity);
  const skills = parseSkillViews(loaderData.skills);
  const projectConnections = parseConnectionViews(loaderData.projectConnections);
  const conversation = parseConversationStateView(loaderData.conversation);
  const conversationThreads = parseConversationThreadSummaryViews(loaderData.conversationThreads);
  const policyToolCatalog = parseToolConfigEntryViews(loaderData.policyToolCatalog);
  const [draftThreadOpen, setDraftThreadOpen] = useState(false);
  const [pendingThreadNavigationId, setPendingThreadNavigationId] = useState<string | null>(null);
  const previousSearchThreadIdRef = useRef(search.threadId);
  const { snapshot: activity } = useAgentActivityState({
    projectId,
    agentId,
    initialSnapshot: initialActivity ?? {
      agentId,
      version: 0,
      primaryStatus: staticAgent?.status ?? "idle",
      activeRunCount: staticAgent?.activeRunCount ?? 0,
      pendingApprovalCount: staticAgent?.pendingCount ?? 0,
      activeRunId: null,
      runs: [],
    },
  });
  const agent = useMemo(
    () => (staticAgent ? mergeAgentViewWithActivity(staticAgent, activity) : null),
    [activity, staticAgent],
  );
  const runs = activity.runs;

  // Build provider logo map from Composio toolkit summaries
  const toolkitSummaries = (loaderData.toolkitSummaries ?? []) as Array<{
    slug: string;
    name: string;
    logo: string | null;
  }>;
  const providerLogos = Object.fromEntries(
    toolkitSummaries.filter((tk) => tk.logo).map((tk) => [tk.slug, tk.logo as string]),
  );

  const handleConnect = useCallback(
    async (provider: string) => {
      let popup: Window | null = null;
      try {
        if (isDirectProvider(provider)) {
          // Direct connections don't need OAuth — create the record immediately
          await createDirectConnection({ data: { projectId, provider } });
          void router.invalidate();
          return;
        }

        popup = window.open("about:blank", `composio-oauth-${provider}-${Date.now()}`, "width=600,height=700");
        try {
          popup?.document.write("<p style='font-family: system-ui; padding: 24px;'>Connecting to Composio...</p>");
          popup?.document.close();
        } catch {
          // Some browsers keep a reused popup cross-origin; the redirect below is the important part.
        }
        const returnTo = `${window.location.pathname}${window.location.search}`;
        const callbackUrl = `${window.location.origin}/${projectId}/callback/composio?provider=${provider}&returnTo=${encodeURIComponent(returnTo)}`;
        const result = await initiateConnection({ data: { projectId, provider, callbackUrl } });
        const data = result as { redirectUrl?: string };
        if (data.redirectUrl) {
          if (popup) {
            popup.location.href = data.redirectUrl;
          } else {
            window.location.href = data.redirectUrl;
          }
        } else {
          popup?.close();
        }
      } catch (error) {
        popup?.close();
        console.error("Connection initiation failed", error);
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

  useEffect(() => {
    if (draftThreadOpen || pendingThreadNavigationId || search.tab !== "chat" || !conversation?.threadId) {
      return;
    }

    if (search.threadId === conversation.threadId) {
      return;
    }

    void navigate({
      to: "/$projectId/agents/$agentId",
      params: { projectId, agentId },
      search: (prev) => ({ ...prev, tab: "chat", threadId: conversation.threadId }),
      replace: true,
    });
  }, [
    agentId,
    conversation?.threadId,
    draftThreadOpen,
    navigate,
    pendingThreadNavigationId,
    projectId,
    search.tab,
    search.threadId,
  ]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset draft chat state when the route agent changes.
  useEffect(() => {
    setDraftThreadOpen(false);
    setPendingThreadNavigationId(null);
  }, [agentId]);

  useEffect(() => {
    const previousSearchThreadId = previousSearchThreadIdRef.current;
    previousSearchThreadIdRef.current = search.threadId;

    if (draftThreadOpen && !previousSearchThreadId && search.threadId) {
      setDraftThreadOpen(false);
    }
  }, [draftThreadOpen, search.threadId]);

  useEffect(() => {
    if (!pendingThreadNavigationId) {
      return;
    }

    if (search.tab !== "chat") {
      setPendingThreadNavigationId(null);
      return;
    }

    if (conversation?.threadId === pendingThreadNavigationId && search.threadId === pendingThreadNavigationId) {
      setPendingThreadNavigationId(null);
    }
  }, [conversation?.threadId, pendingThreadNavigationId, search.tab, search.threadId]);

  const [runError, setRunError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const activeRun = activity.activeRunId ? (runs.find((run) => run.id === activity.activeRunId) ?? null) : null;

  const handleSelectRun = useCallback(
    (runId: string | null) => {
      void navigate({
        to: "/$projectId/agents/$agentId",
        params: { projectId, agentId },
        search: (prev) => ({ ...prev, runId: runId ?? undefined }),
        replace: true,
      });
    },
    [agentId, navigate, projectId],
  );

  const handleSelectThread = useCallback(
    (threadId: string) => {
      setDraftThreadOpen(false);
      setPendingThreadNavigationId(threadId);
      void navigate({
        to: "/$projectId/agents/$agentId",
        params: { projectId, agentId },
        search: (prev) => ({ ...prev, tab: "chat", threadId }),
      });
    },
    [agentId, navigate, projectId],
  );

  const handleCreateThread = useCallback(() => {
    setDraftThreadOpen(true);
    void navigate({
      to: "/$projectId/agents/$agentId",
      params: { projectId, agentId },
      search: (prev) => ({ ...prev, tab: "chat", threadId: undefined }),
    });
  }, [agentId, navigate, projectId]);

  const handleDraftThreadCreated = useCallback(
    (threadId: string) => {
      setDraftThreadOpen(false);
      setPendingThreadNavigationId(threadId);
      void navigate({
        to: "/$projectId/agents/$agentId",
        params: { projectId, agentId },
        search: (prev) => ({ ...prev, tab: "chat", threadId }),
        replace: true,
      });
    },
    [agentId, navigate, projectId],
  );

  const handleDeleteThread = useCallback(
    async (thread: (typeof conversationThreads)[number]) => {
      if (thread.isPrimary) {
        return;
      }
      if (
        thread.hasMessages &&
        !window.confirm(`Delete "${thread.title}"? This will remove the full chat transcript.`)
      ) {
        return;
      }

      const result = (await deleteConversationThread({
        data: { agentId, projectId, threadId: thread.id },
      })) as { fallbackThreadId?: string };

      if (!result.fallbackThreadId) {
        void router.invalidate();
        return;
      }

      const isActivePersistedThread = !draftThreadOpen && conversation?.threadId === thread.id;
      if (isActivePersistedThread) {
        void navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId, agentId },
          search: (prev) => ({ ...prev, tab: "chat", threadId: result.fallbackThreadId }),
          replace: true,
        });
        return;
      }

      void router.invalidate();
    },
    [agentId, conversation?.threadId, draftThreadOpen, navigate, projectId, router],
  );

  const handleCancelRun = useCallback(async () => {
    if (!activeRun || cancelling) return;
    if (!activeRun.triggerRunId) {
      setRunError("This run cannot be cancelled because its trigger id is missing.");
      return;
    }
    setCancelling(true);
    try {
      await cancelRun({
        data: { runId: activeRun.id, triggerRunId: activeRun.triggerRunId, projectId },
      });
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

  const activeThreadId = draftThreadOpen ? DRAFT_THREAD_ID : conversation?.threadId;

  const handleRunNow = async () => {
    setRunError(null);
    try {
      const result = await triggerManualRun({ data: { agentId, projectId } });
      const data = result as { runId?: string; triggerRunId?: string };
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
      conversationThreads={conversationThreads}
      activeThreadId={activeThreadId}
      draftThreadOpen={draftThreadOpen}
      initialTab={search.tab}
      initialRunId={search.runId ?? null}
      initialPendingActionId={search.pendingActionId ?? null}
      onTabChange={(tab) => {
        void navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId, agentId },
          search: (prev) => ({
            ...prev,
            tab,
            threadId:
              tab === "chat"
                ? draftThreadOpen
                  ? undefined
                  : (prev.threadId ?? conversation?.threadId)
                : prev.threadId,
          }),
          replace: true,
        });
      }}
      onSelectRun={handleSelectRun}
      onSelectThread={handleSelectThread}
      onCreateThread={handleCreateThread}
      onDeleteThread={handleDeleteThread}
      activeRunId={activity.activeRunId}
      onCancelRun={handleCancelRun}
      cancelling={cancelling}
      runError={runError}
      onBack={() => navigate({ to: "/$projectId", params: { projectId } })}
      onDeleteAgent={handleDeleteAgent}
      onRunNow={handleRunNow}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
      onListGoogleAdsAccounts={async (connectionId) =>
        coerceGoogleAdsAccountListResult(await listGoogleAdsAccounts({ data: { projectId, connectionId } }))
      }
      onSetConnectionConfig={async (provider, config) => {
        await updateConnectionConfig({ data: { projectId, provider, config } });
        void router.invalidate();
      }}
      onSetAgentConnectionBinding={async (binding) => {
        await upsertAgentConnectionBinding({ data: { projectId, agentId, ...binding } });
        void router.invalidate();
      }}
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
            ...(updates.primaryMetric !== undefined ? { primaryMetric: updates.primaryMetric } : {}),
          },
        });
        void router.invalidate();
      }}
      runs={runs}
      conversation={conversation ?? undefined}
      onRunTriggered={async (_runId, _triggerRunId) => {
        void router.invalidate();
      }}
      onThreadCreated={handleDraftThreadCreated}
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

function coerceGoogleAdsAccountListResult(value: unknown): GoogleAdsAccountListResult {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const accounts = Array.isArray(record.accounts)
    ? record.accounts
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const account = item as Record<string, unknown>;
          if (typeof account.id !== "string") return null;
          return {
            id: account.id,
            formattedId: typeof account.formattedId === "string" ? account.formattedId : account.id,
            label: typeof account.label === "string" ? account.label : account.id,
          };
        })
        .filter((account): account is { id: string; formattedId: string; label: string } => account != null)
    : [];
  return {
    accounts,
    error: typeof record.error === "string" ? record.error : undefined,
  };
}
