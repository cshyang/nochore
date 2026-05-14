// Thin typed wrapper over the Composio SDK.
// Wraps only the three calls production code makes today: execute a tool,
// fetch raw tool metadata, list a toolkit catalog. Downstream code should
// depend on `ComposioAdapter` (interface) rather than the Composio SDK directly.

import { createComposioClient } from "./composio";

export interface ComposioRawTool {
  slug: string;
  name: string;
  description: string;
  inputParameters?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  parameters?: Record<string, unknown>;
}

export interface ComposioExecuteResult {
  data?: unknown;
  error?: string | null;
  successful?: boolean;
}

export interface ComposioCatalogEntry {
  slug: string;
  name: string;
  description?: string;
  human_description?: string;
  toolkit?: { name?: string; logo?: string | null };
  tags?: string[];
}

export interface ComposioAdapter {
  execute(params: {
    userId: string;
    toolSlug: string;
    args: Record<string, unknown>;
    connectedAccountId?: string;
  }): Promise<ComposioExecuteResult>;

  getRawTools(params: {
    userId: string;
    toolkits: string[];
    limit?: number;
    important?: boolean;
  }): Promise<ComposioRawTool[]>;

  listToolkitCatalog(params: {
    toolkitSlug: string;
    limit?: number;
    maxItems?: number;
  }): Promise<ComposioCatalogEntry[]>;
}

interface ComposioCatalogClient {
  client: {
    tools: {
      list(input: {
        toolkit_slug: string;
        limit: number;
        cursor?: string;
      }): Promise<{ items?: ComposioCatalogEntry[]; next_cursor?: string | null }>;
    };
  };
}

const MAX_COMPOSIO_PAGE_SIZE = 1000;
const DEFAULT_COMPOSIO_CATALOG_MAX_ITEMS = 5000;

export async function createComposioAdapter(opts?: { apiKey?: string }): Promise<ComposioAdapter> {
  const composio = await createComposioClient(opts?.apiKey);
  const catalogClient = (composio as unknown as ComposioCatalogClient).client;

  return {
    async execute({ userId, toolSlug, args, connectedAccountId }) {
      return (await composio.tools.execute(toolSlug, {
        userId,
        ...(connectedAccountId ? { connectedAccountId } : {}),
        arguments: args,
        dangerouslySkipVersionCheck: true,
      })) as ComposioExecuteResult;
    },

    async getRawTools({ toolkits, limit = 100, important = false }) {
      if (toolkits.length === 0) return [];
      return (await composio.tools.getRawComposioTools({
        toolkits,
        important,
        limit,
      })) as ComposioRawTool[];
    },

    async listToolkitCatalog({
      toolkitSlug,
      limit = MAX_COMPOSIO_PAGE_SIZE,
      maxItems = DEFAULT_COMPOSIO_CATALOG_MAX_ITEMS,
    }) {
      const pageSize = Math.min(Math.max(limit, 1), MAX_COMPOSIO_PAGE_SIZE);
      const items: ComposioCatalogEntry[] = [];
      let cursor: string | undefined;

      do {
        const result = await catalogClient.tools.list({ toolkit_slug: toolkitSlug, limit: pageSize, cursor });
        items.push(...(result.items ?? []));
        cursor = result.next_cursor ?? undefined;
      } while (cursor && items.length < maxItems);

      return items.slice(0, maxItems);
    },
  };
}
