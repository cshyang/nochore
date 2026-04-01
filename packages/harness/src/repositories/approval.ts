import { and, desc, eq, inArray } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { agents, approvals } from "../db/schema";
import { type ApprovalRecord, ApprovalRecordSchema, type ApprovalStatus, ApprovalStatusSchema } from "../types";

type Db = HarnessDb;

export interface CreateApprovalInput {
  runId: string;
  agentId: string;
  approvalId: string;
  waitTokenId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  requestReason?: string;
  requestEventId?: string;
  createdAt: Date;
  expiresAt?: Date;
}

export class ApprovalRepository {
  constructor(private db: Db) {}

  async create(input: CreateApprovalInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(approvals)
      .values({
        id,
        runId: input.runId,
        agentId: input.agentId,
        approvalId: input.approvalId,
        waitTokenId: input.waitTokenId,
        toolName: input.toolName,
        toolInput: JSON.stringify(input.toolInput),
        status: "pending",
        requestReason: input.requestReason ?? null,
        requestEventId: input.requestEventId ?? null,
        createdAt: input.createdAt.getTime(),
        expiresAt: input.expiresAt?.getTime() ?? null,
      })
      .run();
    return id;
  }

  async getById(id: string): Promise<ApprovalRecord | null> {
    const row = this.db.select().from(approvals).where(eq(approvals.id, id)).get();
    return row ? toApprovalRecord(row) : null;
  }

  async getByApprovalId(approvalId: string): Promise<ApprovalRecord | null> {
    const row = this.db.select().from(approvals).where(eq(approvals.approvalId, approvalId)).get();
    return row ? toApprovalRecord(row) : null;
  }

  async listByAgent(agentId: string, statuses?: ApprovalStatus[]): Promise<ApprovalRecord[]> {
    const conditions = [eq(approvals.agentId, agentId)];
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(approvals.status, statuses));
    }

    return this.db
      .select()
      .from(approvals)
      .where(and(...conditions))
      .orderBy(desc(approvals.createdAt))
      .all()
      .map(toApprovalRecord);
  }

  async listByRun(runId: string, statuses?: ApprovalStatus[]): Promise<ApprovalRecord[]> {
    const conditions = [eq(approvals.runId, runId)];
    if (statuses && statuses.length > 0) {
      conditions.push(inArray(approvals.status, statuses));
    }

    return this.db
      .select()
      .from(approvals)
      .where(and(...conditions))
      .orderBy(desc(approvals.createdAt))
      .all()
      .map(toApprovalRecord);
  }

  async listByProject(projectId: string, statuses?: ApprovalStatus[]): Promise<ApprovalRecord[]> {
    const query = this.db
      .select()
      .from(approvals)
      .innerJoin(agents, eq(approvals.agentId, agents.id))
      .where(
        and(
          eq(agents.projectId, projectId),
          ...(statuses && statuses.length > 0 ? [inArray(approvals.status, statuses)] : []),
        ),
      )
      .orderBy(desc(approvals.createdAt));

    return query.all().map((row: { approvals: typeof approvals.$inferSelect }) => toApprovalRecord(row.approvals));
  }

  async setRequestEventId(id: string, requestEventId: string): Promise<void> {
    this.db
      .update(approvals)
      .set({
        requestEventId,
      })
      .where(eq(approvals.id, id))
      .run();
  }

  async markResolved(
    id: string,
    status: Exclude<ApprovalStatus, "pending">,
    decisionReason: string,
    resolvedAt: Date,
  ): Promise<void> {
    this.db
      .update(approvals)
      .set({
        status: ApprovalStatusSchema.parse(status),
        decisionReason,
        resolvedAt: resolvedAt.getTime(),
      })
      .where(eq(approvals.id, id))
      .run();
  }

  async markExpired(id: string, decisionReason: string, resolvedAt: Date): Promise<void> {
    await this.markResolved(id, "expired", decisionReason, resolvedAt);
  }
}

function toApprovalRecord(row: typeof approvals.$inferSelect): ApprovalRecord {
  return ApprovalRecordSchema.parse({
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    approvalId: row.approvalId,
    waitTokenId: row.waitTokenId,
    toolName: row.toolName,
    toolInput: JSON.parse(row.toolInput),
    status: row.status,
    requestReason: row.requestReason ?? undefined,
    requestEventId: row.requestEventId ?? undefined,
    decisionReason: row.decisionReason ?? undefined,
    createdAt: new Date(row.createdAt),
    expiresAt: row.expiresAt != null ? new Date(row.expiresAt) : undefined,
    resolvedAt: row.resolvedAt != null ? new Date(row.resolvedAt) : undefined,
  });
}
