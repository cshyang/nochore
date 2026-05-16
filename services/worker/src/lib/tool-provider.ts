import { type AgentToolDefinition, getGoogleAdsAgentTools } from "@nochore/harness";
import { logger } from "@trigger.dev/sdk";
import type { AgentProviderBinding } from "./agent-runtime";
import { getComposioAgentTools } from "./composio-agent-tools";

export interface ToolProviderContext {
  userId: string;
  activeProviders: string[];
  providerConfigs: Record<string, Record<string, unknown>>;
  providerBindings?: AgentProviderBinding[];
}

interface ToolProviderDeps {
  getComposioAgentTools: typeof getComposioAgentTools;
  getGoogleAdsAgentTools: typeof getGoogleAdsAgentTools;
  warn: (message: string) => void;
}

const defaultDeps: ToolProviderDeps = {
  getComposioAgentTools,
  getGoogleAdsAgentTools,
  warn: (message) => logger.warn(message),
};

// Runtime-local tool provider seam. This keeps provider-specific routing out of the run loop
// without pretending we have a general-purpose framework adapter yet.
export async function listProviderTools(
  context: ToolProviderContext,
  deps: ToolProviderDeps = defaultDeps,
): Promise<AgentToolDefinition[]> {
  const tools: AgentToolDefinition[] = [];
  const composioProviders = context.activeProviders;

  if (composioProviders.length > 0) {
    tools.push(
      ...(await deps.getComposioAgentTools({
        userId: context.userId,
        toolkits: composioProviders,
        providerConfigs: context.providerConfigs,
        providerBindings: context.providerBindings,
      })),
    );
  }

  tools.push(...getCustomGoogleAdsTools(context, deps));

  return tools;
}

function getCustomGoogleAdsTools(context: ToolProviderContext, deps: ToolProviderDeps): AgentToolDefinition[] {
  const bindings = resolveGoogleAdsBindings(context);
  const useAliasedToolName = bindings.length > 1;
  return bindings.flatMap((binding) => {
    const customerId = getGoogleAdsCustomerId(binding.config);
    if (!customerId) {
      deps.warn(`Skipping custom Google Ads tools for ${binding.alias}: missing selectedCustomerId`);
      return [];
    }

    const tools = deps.getGoogleAdsAgentTools({
      customerId,
      refreshToken: getOptionalString(binding.config.refreshToken),
      managerCustomerId: getOptionalString(binding.config.managerCustomerId ?? binding.config.loginCustomerId),
    });

    return tools.map((tool) => ({
      ...tool,
      name: useAliasedToolName ? toBindingToolName(tool.name, binding.alias) : tool.name,
      label: useAliasedToolName ? `${tool.label} (${binding.alias})` : tool.label,
      description: [
        tool.description,
        "",
        `Google Ads customer ID: ${formatGoogleAdsCustomerId(customerId)}.`,
        "This is a Nochore custom Google Ads adapter tool exposed alongside Composio tools.",
      ].join("\n"),
    }));
  });
}

function resolveGoogleAdsBindings(context: ToolProviderContext): AgentProviderBinding[] {
  const explicit = context.providerBindings?.filter((binding) => binding.provider === "googleads") ?? [];
  if (explicit.length > 0) return explicit;
  const config = context.providerConfigs.googleads;
  if (!config || !context.activeProviders.includes("googleads")) return [];
  return [
    {
      id: "googleads",
      provider: "googleads",
      alias: "googleads",
      connectionId: String(config.connectionId ?? "googleads"),
      config,
    } satisfies AgentProviderBinding,
  ];
}

function getGoogleAdsCustomerId(config: Record<string, unknown> | undefined): string | null {
  const value = config?.selectedCustomerId ?? config?.customerId ?? config?.resourceId;
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length === 10 ? digits : null;
}

function getOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function toBindingToolName(toolName: string, alias: string): string {
  const provider = toolName.split("_")[0] ?? "tool";
  const suffix = toolName.slice(provider.length).replace(/^_+/, "");
  const normalizedAlias = alias
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return [provider, normalizedAlias, suffix].filter(Boolean).join("_");
}
