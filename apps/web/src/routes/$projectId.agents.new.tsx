import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { OnboardingChat } from "~/components/OnboardingChat";
import { fetchToolkitSummaries, listConnections } from "~/server/connections";
import type { ToolkitSummary } from "~/server/onboard-prompt";
import { listAvailableSkills } from "~/server/skills";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const [skills, connections, toolkitSummaries] = await Promise.all([
      listAvailableSkills(),
      listConnections({ data: { projectId: params.projectId } }).catch(() => []),
      fetchToolkitSummaries({ data: { projectId: params.projectId } }).catch(() => []),
    ]);
    return { skills, connections, toolkitSummaries };
  },
  component: NewAgentPage,
});

function NewAgentPage() {
  const { projectId } = useParams({ from: "/$projectId/agents/new" });
  const navigate = useNavigate();
  const { skills, connections, toolkitSummaries } = Route.useLoaderData();

  const availableSkills = (skills ?? []) as Array<{ id: string; name: string; description: string }>;
  const existingConnections = ((connections ?? []) as Array<{ provider: string; status: string }>)
    .filter((c) => c.status === "active")
    .map((c) => c.provider);

  return (
    <OnboardingChat
      projectId={projectId}
      availableSkills={availableSkills}
      existingConnections={existingConnections}
      toolkitSummaries={(toolkitSummaries ?? []) as ToolkitSummary[]}
      onBack={() => navigate({ to: "/$projectId", params: { projectId } })}
    />
  );
}
