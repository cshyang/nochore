import { and, desc, eq } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { agentSessions } from "../db/schema";
import { type AgentSessionRecord, AgentSessionSchema, type AgentSessionStatus } from "../types";

type Db = HarnessDb;

export interface CreateAgentSessionInput {
  id?: string;
  projectId: string;
  agentId: string;
  conversationThreadId?: string;
  contextKey: string;
  status?: AgentSessionStatus;
  createdAt?: Date;
}

export class AgentSessionRepository {
  constructor(private db: Db) {}

  async create(input: CreateAgentSessionInput): Promise<string> {
    const now = input.createdAt ?? new Date();
    const id = input.id ?? crypto.randomUUID();
    this.db
      .insert(agentSessions)
      .values({
        id,
        projectId: input.projectId,
        agentId: input.agentId,
        conversationThreadId: input.conversationThreadId ?? null,
        contextKey: input.contextKey,
        status: input.status ?? "idle",
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        lastActiveAt: now.getTime(),
      })
      .run();
    return id;
  }

  async getOrCreateForContext(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    const existing = await this.getByAgentAndContext(input.agentId, input.contextKey);
    if (existing) {
      if (input.conversationThreadId && existing.conversationThreadId !== input.conversationThreadId) {
        await this.update(existing.id, { conversationThreadId: input.conversationThreadId });
        return (await this.getById(existing.id))!;
      }
      return existing;
    }

    const id = await this.create(input);
    return (await this.getById(id))!;
  }

  async getById(id: string): Promise<AgentSessionRecord | null> {
    const row = this.db.select().from(agentSessions).where(eq(agentSessions.id, id)).get();
    return row ? toAgentSessionRecord(row) : null;
  }

  async getByAgentAndContext(agentId: string, contextKey: string): Promise<AgentSessionRecord | null> {
    const row = this.db
      .select()
      .from(agentSessions)
      .where(and(eq(agentSessions.agentId, agentId), eq(agentSessions.contextKey, contextKey)))
      .orderBy(desc(agentSessions.updatedAt))
      .get();
    return row ? toAgentSessionRecord(row) : null;
  }

  async listByAgent(agentId: string): Promise<AgentSessionRecord[]> {
    return this.db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.agentId, agentId))
      .orderBy(desc(agentSessions.updatedAt))
      .all()
      .map(toAgentSessionRecord);
  }

  async update(
    id: string,
    patch: {
      status?: AgentSessionStatus;
      conversationThreadId?: string;
      currentSandboxLeaseId?: string | null;
      lastContextSnapshotId?: string | null;
      activeWorkItemId?: string | null;
      lastActiveAt?: Date | null;
    },
  ): Promise<void> {
    const updateData: Partial<typeof agentSessions.$inferInsert> = { updatedAt: Date.now() };
    if (patch.status !== undefined) updateData.status = patch.status;
    if (patch.conversationThreadId !== undefined) updateData.conversationThreadId = patch.conversationThreadId;
    if (patch.currentSandboxLeaseId !== undefined) updateData.currentSandboxLeaseId = patch.currentSandboxLeaseId;
    if (patch.lastContextSnapshotId !== undefined) updateData.lastContextSnapshotId = patch.lastContextSnapshotId;
    if (patch.activeWorkItemId !== undefined) updateData.activeWorkItemId = patch.activeWorkItemId;
    if (patch.lastActiveAt !== undefined) {
      updateData.lastActiveAt = patch.lastActiveAt === null ? null : patch.lastActiveAt.getTime();
    }
    this.db.update(agentSessions).set(updateData).where(eq(agentSessions.id, id)).run();
  }
}

function toAgentSessionRecord(row: typeof agentSessions.$inferSelect): AgentSessionRecord {
  return AgentSessionSchema.parse({
    id: row.id,
    projectId: row.projectId,
    agentId: row.agentId,
    conversationThreadId: row.conversationThreadId ?? undefined,
    contextKey: row.contextKey,
    status: row.status,
    currentSandboxLeaseId: row.currentSandboxLeaseId ?? undefined,
    lastContextSnapshotId: row.lastContextSnapshotId ?? undefined,
    activeWorkItemId: row.activeWorkItemId ?? undefined,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    lastActiveAt: row.lastActiveAt != null ? new Date(row.lastActiveAt) : undefined,
  });
}
