import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectHome } from "~/components/ProjectHome";
import { getProject } from "~/server/projects";
import type { Project } from "~/lib/types";

export const Route = createFileRoute("/$projectId/")({
  loader: async ({ params }) => {
    const project = await getProject({ data: { projectId: params.projectId } });
    return { project };
  },
  component: ProjectIndexPage,
});

function ProjectIndexPage() {
  const navigate = useNavigate();
  const { project: rawProject } = Route.useLoaderData();
  const project = rawProject as Project | null;

  if (!project) {
    return <div>Project not found.</div>;
  }

  return (
    <ProjectHome
      project={project}
      onSelectAgent={(id) =>
        navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId: project.id, agentId: id },
        })
      }
      onNewAgent={() =>
        navigate({
          to: "/$projectId/agents/new",
          params: { projectId: project.id },
        })
      }
    />
  );
}
