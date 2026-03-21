/**
 * Connection server functions — Composio OAuth flow.
 *
 * Handles initiating OAuth connections, checking status, and listing
 * connections for a project. Uses the Composio SDK for OAuth orchestration
 * and the project DB for tracking connection state.
 */

import crypto from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createComposioClient } from "../../../../packages/harness/src/connections/composio";
import { getProjectDeps } from "./deps";
import { connections } from "../../../../packages/harness/src/db/schema";
import { jsonSafe } from "./serializable";

// ---------------------------------------------------------------------------
// Composio user ID — for MVP, use a fixed ID per project
// ---------------------------------------------------------------------------

function composioUserId(projectId: string) {
  return `nochore-${projectId}`;
}

// ---------------------------------------------------------------------------
// initiateConnection — start an OAuth flow via Composio
// ---------------------------------------------------------------------------

export const initiateConnection = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: string;
      provider: string; // e.g., "googleads", "slack"
      callbackUrl: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const composio = createComposioClient();
    const userId = composioUserId(data.projectId);

    // Create a session and authorize the toolkit
    const session = await composio.create(userId, {
      manageConnections: false,
    });

    const connectionRequest = await session.authorize(data.provider, {
      callbackUrl: data.callbackUrl,
    });

    // Store pending connection in DB
    const { db } = getProjectDeps(data.projectId);
    const connId = crypto.randomUUID().slice(0, 8);
    db.insert(connections)
      .values({
        id: connId,
        projectId: data.projectId,
        provider: data.provider,
        composioEntityId: connectionRequest.id,
        status: "pending",
        config: JSON.stringify({ callbackUrl: data.callbackUrl }),
        createdAt: Date.now(),
      })
      .run();

    return jsonSafe({
      connectionId: connId,
      composioConnectionId: connectionRequest.id,
      redirectUrl: connectionRequest.redirectUrl,
    });
  });

// ---------------------------------------------------------------------------
// checkConnection — check if a provider is connected for a project
// ---------------------------------------------------------------------------

export const checkConnection = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { projectId: string; provider: string }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const rows = db
      .select()
      .from(connections)
      .where(eq(connections.projectId, data.projectId))
      .all()
      .filter((r) => r.provider === data.provider);

    if (rows.length === 0) return jsonSafe({ connected: false });

    const latest = rows[rows.length - 1];
    return jsonSafe({
      connected: latest.status === "active",
      status: latest.status,
      connectionId: latest.id,
    });
  });

// ---------------------------------------------------------------------------
// pollComposioConnection — check Composio for real connection status
// ---------------------------------------------------------------------------

export const pollComposioConnection = createServerFn({ method: "GET" })
  .inputValidator(
    (input: { projectId: string; provider: string }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);

    // Find the latest pending connection for this provider
    const rows = db
      .select()
      .from(connections)
      .where(eq(connections.projectId, data.projectId))
      .all()
      .filter(
        (r) => r.provider === data.provider && r.status === "pending",
      );

    if (rows.length === 0) {
      return jsonSafe({ connected: false, status: "no_pending" });
    }

    const pending = rows[rows.length - 1];
    if (!pending.composioEntityId) {
      return jsonSafe({ connected: false, status: "no_composio_id" });
    }

    // Check with Composio if the connection is now active
    try {
      const composio = createComposioClient();
      const account = await composio.connectedAccounts.get(
        pending.composioEntityId,
      );

      if (account.status === "ACTIVE") {
        // Update our DB
        db.update(connections)
          .set({ status: "active" })
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

// ---------------------------------------------------------------------------
// activateConnection — mark a connection as active (called from callback)
// ---------------------------------------------------------------------------

export const activateConnection = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { projectId: string; provider: string }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);

    // Find the latest pending connection for this provider
    const rows = db
      .select()
      .from(connections)
      .where(eq(connections.projectId, data.projectId))
      .all()
      .filter(
        (r) => r.provider === data.provider && r.status === "pending",
      );

    if (rows.length === 0) {
      return jsonSafe({ success: false, error: "No pending connection found" });
    }

    const pending = rows[rows.length - 1];

    // Verify with Composio that the connection is actually active
    if (pending.composioEntityId) {
      try {
        const composio = createComposioClient();
        const account = await composio.connectedAccounts.get(
          pending.composioEntityId,
        );

        if (account.status !== "ACTIVE") {
          return jsonSafe({
            success: false,
            error: `Connection not yet active: ${account.status}`,
          });
        }
      } catch {
        // If we can't verify, still mark as active for MVP
      }
    }

    // Update status to active
    db.update(connections)
      .set({ status: "active" })
      .where(eq(connections.id, pending.id))
      .run();

    return jsonSafe({ success: true, connectionId: pending.id });
  });

// ---------------------------------------------------------------------------
// listConnections — all connections for a project
// ---------------------------------------------------------------------------

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
      rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        status: r.status,
        createdAt: r.createdAt,
      })),
    );
  });
