import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ProjectHome } from "~/components/ProjectHome";
import { parseConnectionViews, parseProjectView } from "~/lib/view-models";
import { listConnections } from "~/server/connections";
import { deleteProject, getProject } from "~/server/projects";

export const Route = createFileRoute("/$projectId/")({
  loader: async ({ params }) => {
    const [project, connections] = await Promise.all([
      getProject({ data: { projectId: params.projectId } }),
      listConnections({ data: { projectId: params.projectId } }),
    ]);
    return { project, connections };
  },
  component: ProjectIndexPage,
});

function ProjectIndexPage() {
  const navigate = useNavigate();
  const loaderData = Route.useLoaderData();
  const project = parseProjectView(loaderData.project);
  const connections = parseConnectionViews(loaderData.connections);

  if (!project) {
    return <div>Project not found.</div>;
  }

  const handleDeleteProject = async () => {
    await deleteProject({ data: { projectId: project.id } });
    navigate({ to: "/" });
  };

  return (
    <ProjectHome
      project={project}
      connections={connections}
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
      onDeleteProject={handleDeleteProject}
    />
  );
}
