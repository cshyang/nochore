import { createFileRoute, redirect } from "@tanstack/react-router";
import { createBlankAgent } from "~/server/agents";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const result = await createBlankAgent({ data: { projectId: params.projectId } });
    const agentId = (result as { id: string }).id;
    throw redirect({
      to: "/$projectId/agents/$agentId",
      params: { projectId: params.projectId, agentId },
    });
  },
});
