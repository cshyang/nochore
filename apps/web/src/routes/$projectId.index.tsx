import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { PROJECTS } from "~/lib/mock";
import { ProjectHome } from "~/components/ProjectHome";

export const Route = createFileRoute("/$projectId/")({
  component: ProjectIndexPage,
});

function ProjectIndexPage() {
  const { projectId } = useParams({ from: "/$projectId/" });
  const navigate = useNavigate();
  const project = PROJECTS.find((p) => p.id === projectId)!;

  return (
    <ProjectHome
      project={project}
      onSelectAgent={(id) =>
        navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId, agentId: id },
        })
      }
    />
  );
}
