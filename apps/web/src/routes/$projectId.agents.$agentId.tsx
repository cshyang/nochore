import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PROJECTS } from "~/lib/mock";
import { AgentDetail } from "~/components/AgentDetail";
import { getAgent } from "~/server/agents";
import { getRunHistory } from "~/server/runs";
import { getPendingActions, approveAction, rejectAction } from "~/server/approvals";

export const Route = createFileRoute("/$projectId/agents/$agentId")({
  loader: async ({ params }) => {
    const { projectId, agentId } = params;
    try {
      const [agent, runs, pending] = await Promise.all([
        getAgent({ data: { agentId, projectId } }),
        getRunHistory({ data: { agentId, projectId, limit: 20 } }),
        getPendingActions({ data: { agentId, projectId } }),
      ]);
      return { agent, runs: runs ?? [], pending: pending ?? [], fromHarness: true };
    } catch {
      return { agent: null, runs: [], pending: [], fromHarness: false };
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

  // Always resolve mock project/agent for the shell (header, tabs, settings)
  const project = PROJECTS.find((p) => p.id === projectId)!;
  const mockAgent = project?.agents.find((a) => a.id === agentId);

  if (!mockAgent) {
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
      agent={mockAgent}
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
