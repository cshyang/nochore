/**
 * Bridge between Composio tools and agent tool definitions.
 *
 * Goes through ComposioAdapter (harness) rather than calling @composio/core directly.
 * Each Composio tool becomes an AgentToolDefinition that the agent can call like any
 * built-in tool.
 */

import { type AgentToolDefinition, type ComposioAdapter, createComposioAdapter } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk";
import type { AgentProviderBinding } from "./agent-runtime";

let _adapter: Promise<ComposioAdapter> | null = null;

function getAdapter(): Promise<ComposioAdapter> {
  if (!_adapter) {
    _adapter = createComposioAdapter();
  }
  return _adapter;
}

export async function getComposioAgentTools(params: {
  userId: string;
  toolkits: string[];
  providerConfigs?: Record<string, Record<string, unknown>>;
  providerBindings?: AgentProviderBinding[];
}): Promise<AgentToolDefinition[]> {
  if (!params.toolkits.length) return [];

  const adapter = await getAdapter();
  const rawTools = await adapter.getRawTools({
    userId: params.userId,
    toolkits: params.toolkits,
    important: false,
    limit: 100,
  });

  logger.info("Composio tools fetched for agent execution", {
    userId: params.userId,
    toolkits: params.toolkits,
    toolCount: rawTools.length,
    toolNames: rawTools.map((t) => t.slug),
  });

  return rawTools.flatMap((tool) => {
    const provider = inferProviderFromToolSlug(tool.slug);
    const providerBindings =
      params.providerBindings?.filter((binding) => binding.provider === provider) ??
      (params.providerConfigs?.[provider]
        ? [
            {
              id: provider,
              provider,
              alias: provider,
              connectionId: String(params.providerConfigs[provider].connectionId ?? provider),
              config: params.providerConfigs[provider],
            } satisfies AgentProviderBinding,
          ]
        : []);
    if (providerBindings.length === 0) {
      return [];
    }
    const useAliasedToolName = providerBindings.length > 1;
    return providerBindings.map((binding) => ({
      name: useAliasedToolName ? toBindingToolName(tool.slug, binding.alias) : tool.slug,
      label: useAliasedToolName ? `${tool.name} (${binding.alias})` : tool.name,
      description: withProviderScope(tool.description, provider, binding),
      parameters: tool.inputParameters ?? tool.inputSchema ?? tool.parameters ?? { type: "object", properties: {} },
      execute: async (_toolCallId: string, toolParams: Record<string, unknown>) => {
        const connectedAccountId = binding.composioConnectedAccountId ?? getConnectedAccountId(binding.config);
        logger.info(`Composio tool executing: ${tool.slug}`, {
          inputPreview: JSON.stringify(toolParams).slice(0, 500),
          connectedAccountId,
          bindingAlias: binding.alias,
          selectedCustomerId: getSelectedCustomerId(binding.config),
        });

        try {
          const result = await adapter.execute({
            userId: params.userId,
            toolSlug: tool.slug,
            args: toolParams,
            connectedAccountId,
          });

          const output = JSON.stringify(result.data ?? result);
          logger.info(`Composio tool completed: ${tool.slug}`, {
            successful: result.successful ?? true,
            outputPreview: output.slice(0, 500),
          });

          return {
            content: [{ type: "text" as const, text: output }],
            details: { successful: result.successful ?? true, error: result.error ?? null },
          };
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          logger.error(`Composio tool failed: ${tool.slug}`, { error: errorMsg });
          return {
            content: [{ type: "text" as const, text: `Error executing ${tool.slug}: ${errorMsg}` }],
            details: { successful: false, error: errorMsg },
          };
        }
      },
    }));
  });
}

function inferProviderFromToolSlug(slug: string): string {
  const index = slug.indexOf("_");
  return (index === -1 ? slug : slug.slice(0, index)).toLowerCase();
}

function getConnectedAccountId(config: Record<string, unknown> | undefined): string | undefined {
  return typeof config?.composioConnectedAccountId === "string" ? config.composioConnectedAccountId : undefined;
}

function getSelectedCustomerId(config: Record<string, unknown> | undefined): string | undefined {
  const value = config?.selectedCustomerId ?? config?.customerId;
  return typeof value === "string" ? value.replace(/\D/g, "") : undefined;
}

function withProviderScope(description: string, provider: string, binding: AgentProviderBinding): string {
  const scope = [
    `Agent connection binding: ${binding.alias}.`,
    binding.accountLabel ? `Authenticated account: ${binding.accountLabel}.` : "",
  ].filter(Boolean);
  const selectedCustomerId = getSelectedCustomerId(binding.config);
  if (provider === "googleads" && selectedCustomerId) {
    scope.push(
      `Google Ads customer ID: ${formatGoogleAdsCustomerId(selectedCustomerId)}. Use this account for this binding.`,
    );
  }
  return scope.length > 0 ? `${description}\n\n${scope.join("\n")}` : description;
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toBindingToolName(slug: string, alias: string): string {
  const provider = inferProviderFromToolSlug(slug);
  const suffix = slug.slice(provider.length).replace(/^_+/, "");
  const normalizedAlias = alias
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return [provider, normalizedAlias, suffix].filter(Boolean).join("_");
}
