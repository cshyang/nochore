import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Homepage } from "~/components/Homepage";
import { listProjects, createProject } from "~/server/projects";

export const Route = createFileRoute("/")({
  loader: async () => {
    const projects = await listProjects();
    return { projects };
  },
  component: IndexPage,
});

function IndexPage() {
  const { projects } = Route.useLoaderData();
  const navigate = useNavigate();

  const handleCreateProject = async () => {
    const name = window.prompt("Project name:");
    if (!name) return;
    const result = await createProject({ data: { name } });
    if (result && typeof result === "object" && "id" in result) {
      navigate({
        to: "/$projectId",
        params: { projectId: (result as { id: string }).id },
      });
    }
  };

  return (
    <Homepage
      projects={projects as any[]}
      onSelectProject={(id) => navigate({ to: "/$projectId", params: { projectId: id } })}
      onCreateProject={handleCreateProject}
    />
  );
}
