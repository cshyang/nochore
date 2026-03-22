import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Homepage } from "~/components/Homepage";
import { SetupWorkspace } from "~/components/SetupWorkspace";
import { listProjects, createProject } from "~/server/projects";
import { listAvailableSkills } from "~/server/skills";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [projects, skills] = await Promise.all([
      listProjects(),
      listAvailableSkills(),
    ]);
    return { projects, skills };
  },
  component: IndexPage,
});

function IndexPage() {
  const { projects, skills } = Route.useLoaderData();
  const navigate = useNavigate();
  const projectList = (projects ?? []) as any[];
  const skillList = (skills ?? []) as Array<{
    id: string;
    name: string;
    description: string;
  }>;

  // First-time user: no projects → show setup flow directly
  if (projectList.length === 0) {
    return (
      <div style={{ minHeight: "100vh" }}>
        <SetupWorkspace availableSkills={skillList} />
      </div>
    );
  }

  const handleCreateProject = async (name: string) => {
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
      projects={projectList}
      onSelectProject={(id) =>
        navigate({ to: "/$projectId", params: { projectId: id } })
      }
      onCreateProject={handleCreateProject}
    />
  );
}
