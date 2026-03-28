import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { createComposioClient, getComposioUserId } from "../../../../packages/harness/src/connections";
import { connections } from "../../../../packages/harness/src/db/schema";
import { getProjectDeps } from "./deps";
import { jsonSafe } from "./serializable";

export const initiateConnection = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; provider: string; callbackUrl: string }) => input)
  .handler(async ({ data }) => {
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
    const rows = db
      .select()
      .from(connections)
      .where(and(eq(connections.projectId, data.projectId), eq(connections.provider, data.provider)))
      .all();

    if (rows.length === 0) {
      return jsonSafe({ connected: false });
    }

    const latest = rows[rows.length - 1];
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
    const pending = db
      .select()
      .from(connections)
      .where(and(eq(connections.projectId, data.projectId), eq(connections.provider, data.provider), eq(connections.status, "pending")))
      .all()
      .at(-1);

    if (!pending) {
      return jsonSafe({ connected: false, status: "no_pending" });
    }

    if (!pending.composioEntityId) {
      return jsonSafe({ connected: false, status: "no_composio_id" });
    }

    try {
      const composio = await createComposioClient();
      const account = await composio.connectedAccounts.get(pending.composioEntityId);
      if (account.status === "ACTIVE") {
        db.update(connections)
          .set({ status: "active", updatedAt: Date.now() })
          .where(eq(connections.id, pending.id))
          .run();
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
    const pending = db
      .select()
      .from(connections)
      .where(and(eq(connections.projectId, data.projectId), eq(connections.provider, data.provider), eq(connections.status, "pending")))
      .all()
      .at(-1);

    if (!pending) {
      return jsonSafe({ success: false, error: "No pending connection found" });
    }

    if (pending.composioEntityId) {
      try {
        const composio = await createComposioClient();
        const account = await composio.connectedAccounts.get(pending.composioEntityId);
        if (account.status !== "ACTIVE") {
          return jsonSafe({ success: false, error: `Connection not yet active: ${account.status}` });
        }
      } catch {
        // If verification fails, fall back to marking active locally.
      }
    }

    db.update(connections)
      .set({ status: "active", updatedAt: Date.now() })
      .where(eq(connections.id, pending.id))
      .run();

    return jsonSafe({ success: true, connectionId: pending.id });
  });

export const getToolkitMetadata = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string; toolkits: string[] }) => input)
  .handler(async ({ data }) => {
    try {
      const composio = await createComposioClient();
      const session = await composio.create(getComposioUserId(data.projectId), {
        toolkits: data.toolkits,
        manageConnections: false,
      });
      const { items } = await session.toolkits();
      return jsonSafe(
        items.map((toolkit: {
          slug: string;
          name: string;
          logo?: string;
          isNoAuth?: boolean;
          connection?: {
            isActive?: boolean;
            connectedAccount?: { id?: string; status?: string };
          };
        }) => ({
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
      const composio = await createComposioClient();
      await composio.connectedAccounts.delete(data.connectedAccountId);
      // Also update local DB status
      const { db } = getProjectDeps(data.projectId);
      const rows = db
        .select()
        .from(connections)
        .where(and(eq(connections.projectId, data.projectId), eq(connections.provider, data.provider), eq(connections.status, "active")))
        .all();
      for (const row of rows) {
        db.update(connections)
          .set({ status: "disconnected", updatedAt: Date.now() })
          .where(eq(connections.id, row.id))
          .run();
      }
      return jsonSafe({ success: true });
    } catch {
      return jsonSafe({ success: false });
    }
  });

const SUPPORTED_PROVIDERS = [
  "googleads",
  "meta",
  "slack",
  "gmail",
  "ga4",
  "shopify",
  "stripe",
  "github",
  "googlesearchconsole",
  "tiktok",
];

export interface ComposioToolMeta {
  slug: string;
  name: string;
  description: string;
  provider: string;
  providerName: string;
  providerLogo: string | null;
  tags: string[];
}

export const fetchComposioToolCatalog = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data }): Promise<ComposioToolMeta[]> => {
    try {
      const composio = await createComposioClient();

      // Use composio.tools.list() — the REST API that returns metadata.
      // session.tools() returns AI SDK ToolSet objects (for execution), not catalog metadata.
      const results = await Promise.all(
        SUPPORTED_PROVIDERS.map((provider) =>
          (composio as any).tools.list({ toolkit_slug: provider, limit: 50 })
            .then((res: { items?: Array<{
              slug: string;
              name: string;
              description?: string;
              human_description?: string;
              tags?: string[];
              toolkit: { slug: string; name: string; logo?: string };
            }> }) => (res.items ?? []).map((tool) => ({
              slug: tool.slug,
              name: tool.name,
              description: tool.description ?? tool.human_description ?? "",
              provider,
              providerName: tool.toolkit?.name ?? provider,
              providerLogo: tool.toolkit?.logo ?? null,
              tags: tool.tags ?? [],
            })))
            .catch(() => [] as ComposioToolMeta[]),
        ),
      );

      const catalog = results.flat();
      if (catalog.length > 0) return catalog;
    } catch {
      // Fall through to hardcoded fallback
    }

    // Fallback: use DEFAULT_TOOL_CAPABILITIES when Composio is unavailable
    const { DEFAULT_TOOL_CAPABILITIES } = await import("../../../../packages/harness/src/connections/capabilities");
    return DEFAULT_TOOL_CAPABILITIES.map((tool) => ({
      slug: tool.slug,
      name: tool.title,
      description: tool.description,
      provider: tool.provider,
      providerName: tool.provider,
      providerLogo: null,
      tags: [tool.mode],
    }));
  });

export const listConnections = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const rows = db
      .select()
      .from(connections)
      .where(eq(connections.projectId, data.projectId))
      .all();

    return jsonSafe(
      rows.map((row) => ({
        id: row.id,
        provider: row.provider,
        status: row.status,
        createdAt: row.createdAt,
      })),
    );
  });

