import { createComposioAdapter } from "@nochore/harness";
import { TOOLKIT_CATALOG_PROVIDER_SLUGS } from "../lib/provider-metadata";

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
    const adapter = await createComposioAdapter();

    const results = await Promise.all(
      TOOLKIT_CATALOG_PROVIDER_SLUGS.map((provider) =>
        adapter
          .listToolkitCatalog({ toolkitSlug: provider, limit: 50 })
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
