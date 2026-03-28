import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { OnboardingChat } from "~/components/OnboardingChat";
import { listAvailableSkills } from "~/server/skills";
import { listConnections, fetchComposioToolCatalog } from "~/server/connections";
import type { ComposioToolMeta } from "~/server/connections";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const [skills, connections, toolCatalog] = await Promise.all([
      listAvailableSkills(),
      listConnections({ data: { projectId: params.projectId } }).catch(() => []),
      fetchComposioToolCatalog({ data: { projectId: params.projectId } }).catch(() => []),
    ]);
    return { skills, connections, toolCatalog };
  },
  component: NewAgentPage,
});

function NewAgentPage() {
  const { projectId } = useParams({ from: "/$projectId/agents/new" });
  const navigate = useNavigate();
  const { skills, connections, toolCatalog } = Route.useLoaderData();

  const availableSkills = ((skills ?? []) as Array<{ id: string; name: string; description: string }>);
  const existingConnections = ((connections ?? []) as Array<{ provider: string; status: string }>)
    .filter((c) => c.status === "active")
    .map((c) => c.provider);

  return (
    <OnboardingChat
      projectId={projectId}
      availableSkills={availableSkills}
      existingConnections={existingConnections}
      toolCatalog={(toolCatalog ?? []) as ComposioToolMeta[]}
      onBack={() => navigate({ to: "/$projectId", params: { projectId } })}
    />
  );
}
