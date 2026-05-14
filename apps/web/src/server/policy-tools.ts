import type { ToolConfigEntry } from "@nochore/harness";
import { buildToolConfigEntry, connections } from "@nochore/harness";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { listComposioToolCatalogForProject } from "./connections-catalog";
import { getProjectDeps } from "./deps";
import { jsonSafe } from "./serializable";

export const getPolicyToolCatalog = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    return jsonSafe(await buildPolicyToolCatalog(projectId));
  });

async function buildPolicyToolCatalog(projectId: string): Promise<ToolConfigEntry[]> {
  const { db } = getProjectDeps(projectId);
  const activeConnections = db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .all()
    .filter((connection) => connection.status === "active");

  const activeProviders: Set<string> = new Set(
    activeConnections
      .map((connection) => connection.provider)
      .filter((provider): provider is string => typeof provider === "string" && provider.length > 0),
  );
  const entries: ToolConfigEntry[] = [];

  const composioProviders = [...activeProviders];
  if (composioProviders.length > 0) {
    const composioTools = await listComposioToolCatalogForProject(projectId, composioProviders);
    entries.push(
      ...composioTools
        .filter((tool) => activeProviders.has(tool.provider))
        .map((tool) =>
          buildToolConfigEntry({
            toolName: tool.slug,
            slug: tool.slug,
            provider: tool.provider,
            title: tool.name,
            description: tool.description,
            tags: tool.tags,
          }),
        ),
    );
  }

  return entries.sort((left, right) =>
    `${left.provider}:${left.title}`.localeCompare(`${right.provider}:${right.title}`),
  );
}
