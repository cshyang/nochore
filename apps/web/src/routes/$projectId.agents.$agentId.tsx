import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { AgentWorkspace } from "~/components/AgentWorkspace";
import { deleteAgent, getAgent, triggerManualRun, updateAgentConfig } from "~/server/agents";
import { approveAction, getPendingActions, rejectAction } from "~/server/approvals";
import { sendChat } from "~/server/chat";
import { disconnectProvider, initiateConnection, listConnections } from "~/server/connections";
import { getProject } from "~/server/projects";
import { getRealtimeToken } from "~/server/realtime";
import { getRunHistory } from "~/server/runs";
import { listAvailableSkills } from "~/server/skills";

export const Route = createFileRoute("/$projectId/agents/$agentId")({
  loader: async ({ params }) => {
    const { projectId, agentId } = params;
    try {
      const [project, agent, runs, pending, skills, projectConnections] = await Promise.all([
        getProject({ data: { projectId } }),
        getAgent({ data: { agentId, projectId } }),
        getRunHistory({ data: { agentId, projectId, limit: 20 } }),
        getPendingActions({ data: { agentId, projectId } }),
        listAvailableSkills(),
        listConnections({ data: { projectId } }),
      ]);
      return {
        project,
        agent,
        runs: runs ?? [],
        pending: pending ?? [],
        skills: skills ?? [],
        projectConnections: projectConnections ?? [],
      };
    } catch {
      return { project: null, agent: null, runs: [], pending: [], skills: [], projectConnections: [] };
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

  const project = normalizeProject(loaderData.project);
  const agent = normalizeAgent(loaderData.agent);
  const skills = normalizeSkills(loaderData.skills);
  const projectConnections = normalizeConnections(loaderData.projectConnections);
  const runs = normalizeRuns(loaderData.runs);
  const pending = normalizeApprovals(loaderData.pending);
  const [activeRun, setActiveRun] = useState<{
    runId: string;
    triggerRunId: string;
    accessToken: string;
  } | null>(null);

  const activateRun = useCallback(async (runId: string, triggerRunId: string) => {
    try {
      const tokenResult = await getRealtimeToken({ data: { triggerRunId } });
      const token = (tokenResult as { token?: string })?.token;
      if (token) {
        setActiveRun({ runId, triggerRunId, accessToken: token });
      }
    } catch {
      // Token creation failed — fall back to static timeline
    }
  }, []);

  const handleLiveRunComplete = useCallback(() => {
    setActiveRun(null);
    void router.invalidate();
  }, [router]);

  const handleConnect = useCallback(
    async (provider: string) => {
      try {
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
    [projectId],
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
    const activeRunRecord = runs.find((r) => r.status === "running" || r.status === "queued");
    if (!activeRunRecord) return;
    const triggerRunId = (activeRunRecord as { triggerRunId?: string }).triggerRunId;
    if (triggerRunId) {
      void activateRun(activeRunRecord.id, triggerRunId);
    }
  }, [activeRun, activateRun, runs]); // Run once on mount

  const [runError, setRunError] = useState<string | null>(null);

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

  const handleAskDeeper = async (prompt: string, context?: { eventId?: string; runId?: string }) => {
    setRunError(null);
    try {
      const message = context?.runId ? `[Re: run ${context.runId}] ${prompt}` : prompt;
      const result = await sendChat({ data: { agentId, projectId, message } });
      const data = result as { startedRunId?: string; triggerRunId?: string };
      if (data.startedRunId && data.triggerRunId) {
        void activateRun(data.startedRunId, data.triggerRunId);
      }
      void router.invalidate();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRunError(
        msg.includes("fetch") || msg.includes("ECONNREFUSED")
          ? "Could not reach the task runner. Is trigger.dev running? (npx trigger.dev dev)"
          : `Run failed: ${msg}`,
      );
    }
  };

  const handleApprove = async (actionId: string) => {
    try {
      const result = await approveAction({ data: { actionId, projectId } });
      void router.invalidate();
      return result as { runId?: string };
    } catch {
      return {};
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      await rejectAction({ data: { actionId, projectId, reason: "Rejected by user" } });
      void router.invalidate();
    } catch {
      // Rejection failed
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
      activeRun={activeRun}
      onLiveRunComplete={handleLiveRunComplete}
      runError={runError}
      onBack={() => navigate({ to: "/$projectId", params: { projectId } })}
      onDeleteAgent={handleDeleteAgent}
      onRunNow={handleRunNow}
      onConnect={handleConnect}
      onDisconnect={handleDisconnect}
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
      pendingActions={pending}
      onApprove={handleApprove}
      onReject={handleReject}
      onAskDeeper={handleAskDeeper}
    />
  );
}

function normalizeProject(project: unknown) {
  if (!project || typeof project !== "object") return null;
  const value = project as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    icon: typeof value.icon === "string" ? value.icon : "◌",
    color: typeof value.color === "string" ? value.color : null,
  };
}

function normalizeAgent(agent: unknown) {
  if (!agent || typeof agent !== "object") return null;
  const value = agent as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.name !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    description: typeof value.description === "string" ? value.description : "",
    instructions: typeof value.instructions === "string" ? value.instructions : "",
    skills: Array.isArray(value.skills) ? value.skills.filter((item): item is string => typeof item === "string") : [],
    schedule: typeof value.schedule === "string" ? value.schedule : "manual",
    status: typeof value.status === "string" ? value.status : "draft",
    toolConfig:
      (value.toolConfig as Record<string, unknown> | undefined) ??
      ({
        requiredProviders: [],
        tools: {},
      } as Record<string, unknown>),
    notificationConfig: (value.notificationConfig as Record<string, unknown> | undefined) ?? {
      inApp: true,
      email: false,
      slack: false,
    },
  };
}

function normalizeSkills(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { id: string; name: string; description?: string } =>
      !!item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).id === "string" &&
      typeof (item as Record<string, unknown>).name === "string",
  );
}

function normalizeConnections(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is { id?: string; provider: string; status: string } =>
      !!item &&
      typeof item === "object" &&
      typeof (item as Record<string, unknown>).provider === "string" &&
      typeof (item as Record<string, unknown>).status === "string",
  );
}

function normalizeRuns(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (
      item,
    ): item is {
      id: string;
      agentId?: string;
      triggerType?: string;
      status?: string;
      startedAt?: string | number | Date;
      completedAt?: string | number | Date;
      error?: string | null;
      result?: {
        headline?: string;
        details?: string[];
        eventsLogged?: number;
        proposals?: Array<{ id?: string; action?: string; reason?: string; confidence?: number; skillSource?: string }>;
        steps?: Array<{ step?: string }>;
      };
    } => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string",
  );
}

function normalizeApprovals(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (
      item,
    ): item is {
      id: string;
      approvalId?: string;
      runId?: string;
      toolName?: string;
      toolInput?: Record<string, unknown>;
      status?: string;
      decisionReason?: string;
      createdAt?: string | number | Date;
      resolvedAt?: string | number | Date;
    } => !!item && typeof item === "object" && typeof (item as Record<string, unknown>).id === "string",
  );
}
