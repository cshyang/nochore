import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { AgentDetail } from "~/components/AgentDetail";
import { getAgent } from "~/server/agents";
import { getProject } from "~/server/projects";
import { getRunHistory } from "~/server/runs";
import { getPendingActions, approveAction, rejectAction } from "~/server/approvals";
import type { Project, Agent } from "~/lib/types";

export const Route = createFileRoute("/$projectId/agents/$agentId")({
  loader: async ({ params }) => {
    const { projectId, agentId } = params;
    try {
      const [project, agent, runs, pending] = await Promise.all([
        getProject({ data: { projectId } }),
        getAgent({ data: { agentId, projectId } }),
        getRunHistory({ data: { agentId, projectId, limit: 20 } }),
        getPendingActions({ data: { agentId, projectId } }),
      ]);
      return { project, agent, runs: runs ?? [], pending: pending ?? [] };
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
  const loaderData = Route.useLoaderData();

  const project = loaderData.project as Project | null;
  const agentRecord = loaderData.agent as any;

  if (!project) {
    return <div>Project not found.</div>;
  }

  // Find the agent in the project's agents list (built from DB in getProject)
  const agent = project.agents.find((a) => a.id === agentId);

  if (!agent) {
    return <div>Agent not found.</div>;
  }

  const handleApprove = async (actionId: string) => {
    try {
      await approveAction({ data: { actionId, projectId } });
    } catch {
      // Approval failed — UI already shows optimistic state
    }
  };

  const handleReject = async (actionId: string) => {
    try {
      await rejectAction({ data: { actionId, projectId, reason: "Rejected by user" } });
    } catch {
      // Rejection failed — UI already shows optimistic state
    }
  };

  return (
    <AgentDetail
      agent={agent}
      project={project}
      onBack={() =>
        navigate({ to: "/$projectId", params: { projectId } })
      }
      runs={loaderData.runs as any[]}
      pendingActions={loaderData.pending as any[]}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}
