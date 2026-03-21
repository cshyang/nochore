import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SetupFlow } from "~/components/SetupFlow";
import { getProject } from "~/server/projects";
import { listAvailableSkills } from "~/server/skills";
import type { Project } from "~/lib/types";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const [project, skills] = await Promise.all([
      getProject({ data: { projectId: params.projectId } }),
      listAvailableSkills(),
    ]);
    return { project, skills };
  },
  component: NewAgentPage,
});

function NewAgentPage() {
  const navigate = useNavigate();
  const { project: rawProject, skills: rawSkills } = Route.useLoaderData();
  const project = rawProject as Project | null;
  const skills = (rawSkills ?? []) as Array<{
    id: string;
    name: string;
    description: string;
  }>;
  const projectId = project?.id ?? "";

  return (
    <SetupFlow
      projectId={projectId}
      project={project}
      availableSkills={skills}
      onComplete={() =>
        navigate({ to: "/$projectId", params: { projectId } })
      }
    />
  );
}
