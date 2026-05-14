import crypto from "node:crypto";
import { agentConnectionBindings, connections } from "@nochore/harness";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import type { ComposioToolMeta } from "./connections-catalog";
import { getProjectDeps } from "./deps";
import { buildConnectionView } from "./models";
import { jsonSafe } from "./serializable";

type ProjectDb = ReturnType<typeof getProjectDeps>["db"];

interface ToolkitMetadataItem {
  slug: string;
  name: string;
  logo?: string;
  isNoAuth?: boolean;
  connection?: {
    isActive?: boolean;
    connectedAccount?: { id?: string; status?: string };
  };
}

export const initiateConnection = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; provider: string; callbackUrl: string }) => input)
  .handler(async ({ data }) => {
    const { createComposioClient, getComposioUserId } = await import("@nochore/harness");
    const connId = crypto.randomUUID().slice(0, 8);
    const callbackUrl = appendConnectionId(data.callbackUrl, connId);
    const composio = await createComposioClient();
    const userId = getComposioUserId(data.projectId);
    const authConfigId = await resolveAuthConfigId(composio, data.provider);
    const connectionRequest = authConfigId
      ? await composio.connectedAccounts.link(userId, authConfigId, { callbackUrl, allowMultiple: true })
      : await (
          await composio.create(userId, {
            manageConnections: false,
          })
        ).authorize(data.provider, {
          callbackUrl,
        });

    const { db } = getProjectDeps(data.projectId);
    const now = Date.now();
    db.insert(connections)
      .values({
        id: connId,
        projectId: data.projectId,
        provider: data.provider,
        composioEntityId: connectionRequest.id,
        status: "pending",
        config: JSON.stringify({ callbackUrl, authConfigId }),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return jsonSafe({
      connectionId: connId,
      composioConnectionId: connectionRequest.id,
      redirectUrl: connectionRequest.redirectUrl,
    });
  });

export const checkConnection = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string; provider: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const latest = getLatestConnection(db, data.projectId, data.provider);

    if (!latest) {
      return jsonSafe({ connected: false });
    }

    return jsonSafe({
      connected: latest.status === "active",
      status: latest.status,
      connectionId: latest.id,
    });
  });

export const pollComposioConnection = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string; provider: string; connectionId?: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const pending = getPendingConnection(db, data.projectId, data.provider, data.connectionId);

    if (!pending) {
      return jsonSafe({ connected: false, status: "no_pending" });
    }

    if (!pending.composioEntityId) {
      return jsonSafe({ connected: false, status: "no_composio_id" });
    }

    try {
      const { createComposioClient } = await import("@nochore/harness");
      const composio = await createComposioClient();
      const account = await composio.connectedAccounts.get(pending.composioEntityId);
      if (account.status === "ACTIVE") {
        activateProviderConnection(db, data.projectId, data.provider, pending.id);
        return jsonSafe({ connected: true, status: "active" });
      }

      return jsonSafe({
        connected: false,
        status: account.status?.toLowerCase() ?? "unknown",
      });
    } catch {
      return jsonSafe({ connected: false, status: "error" });
    }
  });

export const activateConnection = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; provider: string; connectionId?: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const pending = getPendingConnection(db, data.projectId, data.provider, data.connectionId);

    if (!pending) {
      return jsonSafe({ success: false, error: "No pending connection found" });
    }

    if (pending.composioEntityId) {
      try {
        const { createComposioClient } = await import("@nochore/harness");
        const composio = await createComposioClient();
        const account = await composio.connectedAccounts.get(pending.composioEntityId);
        if (account.status !== "ACTIVE") {
          return jsonSafe({ success: false, error: `Connection not yet active: ${account.status}` });
        }
      } catch {
        // If verification fails, fall back to marking active locally.
      }
    }

    activateProviderConnection(db, data.projectId, data.provider, pending.id);

    return jsonSafe({ success: true, connectionId: pending.id });
  });

export const getToolkitMetadata = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string; toolkits: string[] }) => input)
  .handler(async ({ data }) => {
    try {
      const { createComposioClient, getComposioUserId } = await import("@nochore/harness");
      const composio = await createComposioClient();
      const session = await composio.create(getComposioUserId(data.projectId), {
        toolkits: data.toolkits,
        manageConnections: false,
      });
      const { items } = await session.toolkits();
      return jsonSafe(
        items.map((toolkit: ToolkitMetadataItem) => ({
          id: toolkit.slug,
          name: toolkit.name,
          logo: toolkit.logo ?? null,
          isConnected: toolkit.connection?.isActive ?? false,
          isNoAuth: toolkit.isNoAuth ?? false,
          connectedAccountId: toolkit.connection?.connectedAccount?.id ?? null,
          accountStatus: toolkit.connection?.connectedAccount?.status ?? null,
        })),
      );
    } catch {
      return jsonSafe([]);
    }
  });

export const disconnectProvider = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; provider: string; connectedAccountId: string }) => input)
  .handler(async ({ data }) => {
    try {
      const { createComposioClient } = await import("@nochore/harness");
      const composio = await createComposioClient();
      await composio.connectedAccounts.delete(data.connectedAccountId);

      const { db } = getProjectDeps(data.projectId);
      setProviderConnectionStatus(db, data.projectId, data.provider, "active", "disconnected");

      return jsonSafe({ success: true });
    } catch {
      return jsonSafe({ success: false });
    }
  });

export const fetchComposioToolCatalog = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }): Promise<ComposioToolMeta[]> => {
    const { listComposioToolCatalogForProject } = await import("./connections-catalog");
    return listComposioToolCatalogForProject(projectId);
  });

type ToolkitSummary = {
  slug: string;
  name: string;
  description: string;
  categories: string[];
  logo: string | null;
};

// Toolkit summaries are near-static (new Composio integrations ship rarely) and
// project-agnostic (the projectId input is accepted for FormData consistency
// but not read). Cache the whole result per-process for an hour so navigation
// doesn't pay ~1s per Composio round-trip. Process restart / deploy evicts.
let toolkitSummariesCache: { data: ToolkitSummary[]; expires: number } | null = null;
const TOOLKIT_SUMMARIES_TTL_MS = 60 * 60 * 1000;
let toolkitSummariesInFlight: Promise<ToolkitSummary[]> | null = null;

async function loadToolkitSummaries(): Promise<ToolkitSummary[]> {
  const now = Date.now();
  if (toolkitSummariesCache && now < toolkitSummariesCache.expires) {
    return toolkitSummariesCache.data;
  }
  if (toolkitSummariesInFlight) {
    return toolkitSummariesInFlight;
  }
  toolkitSummariesInFlight = (async () => {
    try {
      const { createComposioClient } = await import("@nochore/harness");
      const { TOOLKIT_CATALOG_PROVIDER_SLUGS } = await import("../lib/provider-metadata");
      const composio = await createComposioClient();

      const results = await Promise.allSettled(
        TOOLKIT_CATALOG_PROVIDER_SLUGS.map((slug) =>
          composio.toolkits.get(slug).then(
            (tk): ToolkitSummary => ({
              slug: tk.slug,
              name: tk.name,
              description: (tk as unknown as { meta?: { description?: string } }).meta?.description ?? "",
              categories: (
                (tk as unknown as { meta?: { categories?: Array<{ slug: string; name: string }> } }).meta?.categories ??
                []
              ).map((c) => c.name),
              logo: (tk as unknown as { meta?: { logo?: string } }).meta?.logo ?? null,
            }),
          ),
        ),
      );

      const data = results
        .filter((r): r is PromiseFulfilledResult<ToolkitSummary> => r.status === "fulfilled")
        .map((r) => r.value);

      toolkitSummariesCache = { data, expires: Date.now() + TOOLKIT_SUMMARIES_TTL_MS };
      return data;
    } catch {
      return [];
    } finally {
      toolkitSummariesInFlight = null;
    }
  })();
  return toolkitSummariesInFlight;
}

export const fetchToolkitSummaries = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async (): Promise<ToolkitSummary[]> => loadToolkitSummaries());

export const listConnections = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const rows = db.select().from(connections).where(eq(connections.projectId, data.projectId)).all();

    // Toolkit summaries are process-cached (1h TTL) so this is effectively free
    // after the first hit. If the Composio fetch fails, fall back to no-logo
    // rendering instead of breaking the page.
    const toolkitSummaries = await loadToolkitSummaries().catch(() => [] as ToolkitSummary[]);
    const summaryBySlug = new Map<string, ToolkitSummary>(toolkitSummaries.map((tk) => [tk.slug, tk]));

    return jsonSafe(
      rows.map((row) => {
        const summary = summaryBySlug.get(row.provider);
        return buildConnectionView(normalizeConnectionRowForView(row), {
          logo: summary?.logo ?? null,
          providerName: summary?.name ?? null,
        });
      }),
    );
  });

export const createDirectConnection = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; provider: string; config?: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    if (data.provider === "googleads" && !hasGoogleAdsCustomerConfig(data.config ?? {})) {
      return jsonSafe({ success: false, error: "Google Ads requires OAuth or a selected customer account." });
    }

    const { db } = getProjectDeps(data.projectId);

    // Check if an active connection already exists for this provider
    const existing = getLatestConnection(db, data.projectId, data.provider, "active");
    if (existing) {
      return jsonSafe({ success: true, connectionId: existing.id, existing: true });
    }

    const connId = crypto.randomUUID().slice(0, 8);
    const now = Date.now();
    db.insert(connections)
      .values({
        id: connId,
        projectId: data.projectId,
        provider: data.provider,
        composioEntityId: null,
        status: "active",
        config: data.config ? JSON.stringify(data.config) : "{}",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    return jsonSafe({ success: true, connectionId: connId, existing: false });
  });

export const updateConnectionConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { projectId: string; provider: string; config: Record<string, unknown>; connectionId?: string }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const connection = data.connectionId
      ? db.select().from(connections).where(eq(connections.id, data.connectionId)).get()
      : getLatestConnection(db, data.projectId, data.provider, "active");
    if (!connection || connection.projectId !== data.projectId || connection.provider !== data.provider) {
      return jsonSafe({ success: false, error: "No active connection found" });
    }
    if (connection.status !== "active") {
      return jsonSafe({ success: false, error: "Connection is not active" });
    }

    const existing = parseConnectionConfig(connection.config);
    const merged = { ...existing, ...data.config };
    db.update(connections)
      .set({ config: JSON.stringify(merged), updatedAt: Date.now() })
      .where(eq(connections.id, connection.id))
      .run();

    return jsonSafe({ success: true });
  });

export const upsertAgentConnectionBinding = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: string;
      agentId: string;
      provider: string;
      connectionId: string;
      resourceType?: string | null;
      resourceId?: string | null;
      resourceLabel?: string | null;
      alias?: string;
      purpose?: string | null;
      isDefault?: boolean;
    }) => input,
  )
  .handler(async ({ data }) => {
    const deps = getProjectDeps(data.projectId);
    const connection = deps.db.select().from(connections).where(eq(connections.id, data.connectionId)).get();
    if (!connection || connection.projectId !== data.projectId || connection.provider !== data.provider) {
      return jsonSafe({ success: false, error: "Connection not found for this project/provider" });
    }
    if (connection.status !== "active") {
      return jsonSafe({ success: false, error: "Connection is not active" });
    }

    const bindingId = await deps.agentConnectionBindingRepository.upsert({
      agentId: data.agentId,
      provider: data.provider,
      connectionId: data.connectionId,
      resourceType: data.resourceType ?? null,
      resourceId: normalizeResourceId(data.provider, data.resourceId),
      resourceLabel: data.resourceLabel ?? null,
      alias: data.alias ?? defaultBindingAlias(data.provider, data.resourceId ?? null),
      purpose: data.purpose ?? null,
      isDefault: data.isDefault ?? true,
      config: { source: "user" },
    });

    return jsonSafe({ success: true, bindingId });
  });

export const removeAgentConnectionBinding = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; agentId: string; bindingId: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    db.update(agentConnectionBindings)
      .set({ status: "disabled", updatedAt: Date.now() })
      .where(and(eq(agentConnectionBindings.id, data.bindingId), eq(agentConnectionBindings.agentId, data.agentId)))
      .run();
    return jsonSafe({ success: true });
  });

export const listGoogleAdsAccounts = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string; connectionId?: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const latest = data.connectionId
      ? db.select().from(connections).where(eq(connections.id, data.connectionId)).get()
      : getLatestConnection(db, data.projectId, "googleads", "active");
    if (latest?.projectId !== data.projectId || latest.provider !== "googleads" || latest.status !== "active") {
      return jsonSafe({ accounts: [], error: "No active Google Ads connection found" });
    }
    if (!latest?.composioEntityId) {
      return jsonSafe({ accounts: [], error: "No active Google Ads connection found" });
    }

    try {
      const { createComposioAdapter, getComposioUserId } = await import("@nochore/harness");
      const adapter = await createComposioAdapter();
      const result = await adapter.execute({
        userId: getComposioUserId(data.projectId),
        toolSlug: "GOOGLEADS_LIST_ACCESSIBLE_CUSTOMERS",
        connectedAccountId: latest.composioEntityId,
        args: {},
      });
      if (result.successful === false) {
        return jsonSafe({ accounts: [], error: result.error ?? "Google Ads account lookup failed" });
      }

      const accounts = parseGoogleAdsAccessibleCustomers(result.data);
      return jsonSafe({ accounts });
    } catch (error) {
      return jsonSafe({ accounts: [], error: error instanceof Error ? error.message : String(error) });
    }
  });

function getLatestConnection(db: ProjectDb, projectId: string, provider: string, status?: string) {
  return listConnectionsForProvider(db, projectId, provider, status).at(-1);
}

function getPendingConnection(db: ProjectDb, projectId: string, provider: string, connectionId?: string) {
  if (!connectionId) {
    return getLatestConnection(db, projectId, provider, "pending");
  }

  const connection = db.select().from(connections).where(eq(connections.id, connectionId)).get();
  if (connection?.projectId !== projectId || connection.provider !== provider || connection.status !== "pending") {
    return null;
  }

  return connection;
}

function appendConnectionId(callbackUrl: string, connectionId: string) {
  try {
    const url = new URL(callbackUrl);
    url.searchParams.set("connectionId", connectionId);
    return url.toString();
  } catch {
    const separator = callbackUrl.includes("?") ? "&" : "?";
    return `${callbackUrl}${separator}connectionId=${encodeURIComponent(connectionId)}`;
  }
}

async function resolveAuthConfigId(
  composio: Awaited<ReturnType<typeof import("@nochore/harness").createComposioClient>>,
  provider: string,
) {
  const envValue = getProviderAuthConfigEnv(provider);
  if (envValue) return envValue;
  if (provider !== "googleads") return null;
  return ensureGoogleAdsAuthConfig(composio);
}

function getProviderAuthConfigEnv(provider: string) {
  const normalized = provider.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return process.env[`COMPOSIO_${normalized}_AUTH_CONFIG_ID`]?.trim() || null;
}

async function ensureGoogleAdsAuthConfig(
  composio: Awaited<ReturnType<typeof import("@nochore/harness").createComposioClient>>,
) {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  if (!clientId || !clientSecret || !developerToken) {
    return null;
  }

  const name = "Nochore Google Ads OAuth";
  const configs = await composio.authConfigs.list({ toolkit: "googleads" });
  const existing = configs.items.find((config) => config.name === name && !config.isComposioManaged);
  if (existing) return existing.id;

  const created = await composio.authConfigs.create("googleads", {
    type: "use_custom_auth",
    name,
    authScheme: "OAUTH2",
    credentials: {
      client_id: clientId,
      client_secret: clientSecret,
      developer_token: developerToken,
      scopes: "https://www.googleapis.com/auth/adwords",
    },
    isEnabledForToolRouter: true,
  });
  return created.id;
}

function listConnectionsForProvider(db: ProjectDb, projectId: string, provider: string, status?: string) {
  const filter = status
    ? and(eq(connections.projectId, projectId), eq(connections.provider, provider), eq(connections.status, status))
    : and(eq(connections.projectId, projectId), eq(connections.provider, provider));

  return db.select().from(connections).where(filter).all();
}

function normalizeConnectionRowForView(row: typeof connections.$inferSelect): typeof connections.$inferSelect {
  if (row.provider !== "googleads" || row.status !== "active" || row.composioEntityId) {
    return row;
  }

  const config = parseConnectionConfig(row.config);
  if (hasGoogleAdsCustomerConfig(config)) {
    return row;
  }

  return { ...row, status: "disconnected" };
}

function parseConnectionConfig(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function hasGoogleAdsCustomerConfig(config: Record<string, unknown>): boolean {
  const value = config.selectedCustomerId ?? config.customerId;
  return typeof value === "string" && value.trim().length > 0;
}

function setConnectionStatus(db: ProjectDb, connectionId: string, status: string) {
  db.update(connections).set({ status, updatedAt: Date.now() }).where(eq(connections.id, connectionId)).run();
}

function activateProviderConnection(db: ProjectDb, _projectId: string, _provider: string, connectionId: string) {
  setConnectionStatus(db, connectionId, "active");
}

function setProviderConnectionStatus(
  db: ProjectDb,
  projectId: string,
  provider: string,
  currentStatus: string,
  nextStatus: string,
) {
  db.update(connections)
    .set({ status: nextStatus, updatedAt: Date.now() })
    .where(
      and(
        eq(connections.projectId, projectId),
        eq(connections.provider, provider),
        eq(connections.status, currentStatus),
      ),
    )
    .run();
}

function normalizeResourceId(provider: string, resourceId: string | null | undefined): string | null {
  if (!resourceId) return null;
  return provider === "googleads" ? resourceId.replace(/\D/g, "") : resourceId;
}

function defaultBindingAlias(provider: string, resourceId: string | null): string {
  if (provider === "googleads" && resourceId) {
    return `googleads_${resourceId.replace(/\D/g, "")}`;
  }
  return provider;
}

function parseGoogleAdsAccessibleCustomers(data: unknown) {
  const resourceNames = Array.isArray((data as { resourceNames?: unknown[] } | null)?.resourceNames)
    ? ((data as { resourceNames: unknown[] }).resourceNames as unknown[])
    : [];

  return resourceNames
    .map((resourceName) => {
      if (typeof resourceName !== "string") return null;
      const customerId = resourceName.replace(/^customers\//, "").replace(/\D/g, "");
      if (customerId.length === 0) return null;
      return {
        id: customerId,
        formattedId: formatGoogleAdsCustomerId(customerId),
        label: formatGoogleAdsCustomerId(customerId),
      };
    })
    .filter((account): account is { id: string; formattedId: string; label: string } => account != null);
}

function formatGoogleAdsCustomerId(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}
