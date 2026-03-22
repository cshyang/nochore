import { createFileRoute } from "@tanstack/react-router";
import { SetupWorkspace } from "~/components/SetupWorkspace";
import { getProject } from "~/server/projects";
import { listAvailableSkills } from "~/server/skills";
import type { ProjectView } from "~/lib/types";

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
  const { project: rawProject, skills: rawSkills } = Route.useLoaderData();
  const project = rawProject as ProjectView | null;
  const skills = (rawSkills ?? []) as Array<{
    id: string;
    name: string;
    description: string;
  }>;

  return (
    <SetupWorkspace
      projectId={project?.id}
      project={project}
      availableSkills={skills}
    />
  );
}
