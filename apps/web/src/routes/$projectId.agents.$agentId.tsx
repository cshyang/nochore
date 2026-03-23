import { createFileRoute, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { AgentWorkspace } from "~/components/AgentWorkspace";
import { getAgent, deleteAgent, triggerManualRun } from "~/server/agents";
import { getProject } from "~/server/projects";
import { getRunHistory } from "~/server/runs";
import { getPendingActions, approveAction, rejectAction } from "~/server/approvals";
import { listAvailableSkills } from "~/server/skills";
import { listConnections } from "~/server/connections";
import type { ProjectView, AgentView } from "~/lib/types";

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
      return { project, agent, runs: runs ?? [], pending: pending ?? [], skills: skills ?? [], projectConnections: projectConnections ?? [] };
    } catch {
      return { project: null, agent: null, runs: [], pending: [] };
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

  const project = loaderData.project as ProjectView | null;
  const agent = loaderData.agent as AgentView | null;
  const skills = (loaderData.skills ?? []) as Array<{ id: string; name: string; description: string }>;
  const projectConnections = (loaderData.projectConnections ?? []) as Array<{ id: string; provider: string; status: string }>;

  if (!project || !agent) {
    return <div>Agent not found.</div>;
  }

  const handleApprove = async (actionId: string) => {
    try {
      await approveAction({ data: { actionId, projectId } });
    } catch {
      // Approval failed
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      await rejectAction({ data: { actionId, projectId, reason: "Rejected by user" } });
    } catch {
      // Rejection failed
    }
  };

  const handleDeleteAgent = async () => {
    await deleteAgent({ data: { agentId, projectId } });
    await router.invalidate();
    navigate({ to: "/$projectId", params: { projectId } });
  };

  const handleRunNow = async () => {
    await triggerManualRun({ data: { agentId, projectId } });
  };

  return (
    <AgentWorkspace
      agent={agent}
      project={project}
      availableSkills={skills}
      projectConnections={projectConnections}
      onBack={() =>
        navigate({ to: "/$projectId", params: { projectId } })
      }
      onDeleteAgent={handleDeleteAgent}
      onRunNow={handleRunNow}
      runs={loaderData.runs as any[]}
      pendingActions={loaderData.pending as any[]}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
