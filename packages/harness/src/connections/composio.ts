import type { Composio } from "@composio/core";
import type { ExecutionResult } from "../types/action";
import type { ConnectionHealth, ConnectionManager } from "./types";

// ---------------------------------------------------------------------------
// ComposioToolMapping — maps a harness data type to a Composio tool slug
// ---------------------------------------------------------------------------

export interface ComposioToolMapping {
  /** Composio tool slug, e.g. "GOOGLEADS_SEARCH_TERMS_REPORT" */
  toolSlug: string;
  /** Default input params for the tool */
  defaultParams?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Default data type → Composio tool slug mappings (Google Ads)
// ---------------------------------------------------------------------------

export const DEFAULT_DATA_TYPE_MAPPINGS: Record<string, ComposioToolMapping> = {
  search_terms: {
    toolSlug: "GOOGLEADS_SEARCH_TERMS_REPORT",
  },
  ad_metrics: {
    toolSlug: "GOOGLEADS_CAMPAIGN_PERFORMANCE",
  },
  budget_data: {
    toolSlug: "GOOGLEADS_CAMPAIGN_BUDGETS",
  },
  impression_share: {
    toolSlug: "GOOGLEADS_IMPRESSION_SHARE",
  },
  quality_scores: {
    toolSlug: "GOOGLEADS_QUALITY_SCORES",
  },
};

// ---------------------------------------------------------------------------
// createComposioClient — factory for the Composio SDK instance
// ---------------------------------------------------------------------------

export async function createComposioClient(apiKey?: string): Promise<Composio> {
  const { Composio: ComposioClass } = await import("@composio/core");
  const { VercelProvider } = await import("@composio/vercel");

  return new ComposioClass({
    apiKey: apiKey ?? process.env.COMPOSIO_API_KEY,
    provider: new VercelProvider(),
  });
}

// ---------------------------------------------------------------------------
// ComposioConnectionManager — implements ConnectionManager using Composio SDK
// ---------------------------------------------------------------------------

export class ComposioConnectionManager implements ConnectionManager {
  constructor(
    private composio: Composio,
    private userId: string,
    private dataTypeMapping: Record<string, ComposioToolMapping>,
  ) {}

  async fetch(dataTypeId: string): Promise<unknown> {
    const mapping = this.dataTypeMapping[dataTypeId];
    if (!mapping) {
      throw new Error(
        `No Composio mapping for data type: ${dataTypeId}`,
      );
    }

    const result = await this.composio.tools.execute(mapping.toolSlug, {
      arguments: mapping.defaultParams ?? {},
      userId: this.userId,
      dangerouslySkipVersionCheck: true,
    });
    return result.data;
  }

  async execute(
    action: string,
    toolCategory: string,
    args: Record<string, unknown>,
  ): Promise<ExecutionResult> {
    const toolSlug = this.resolveToolSlug(action, toolCategory);
    try {
      const result = await this.composio.tools.execute(toolSlug, {
        arguments: args,
        userId: this.userId,
        dangerouslySkipVersionCheck: true,
      });
      return {
        proposalId: "", // caller fills this in
        status: "executed",
        output: result.data,
        executedAt: new Date(),
      };
    } catch (err) {
      return {
        proposalId: "",
        status: "failed",
        error: (err as Error).message,
        executedAt: new Date(),
      };
    }
  }

  availableDataTypes(): string[] {
    return Object.keys(this.dataTypeMapping);
  }

  async getHealth(): Promise<ConnectionHealth[]> {
    return [
      {
        connectionId: `composio-${this.userId}`,
        provider: "composio",
        status: "active",
        lastChecked: new Date(),
      },
    ];
  }

  private resolveToolSlug(action: string, toolCategory: string): string {
    // Convention: TOOLCATEGORY_ACTION in uppercase
    // e.g., action="get_search_terms", toolCategory="google_ads" → "GOOGLEADS_GET_SEARCH_TERMS"
    const category = toolCategory.replace(/_/g, "").toUpperCase();
    const actionSlug = action.toUpperCase();
    return `${category}_${actionSlug}`;
  }
}

// ---------------------------------------------------------------------------
// getComposioToolsForChat — returns AI SDK-native tools for the chat agent
// ---------------------------------------------------------------------------

export async function getComposioToolsForChat(
  composio: Composio,
  userId: string,
): Promise<Record<string, unknown>> {
  const session = await composio.create(userId);
  return (await session.tools()) as Record<string, unknown>;
}
