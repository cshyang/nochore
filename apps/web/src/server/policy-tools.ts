import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getGoogleAdsToolsForPi } from "../../../../packages/harness/src/connections/google-ads/tools";
import { connections } from "../../../../packages/harness/src/db/schema";
import { buildToolConfigEntry } from "../../../../packages/harness/src/policy";
import type { ToolConfigEntry } from "../../../../packages/harness/src/types";
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

  const activeProviders = new Set(activeConnections.map((connection) => connection.provider));
  const entries: ToolConfigEntry[] = [];

  if (activeProviders.has("googleads")) {
    const googleAdsConnection = activeConnections.find((connection) => connection.provider === "googleads");
    const config = parseConfig(googleAdsConnection?.config);
    const customerId = typeof config.customerId === "string" && config.customerId ? config.customerId : "preview";

    entries.push(
      ...getGoogleAdsToolsForPi({ customerId }).map((tool) =>
        buildToolConfigEntry({
          toolName: tool.name,
          slug: tool.name,
          provider: "googleads",
          title: tool.label,
          description: tool.description,
        }),
      ),
    );
  }

  const composioProviders = [...activeProviders].filter((provider) => provider !== "googleads");
  if (composioProviders.length > 0) {
    const composioTools = await listComposioToolCatalogForProject(projectId);
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

function parseConfig(value: string | null): Record<string, unknown> {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}
