import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PROJECTS } from "~/lib/mock";
import { AgentDetail } from "~/components/AgentDetail";

export const Route = createFileRoute("/$projectId/agents/$agentId")({
  component: AgentDetailPage,
});

function AgentDetailPage() {
  const { projectId, agentId } = useParams({
    from: "/$projectId/agents/$agentId",
  });
  const navigate = useNavigate();
  const project = PROJECTS.find((p) => p.id === projectId)!;
  const agent = project.agents.find((a) => a.id === agentId);

  if (!agent) {
    return <div>Agent not found.</div>;
  }

  return (
    <AgentDetail
      agent={agent}
      project={project}
      onBack={() =>
        navigate({ to: "/$projectId", params: { projectId } })
      }
    />
  );
}
