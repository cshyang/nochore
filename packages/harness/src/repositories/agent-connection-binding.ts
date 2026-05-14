import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { agentConnectionBindings } from "../db/schema";
import { parseJson } from "./marshaling";

type Db = HarnessDb;

export interface AgentConnectionBindingRecord {
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
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertAgentConnectionBindingInput {
  id?: string;
  agentId: string;
  provider: string;
  connectionId: string;
  resourceType?: string | null;
  resourceId?: string | null;
  resourceLabel?: string | null;
  alias?: string;
  purpose?: string | null;
  isDefault?: boolean;
  status?: string;
  config?: Record<string, unknown>;
}

export class AgentConnectionBindingRepository {
  constructor(private db: Db) {}

  async listByAgent(agentId: string, statuses: string[] = ["active"]): Promise<AgentConnectionBindingRecord[]> {
    const allRows = this.db
      .select()
      .from(agentConnectionBindings)
      .where(eq(agentConnectionBindings.agentId, agentId))
      .all() as Array<typeof agentConnectionBindings.$inferSelect>;
    const rows = allRows.filter((row) => statuses.includes(row.status));
    return rows.map(toRecord);
  }

  async upsert(input: UpsertAgentConnectionBindingInput): Promise<string> {
    const now = Date.now();
    const alias = input.alias ?? defaultAlias(input.provider, input.resourceId ?? null);
    const existingRows = this.db
      .select()
      .from(agentConnectionBindings)
      .where(
        and(eq(agentConnectionBindings.agentId, input.agentId), eq(agentConnectionBindings.provider, input.provider)),
      )
      .all() as Array<typeof agentConnectionBindings.$inferSelect>;
    const resourceType = input.resourceType ?? null;
    const existing =
      (input.id ? existingRows.find((row) => row.id === input.id) : null) ??
      (input.isDefault !== false
        ? existingRows.find(
            (row) =>
              row.isDefault &&
              row.status === "active" &&
              row.connectionId === input.connectionId &&
              row.resourceType === resourceType,
          )
        : null) ??
      existingRows.find((row) => row.alias === alias);

    if (existing) {
      this.db
        .update(agentConnectionBindings)
        .set({
          provider: input.provider,
          connectionId: input.connectionId,
          resourceType,
          resourceId: input.resourceId ?? null,
          resourceLabel: input.resourceLabel ?? null,
          alias,
          purpose: input.purpose ?? existing.purpose,
          isDefault: input.isDefault ?? existing.isDefault,
          status: input.status ?? existing.status,
          config: JSON.stringify(input.config ?? parseJson(existing.config, {})),
          updatedAt: now,
        })
        .where(eq(agentConnectionBindings.id, existing.id))
        .run();
      return existing.id;
    }

    const id = input.id ?? crypto.randomUUID().slice(0, 12);
    this.db
      .insert(agentConnectionBindings)
      .values({
        id,
        agentId: input.agentId,
        provider: input.provider,
        connectionId: input.connectionId,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        resourceLabel: input.resourceLabel ?? null,
        alias,
        purpose: input.purpose ?? null,
        isDefault: input.isDefault ?? true,
        status: input.status ?? "active",
        config: JSON.stringify(input.config ?? {}),
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return id;
  }
}

function toRecord(row: typeof agentConnectionBindings.$inferSelect): AgentConnectionBindingRecord {
  return {
    id: row.id,
    agentId: row.agentId,
    provider: row.provider,
    connectionId: row.connectionId,
    resourceType: row.resourceType ?? undefined,
    resourceId: row.resourceId ?? undefined,
    resourceLabel: row.resourceLabel ?? undefined,
    alias: row.alias,
    purpose: row.purpose ?? undefined,
    isDefault: row.isDefault,
    status: row.status,
    config: parseJson(row.config, {}),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function defaultAlias(provider: string, resourceId: string | null): string {
  return provider === "googleads" && resourceId ? `googleads_${resourceId.replace(/\D/g, "")}` : provider;
}
