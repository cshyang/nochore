import crypto from "node:crypto";
import { connections } from "@nochore/harness";
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
    const composio = await createComposioClient();
    const session = await composio.create(getComposioUserId(data.projectId), {
      manageConnections: false,
    });
    const connectionRequest = await session.authorize(data.provider, {
      callbackUrl: data.callbackUrl,
    });

    const { db } = getProjectDeps(data.projectId);
    const connId = crypto.randomUUID().slice(0, 8);
    const now = Date.now();
    db.insert(connections)
      .values({
        id: connId,
        projectId: data.projectId,
        provider: data.provider,
        composioEntityId: connectionRequest.id,
        status: "pending",
        config: JSON.stringify({ callbackUrl: data.callbackUrl }),
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
  .inputValidator((input: { projectId: string; provider: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const pending = getLatestConnection(db, data.projectId, data.provider, "pending");

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
        setConnectionStatus(db, pending.id, "active");
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
  .inputValidator((input: { projectId: string; provider: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const pending = getLatestConnection(db, data.projectId, data.provider, "pending");

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

    setConnectionStatus(db, pending.id, "active");

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

    return jsonSafe(rows.map(buildConnectionView));
  });

export const createDirectConnection = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; provider: string; config?: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
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
  .inputValidator((input: { projectId: string; provider: string; config: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const latest = getLatestConnection(db, data.projectId, data.provider, "active");
    if (!latest) {
      return jsonSafe({ success: false, error: "No active connection found" });
    }

    const existing = latest.config ? JSON.parse(latest.config) : {};
    const merged = { ...existing, ...data.config };
    db.update(connections)
      .set({ config: JSON.stringify(merged), updatedAt: Date.now() })
      .where(eq(connections.id, latest.id))
      .run();

    return jsonSafe({ success: true });
  });

function getLatestConnection(db: ProjectDb, projectId: string, provider: string, status?: string) {
  return listConnectionsForProvider(db, projectId, provider, status).at(-1);
}

function listConnectionsForProvider(db: ProjectDb, projectId: string, provider: string, status?: string) {
  const filter = status
    ? and(eq(connections.projectId, projectId), eq(connections.provider, provider), eq(connections.status, status))
    : and(eq(connections.projectId, projectId), eq(connections.provider, provider));

  return db.select().from(connections).where(filter).all();
}

function setConnectionStatus(db: ProjectDb, connectionId: string, status: string) {
  db.update(connections).set({ status, updatedAt: Date.now() }).where(eq(connections.id, connectionId)).run();
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
