import { eq, and } from "drizzle-orm";
import { pendingActions } from "../db/schema";
import type { ActionProposal } from "../types/action";
import type { createDb } from "../db/client";

type Db = ReturnType<typeof createDb>;

/** Status values for pending actions. */
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

/** Input for queuing a new pending action (id is generated). */
export interface QueueActionInput {
  runId: string;
  agentId: string;
  proposal: ActionProposal;
}

/** A hydrated pending action record. */
export interface PendingAction {
  id: string;
  runId: string;
  agentId: string;
  proposal: ActionProposal;
  status: ApprovalStatus;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedReason?: string;
}

export class ApprovalRepository {
  constructor(private db: Db) {}

  /**
   * Queue a pending action with status="pending". Returns the generated id.
   */
  async queue(input: QueueActionInput): Promise<string> {
    const id = crypto.randomUUID();
    this.db
      .insert(pendingActions)
      .values({
        id,
        runId: input.runId,
        agentId: input.agentId,
        proposal: JSON.stringify(input.proposal),
        status: "pending",
        createdAt: Date.now(),
      })
      .run();
    return id;
  }

  /**
   * Get a pending action by id. Returns null if not found.
   */
  async getById(id: string): Promise<PendingAction | null> {
    const row = this.db
      .select()
      .from(pendingActions)
      .where(eq(pendingActions.id, id))
      .get();
    return row ? toPendingAction(row) : null;
  }

  /**
   * Resolve a pending action: update status, resolvedAt, and resolvedReason.
   */
  async resolve(
    id: string,
    decision: "approved" | "rejected" | "expired",
    reason: string
  ): Promise<void> {
    this.db
      .update(pendingActions)
      .set({
        status: decision,
        resolvedAt: Date.now(),
        resolvedReason: reason,
      })
      .where(eq(pendingActions.id, id))
      .run();
  }

  /**
   * Get actions for an agent, optionally filtered by status.
   */
  async getByAgentAndStatus(
    agentId: string,
    status?: ApprovalStatus
  ): Promise<PendingAction[]> {
    const conditions = [eq(pendingActions.agentId, agentId)];

    if (status) {
      conditions.push(eq(pendingActions.status, status));
    }

    const rows = this.db
      .select()
      .from(pendingActions)
      .where(and(...conditions))
      .all();

    return rows.map(toPendingAction);
  }
}

function toPendingAction(
  row: typeof pendingActions.$inferSelect
): PendingAction {
  return {
    id: row.id,
    runId: row.runId,
    agentId: row.agentId,
    proposal: JSON.parse(row.proposal) as ActionProposal,
    status: row.status as ApprovalStatus,
    createdAt: new Date(row.createdAt),
    resolvedAt:
      row.resolvedAt != null ? new Date(row.resolvedAt) : undefined,
    resolvedReason: row.resolvedReason ?? undefined,
  };
}
