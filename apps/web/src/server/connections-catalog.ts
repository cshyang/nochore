import { createComposioAdapter } from "@nochore/harness";
import { TOOLKIT_CATALOG_PROVIDER_SLUGS } from "../lib/provider-metadata";

const COMPOSIO_TOOL_CATALOG_PAGE_SIZE = 1000;
const COMPOSIO_TOOL_CATALOG_MAX_ITEMS_PER_PROVIDER = 5000;

export interface ComposioToolMeta {
  slug: string;
  name: string;
  description: string;
  provider: string;
  providerName: string;
  providerLogo: string | null;
  tags: string[];
}

export async function listComposioToolCatalogForProject(
  _projectId: string,
  providers: readonly string[] = TOOLKIT_CATALOG_PROVIDER_SLUGS,
): Promise<ComposioToolMeta[]> {
  try {
    const adapter = await createComposioAdapter();

    const results = await Promise.all(
      providers.map((provider) =>
        adapter
          .listToolkitCatalog({
            toolkitSlug: provider,
            limit: COMPOSIO_TOOL_CATALOG_PAGE_SIZE,
            maxItems: COMPOSIO_TOOL_CATALOG_MAX_ITEMS_PER_PROVIDER,
          })
          .then((items) =>
            items.map((tool) => ({
              slug: tool.slug,
              name: tool.name,
              description: tool.description ?? tool.human_description ?? "",
              provider,
              providerName: tool.toolkit?.name ?? provider,
              providerLogo: tool.toolkit?.logo ?? null,
              tags: tool.tags ?? [],
            })),
          )
          .catch(() => [] as ComposioToolMeta[]),
      ),
    );

    return results.flat();
  } catch {
    return [];
  }
}
