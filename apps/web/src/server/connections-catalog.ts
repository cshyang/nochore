import { createComposioClient } from "@nochore/harness";
import { TOOLKIT_CATALOG_PROVIDER_SLUGS } from "../lib/provider-metadata";

interface ComposioCatalogTool {
  slug: string;
  name: string;
  description?: string;
  human_description?: string;
  toolkit?: {
    name?: string;
    logo?: string | null;
  };
  tags?: string[];
}

interface ComposioCatalogClient {
  client: {
    tools: {
      list(input: { toolkit_slug: string; limit: number }): Promise<{ items?: ComposioCatalogTool[] }>;
    };
  };
}

export interface ComposioToolMeta {
  slug: string;
  name: string;
  description: string;
  provider: string;
  providerName: string;
  providerLogo: string | null;
  tags: string[];
}

export async function listComposioToolCatalogForProject(_projectId: string): Promise<ComposioToolMeta[]> {
  try {
    const composio = await createComposioClient();
    const catalogClient = (composio as unknown as ComposioCatalogClient).client;

    const results = await Promise.all(
      TOOLKIT_CATALOG_PROVIDER_SLUGS.map((provider) =>
        catalogClient.tools
          .list({ toolkit_slug: provider, limit: 50 })
          .then((res) => (res.items ?? []).map((tool) => toToolMeta(provider, tool)))
          .catch(() => [] as ComposioToolMeta[]),
      ),
    );

    return results.flat();
  } catch {
    return [];
  }
}

function toToolMeta(provider: string, tool: ComposioCatalogTool): ComposioToolMeta {
  return {
    slug: tool.slug,
    name: tool.name,
    description: tool.description ?? tool.human_description ?? "",
    provider,
    providerName: tool.toolkit?.name ?? provider,
    providerLogo: tool.toolkit?.logo ?? null,
    tags: tool.tags ?? [],
  };
}
