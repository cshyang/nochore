import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { SetupFlow } from "~/components/SetupFlow";
import { getProject } from "~/server/projects";
import type { Project } from "~/lib/types";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const project = await getProject({ data: { projectId: params.projectId } });
    return { project };
  },
  component: NewAgentPage,
});

function NewAgentPage() {
  const navigate = useNavigate();
  const { project: rawProject } = Route.useLoaderData();
  const project = rawProject as Project | null;
  const projectId = project?.id ?? "";

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
