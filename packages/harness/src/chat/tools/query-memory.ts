import { tool } from "ai";
import { z } from "zod";
import type { MemoryStore } from "../../types/memory";

export interface QueryMemoryDeps {
  memoryStore: MemoryStore;
  agentId: string;
}

export function createQueryMemoryTool(deps: QueryMemoryDeps) {
  return tool({
    description:
      "Query agent memory. Use type='lessons' to retrieve distilled knowledge, or type='events' to get recent raw event history.",
    parameters: z.object({
      type: z
        .enum(["events", "lessons"])
        .describe("What to query: 'lessons' for distilled knowledge, 'events' for raw event log"),
      scope: z
        .string()
        .optional()
        .describe("Optional scope to filter lessons (e.g., 'search_terms')"),
      limit: z
        .number()
        .optional()
        .describe("Max number of events to return (default 20, only for type='events')"),
    }),
    execute: async ({ type, scope, limit }) => {
      if (type === "lessons") {
        const lessons = await deps.memoryStore.getLessons(deps.agentId, scope);
        return { type: "lessons" as const, results: lessons };
      }

      const events = await deps.memoryStore.getRecentEvents(
        deps.agentId,
        limit ?? 20
      );
      return { type: "events" as const, results: events };
    },
  });
}
