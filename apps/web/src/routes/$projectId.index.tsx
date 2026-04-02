import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectHome } from "~/components/ProjectHome";
import { useProjectLiveContext } from "~/components/project-live-context";
import { parseConnectionViews } from "~/lib/view-models";
import { listConnections } from "~/server/connections";
import { deleteProject } from "~/server/projects";

export const Route = createFileRoute("/$projectId/")({
  loader: async ({ params }) => {
    const connections = await listConnections({ data: { projectId: params.projectId } });
    return { connections };
  },
  component: ProjectIndexPage,
});

function ProjectIndexPage() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const { project } = useProjectLiveContext();
  const connections = parseConnectionViews(loaderData.connections);

  const handleDeleteProject = async () => {
    await deleteProject({ data: { projectId: project.id } });
    navigate({ to: "/" });
  };

  return (
    <ProjectHome
      project={project}
      connections={connections}
      onSelectAgent={(id, options) =>
        navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId: project.id, agentId: id },
          search: {
            tab: options?.tab,
            runId: options?.runId,
            pendingActionId: options?.pendingActionId,
          },
        })
      }
      onNewAgent={() =>
        navigate({
          to: "/$projectId/agents/new",
          params: { projectId: project.id },
        })
      }
      onDeleteProject={handleDeleteProject}
    />
  );
}
