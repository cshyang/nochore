import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
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
      .where(eq(connections.projectId, data.projectId))
      .all()
      .filter((row) => row.provider === data.provider);

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
      .where(eq(connections.projectId, data.projectId))
      .all()
      .filter((row) => row.provider === data.provider && row.status === "pending")
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
      .where(eq(connections.projectId, data.projectId))
      .all()
      .filter((row) => row.provider === data.provider && row.status === "pending")
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

