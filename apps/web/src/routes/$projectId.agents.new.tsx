import { createFileRoute, redirect } from "@tanstack/react-router";
import { createDraftAgent } from "~/server/agents";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const result = await createDraftAgent({
      data: {
        projectId: params.projectId,
        name: "Untitled Agent",
        description: "",
        instructions: "",
        skills: [],
        schedule: "manual",
      },
    });
    const agentId = (result as { id: string }).id;
    throw redirect({
      to: "/$projectId/agents/$agentId",
      params: { projectId: params.projectId, agentId },
    });
  },
});
