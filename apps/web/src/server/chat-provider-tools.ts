import { type AgentToolDefinition, createComposioAdapter } from "@nochore/harness";
import { jsonSchema } from "ai";
import { z } from "zod";

type ConnectionRow = {
  id: string;
  provider: string;
  composioEntityId: string | null;
  status: string;
  config: string | null;
  authorizedByUserId: string | null;
  createdAt: number;
  updatedAt: number;
};

type BindingRow = {
  id: string;
  agentId: string;
  provider: string;
  connectionId: string;
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
  alias: string;
  purpose?: string;
  isDefault: boolean;
  status: string;
  config: Record<string, unknown>;
};

type ChatProviderBinding = {
  id: string;
  provider: string;
  alias: string;
  connection: ConnectionRow;
  config: Record<string, unknown>;
  accountLabel?: string;
  resourceType?: string;
  resourceId?: string;
  resourceLabel?: string;
};

type ChatTool = {
  description: string;
  inputSchema: unknown;
  execute?: (input: Record<string, unknown>) => Promise<unknown> | unknown;
};

const INTERNAL_TOOL_NAMES = new Set([
  "trigger_run",
  "request_input",
  "review_findings",
  "search_tools",
  "add_provider",
  "update_config",
  "inspect_connections",
  "list_connected_tools",
]);
const COMPOSIO_RAW_TOOL_LIMIT = 1000;

export async function buildChatProviderTools(params: {
  userId: string;
  connections: ConnectionRow[];
  bindings?: BindingRow[];
}): Promise<Record<string, ChatTool>> {
  const activeConnections = params.connections.filter((connection) => connection.status === "active");
  const providerBindings = resolveChatProviderBindings(activeConnections, params.bindings ?? []);
  const activeProviders = Array.from(new Set(providerBindings.map((binding) => binding.provider)));
  const tools: Record<string, ChatTool> = {
    inspect_connections: {
      description:
        "Inspect this agent's connected systems and redacted connection metadata. Use this before answering questions about which providers/accounts are connected.",
      inputSchema: z.object({}),
      execute: () => ({
        connections: activeConnections.map((connection) => {
          const config = parseConfig(connection.config);
          return {
            id: connection.id,
            provider: connection.provider,
            connector: connection.composioEntityId ? "composio" : "direct_or_legacy",
            status: connection.status,
            connectedAccountId: connection.composioEntityId,
            authorizedByUserId: connection.authorizedByUserId,
            accountLabel: getAccountLabel(connection, config),
            config: redactConfig(config),
            createdAt: connection.createdAt,
            updatedAt: connection.updatedAt,
          };
        }),
        bindings: providerBindings.map((binding) => ({
          id: binding.id,
          provider: binding.provider,
          alias: binding.alias,
          connectionId: binding.connection.id,
          accountLabel: binding.accountLabel,
          resourceType: binding.resourceType,
          resourceId: binding.resourceId,
          resourceLabel: binding.resourceLabel,
        })),
      }),
    },
    list_connected_tools: {
      description:
        "List the provider tools currently available to this chat session. Use this to discover exact connected tool names before calling provider tools.",
      inputSchema: z.object({
        provider: z.string().optional().describe("Optional provider slug to filter by, e.g. googleads"),
      }),
      execute: async (input: { provider?: string }) => {
        const provider = input.provider?.trim();
        const providerSet = provider ? new Set([provider]) : null;
        const providerTools = await loadProviderTools(params.userId, activeProviders, providerBindings);
        return providerTools
          .filter((tool) => !providerSet || providerSet.has(inferProviderFromTool(tool.name)))
          .map((tool) => ({
            name: toChatToolName(tool.name),
            provider: inferProviderFromTool(tool.name),
            originalSlug: tool.name,
            title: tool.label,
            description: tool.description,
          }));
      },
    },
  };

  const providerTools = await loadProviderTools(params.userId, activeProviders, providerBindings).catch(() => []);
  for (const providerTool of providerTools) {
    const name = toChatToolName(providerTool.name);
    if (INTERNAL_TOOL_NAMES.has(name) || tools[name]) {
      continue;
    }
    tools[name] = wrapProviderTool(providerTool);
  }

  return tools;
}

async function loadProviderTools(
  userId: string,
  providers: string[],
  providerBindings: ChatProviderBinding[],
): Promise<AgentToolDefinition[]> {
  if (providers.length === 0) return [];
  const adapter = await createComposioAdapter();
  const rawTools = await adapter.getRawTools({
    userId,
    toolkits: providers,
    important: false,
    limit: COMPOSIO_RAW_TOOL_LIMIT,
  });

  return rawTools.flatMap((tool) => {
    const provider = inferProviderFromTool(tool.slug);
    const bindings = providerBindings.filter((binding) => binding.provider === provider);
    const useAliasedToolName = bindings.length > 1;
    return bindings.map((binding) => ({
      name: useAliasedToolName ? toBindingToolName(tool.slug, binding.alias) : tool.slug,
      label: useAliasedToolName ? `${tool.name} (${binding.alias})` : tool.name,
      description: withProviderScope(tool.description, binding),
      parameters: tool.inputParameters ?? tool.inputSchema ?? tool.parameters ?? { type: "object", properties: {} },
      execute: async (_toolCallId: string, toolParams: Record<string, unknown>) => {
        const result = await adapter.execute({
          userId,
          toolSlug: tool.slug,
          args: toolParams,
          connectedAccountId: binding.connection.composioEntityId ?? undefined,
        });
        return {
          content: [{ type: "text" as const, text: stringifyToolResult(result.data ?? result) }],
          details: { successful: result.successful ?? true, error: result.error ?? null },
        };
      },
    }));
  });
}

function wrapProviderTool(tool: AgentToolDefinition): ChatTool {
  return {
    description: [
      tool.description,
      "",
      `Original provider tool slug: ${tool.name}.`,
      "Use directly only for bounded, immediate work. If the task is broad, slow, multi-step, or should create a durable report, use trigger_run instead.",
    ].join("\n"),
    inputSchema: jsonSchema(tool.parameters as never),
    execute: async (input: Record<string, unknown>) => {
      try {
        const result = await tool.execute(`chat-${Date.now()}`, input);
        const text = result.content.map((part) => part.text).join("\n");
        return {
          ok: result.details.successful ?? true,
          output: truncate(text, 12_000),
          details: result.details,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

function toChatToolName(slug: string): string {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 96);
}

function inferProviderFromTool(toolName: string): string {
  const index = toolName.indexOf("_");
  return (index === -1 ? toolName : toolName.slice(0, index)).toLowerCase();
}

function parseConfig(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const redacted = { ...config };
  for (const key of Object.keys(redacted)) {
    if (/token|secret|password|key/i.test(key)) {
      redacted[key] = "<redacted>";
    }
  }
  return redacted;
}

function getSelectedCustomerId(config: Record<string, unknown> | undefined): string | undefined {
  const value = config?.selectedCustomerId ?? config?.customerId;
  return typeof value === "string" ? value.replace(/\D/g, "") : undefined;
}

function withProviderScope(description: string, binding: ChatProviderBinding): string {
  const scope = [
    `Agent connection binding: ${binding.alias}.`,
    binding.accountLabel ? `Authenticated account: ${binding.accountLabel}.` : "",
  ].filter(Boolean);
  const selectedCustomerId = getSelectedCustomerId(binding.config);
  if (binding.provider === "googleads" && selectedCustomerId) {
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

function stringifyToolResult(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n...[truncated ${value.length - maxLength} chars; use trigger_run for full analysis]`;
}

function resolveChatProviderBindings(connections: ConnectionRow[], bindings: BindingRow[]): ChatProviderBinding[] {
  const activeById = new Map(connections.map((connection) => [connection.id, connection]));
  const explicit: ChatProviderBinding[] = [];
  for (const binding of bindings) {
    if (binding.status !== "active") continue;
    const connection = activeById.get(binding.connectionId);
    if (!connection) continue;
    const connectionConfig = parseConfig(connection.config);
    explicit.push({
      id: binding.id,
      provider: binding.provider,
      alias: binding.alias,
      connection,
      config: {
        ...connectionConfig,
        ...binding.config,
        connectionId: connection.id,
        bindingId: binding.id,
        alias: binding.alias,
        ...(connection.composioEntityId ? { composioConnectedAccountId: connection.composioEntityId } : {}),
        ...(binding.resourceId ? { selectedCustomerId: binding.resourceId, resourceId: binding.resourceId } : {}),
        ...(binding.resourceLabel
          ? { selectedCustomerLabel: binding.resourceLabel, resourceLabel: binding.resourceLabel }
          : {}),
        ...(binding.resourceType ? { resourceType: binding.resourceType } : {}),
      },
      accountLabel: getAccountLabel(connection, connectionConfig),
      resourceType: binding.resourceType,
      resourceId: binding.resourceId,
      resourceLabel: binding.resourceLabel,
    });
  }

  if (explicit.length > 0) {
    return explicit;
  }

  return connections.filter(isUsableImplicitConnection).map((connection) => {
    const config = parseConfig(connection.config);
    const resourceId = connection.provider === "googleads" ? getSelectedCustomerId(config) : undefined;
    const resourceLabel = resourceId ? formatGoogleAdsCustomerId(resourceId) : undefined;
    return {
      id: `implicit:${connection.id}`,
      provider: connection.provider,
      alias: defaultBindingAlias(connection.provider, resourceId ?? null),
      connection,
      config: {
        ...config,
        connectionId: connection.id,
        alias: defaultBindingAlias(connection.provider, resourceId ?? null),
        ...(connection.composioEntityId ? { composioConnectedAccountId: connection.composioEntityId } : {}),
        ...(resourceId ? { selectedCustomerId: resourceId, resourceId } : {}),
        ...(resourceLabel ? { selectedCustomerLabel: resourceLabel, resourceLabel } : {}),
      },
      accountLabel: getAccountLabel(connection, config),
      resourceType: resourceId ? "google_ads_customer" : undefined,
      resourceId,
      resourceLabel,
    };
  });
}

function isUsableImplicitConnection(connection: ConnectionRow): boolean {
  if (connection.provider !== "googleads") {
    return true;
  }
  return Boolean(getSelectedCustomerId(parseConfig(connection.config)));
}

function getAccountLabel(connection: ConnectionRow, config: Record<string, unknown>): string | undefined {
  const value = config.accountLabel ?? config.email ?? config.loginEmail ?? config.selectedCustomerLabel;
  return typeof value === "string" && value.trim() ? value : (connection.composioEntityId ?? undefined);
}

function defaultBindingAlias(provider: string, resourceId: string | null): string {
  if (provider === "googleads" && resourceId) return `googleads_${resourceId.replace(/\D/g, "")}`;
  return provider;
}

function toBindingToolName(slug: string, alias: string): string {
  const provider = inferProviderFromTool(slug);
  const suffix = slug.slice(provider.length).replace(/^_+/, "");
  const normalizedAlias = alias
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return [provider, normalizedAlias, suffix].filter(Boolean).join("_");
}
