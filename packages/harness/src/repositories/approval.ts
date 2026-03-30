import { and, desc, eq, inArray } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { approvals } from "../db/schema";
import { type ApprovalRecord, ApprovalRecordSchema, type ApprovalStatus, ApprovalStatusSchema } from "../types";

type Db = HarnessDb;

export interface CreateApprovalInput {
  runId: string;
  agentId: string;
  approvalId: string;
  waitTokenId: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  createdAt: Date;
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
        createdAt: input.createdAt.getTime(),
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
    decisionReason: row.decisionReason ?? undefined,
    createdAt: new Date(row.createdAt),
    resolvedAt: row.resolvedAt != null ? new Date(row.resolvedAt) : undefined,
  });
}
