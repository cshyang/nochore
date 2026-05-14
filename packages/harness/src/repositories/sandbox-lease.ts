import { desc, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { sandboxLeases } from "../db/schema";
import { type SandboxLeaseRecord, SandboxLeaseSchema, type SandboxLeaseStatus, type SandboxProvider } from "../types";
import { parseJson } from "./marshaling";

type Db = HarnessDb;

export interface CreateSandboxLeaseInput {
  id?: string;
  sessionId: string;
  provider: SandboxProvider;
  providerHandle?: string;
  status?: SandboxLeaseStatus;
  metadata?: Record<string, unknown>;
  startedAt?: Date;
}

export class SandboxLeaseRepository {
  constructor(private db: Db) {}

  async create(input: CreateSandboxLeaseInput): Promise<string> {
    const id = input.id ?? crypto.randomUUID();
    const startedAt = input.startedAt ?? new Date();
    this.db
      .insert(sandboxLeases)
      .values({
        id,
        sessionId: input.sessionId,
        provider: input.provider,
        providerHandle: input.providerHandle ?? null,
        status: input.status ?? "starting",
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        startedAt: startedAt.getTime(),
      })
      .run();
    return id;
  }

  async getById(id: string): Promise<SandboxLeaseRecord | null> {
    const row = this.db.select().from(sandboxLeases).where(eq(sandboxLeases.id, id)).get();
    return row ? toSandboxLeaseRecord(row) : null;
  }

  async listBySession(sessionId: string): Promise<SandboxLeaseRecord[]> {
    return this.db
      .select()
      .from(sandboxLeases)
      .where(eq(sandboxLeases.sessionId, sessionId))
      .orderBy(desc(sandboxLeases.startedAt))
      .all()
      .map(toSandboxLeaseRecord);
  }

  async markReady(id: string, providerHandle?: string, metadata?: Record<string, unknown>): Promise<void> {
    const updateData: Partial<typeof sandboxLeases.$inferInsert> = { status: "ready" };
    if (providerHandle !== undefined) updateData.providerHandle = providerHandle;
    if (metadata !== undefined) updateData.metadata = JSON.stringify(metadata);
    this.db.update(sandboxLeases).set(updateData).where(eq(sandboxLeases.id, id)).run();
  }

  async stop(id: string, stoppedAt: Date, status: Extract<SandboxLeaseStatus, "stopped" | "failed">): Promise<void> {
    this.db.update(sandboxLeases).set({ status, stoppedAt: stoppedAt.getTime() }).where(eq(sandboxLeases.id, id)).run();
  }
}

function toSandboxLeaseRecord(row: typeof sandboxLeases.$inferSelect): SandboxLeaseRecord {
  return SandboxLeaseSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    provider: row.provider,
    providerHandle: row.providerHandle ?? undefined,
    status: row.status,
    metadata: parseJson<Record<string, unknown> | undefined>(row.metadata, undefined),
    startedAt: new Date(row.startedAt),
    stoppedAt: row.stoppedAt != null ? new Date(row.stoppedAt) : undefined,
  });
}
