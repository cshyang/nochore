import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PROJECTS } from "~/lib/mock";
import { SetupFlow } from "~/components/SetupFlow";

export const Route = createFileRoute("/$projectId/agents/new")({
  component: NewAgentPage,
});

function NewAgentPage() {
  const { projectId } = useParams({ from: "/$projectId/agents/new" });
  const navigate = useNavigate();
  const project = PROJECTS.find((p) => p.id === projectId)!;

  return (
    <SetupFlow
      projectId={projectId}
      project={project}
      onComplete={() =>
        navigate({ to: "/$projectId", params: { projectId } })
      }
    />
  );
}
