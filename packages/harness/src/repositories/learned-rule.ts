import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import type { HarnessDb } from "../db/client";
import { learnedPolicyRules, suggestionSuppressions } from "../db/schema";
import {
  type LearnedDecision,
  type LearnedPolicyRule,
  LearnedPolicyRuleSchema,
  type LearnedRuleConditions,
  type LearnedRuleStatus,
  LearnedRuleStatusSchema,
} from "../types";

type Db = HarnessDb;

export interface SuggestLearnedRuleInput {
  agentId: string;
  toolName: string;
  learnedDecision: LearnedDecision;
  conditions: LearnedRuleConditions | null;
  evidenceCount: number;
  consistencyRate: number;
  sourceApprovalIds: string[];
}

export class LearnedRuleRepository {
  constructor(private db: Db) {}

  async suggest(input: SuggestLearnedRuleInput): Promise<{ created: boolean; rule: LearnedPolicyRule }> {
    const existing = await this.findExisting(input);
    if (existing) {
      return { created: false, rule: existing };
    }

    await this.supersedeConflicting(input.agentId, input.toolName);

    const id = crypto.randomUUID();
    const suggestedAt = new Date();

    this.db
      .insert(learnedPolicyRules)
      .values({
        id,
        agentId: input.agentId,
        toolName: input.toolName,
        learnedDecision: input.learnedDecision,
        conditions: stringify(input.conditions),
        evidenceCount: input.evidenceCount,
        consistencyRate: input.consistencyRate,
        status: "suggested",
        suggestedAt: suggestedAt.getTime(),
        sourceApprovalIds: JSON.stringify(input.sourceApprovalIds),
      })
      .run();

    return {
      created: true,
      rule: LearnedPolicyRuleSchema.parse({
        id,
        agentId: input.agentId,
        toolName: input.toolName,
        learnedDecision: input.learnedDecision,
        conditions: input.conditions,
        evidenceCount: input.evidenceCount,
        consistencyRate: input.consistencyRate,
        status: "suggested",
        suggestedAt,
        sourceApprovalIds: input.sourceApprovalIds,
      }),
    };
  }

  async accept(
    id: string,
    userNote?: string,
    modifications?: Partial<Pick<LearnedPolicyRule, "learnedDecision" | "conditions">>,
  ): Promise<void> {
    this.db
      .update(learnedPolicyRules)
      .set({
        status: "accepted",
        acceptedAt: Date.now(),
        userNote,
        ...(modifications?.learnedDecision ? { learnedDecision: modifications.learnedDecision } : {}),
        ...(modifications && "conditions" in modifications
          ? { conditions: stringify(modifications.conditions ?? null) }
          : {}),
      })
      .where(eq(learnedPolicyRules.id, id))
      .run();
  }

  async dismiss(id: string): Promise<void> {
    await this.updateStatus(id, "dismissed");
  }

  async revoke(id: string): Promise<void> {
    this.db
      .update(learnedPolicyRules)
      .set({
        status: "revoked",
        revokedAt: Date.now(),
      })
      .where(eq(learnedPolicyRules.id, id))
      .run();
  }

  async listActive(agentId: string, now: Date = new Date()): Promise<LearnedPolicyRule[]> {
    return this.db
      .select()
      .from(learnedPolicyRules)
      .where(
        and(
          eq(learnedPolicyRules.agentId, agentId),
          eq(learnedPolicyRules.status, "accepted"),
          or(isNull(learnedPolicyRules.expiresAt), gt(learnedPolicyRules.expiresAt, now.getTime())),
        ),
      )
      .orderBy(desc(learnedPolicyRules.acceptedAt), desc(learnedPolicyRules.suggestedAt))
      .all()
      .map(toLearnedRule);
  }

  async listAccepted(agentId: string): Promise<LearnedPolicyRule[]> {
    return this.db
      .select()
      .from(learnedPolicyRules)
      .where(and(eq(learnedPolicyRules.agentId, agentId), eq(learnedPolicyRules.status, "accepted")))
      .orderBy(desc(learnedPolicyRules.acceptedAt), desc(learnedPolicyRules.suggestedAt))
      .all()
      .map(toLearnedRule);
  }

  async listSuggested(agentId: string): Promise<LearnedPolicyRule[]> {
    return this.db
      .select()
      .from(learnedPolicyRules)
      .where(and(eq(learnedPolicyRules.agentId, agentId), eq(learnedPolicyRules.status, "suggested")))
      .orderBy(desc(learnedPolicyRules.suggestedAt))
      .all()
      .map(toLearnedRule);
  }

  async getById(id: string): Promise<LearnedPolicyRule | null> {
    const row = this.db.select().from(learnedPolicyRules).where(eq(learnedPolicyRules.id, id)).get();
    return row ? toLearnedRule(row) : null;
  }

  async suppressSuggestion(agentId: string, toolName: string): Promise<void> {
    const existing = this.db
      .select()
      .from(suggestionSuppressions)
      .where(and(eq(suggestionSuppressions.agentId, agentId), eq(suggestionSuppressions.toolName, toolName)))
      .get();
    if (existing) return;

    this.db
      .insert(suggestionSuppressions)
      .values({
        id: crypto.randomUUID(),
        agentId,
        toolName,
        suppressedAt: Date.now(),
      })
      .run();
  }

  async isSuppressed(agentId: string, toolName: string): Promise<boolean> {
    const row = this.db
      .select()
      .from(suggestionSuppressions)
      .where(and(eq(suggestionSuppressions.agentId, agentId), eq(suggestionSuppressions.toolName, toolName)))
      .get();
    return !!row;
  }

  private async findExisting(input: SuggestLearnedRuleInput): Promise<LearnedPolicyRule | null> {
    const rows = this.db
      .select()
      .from(learnedPolicyRules)
      .where(
        and(
          eq(learnedPolicyRules.agentId, input.agentId),
          eq(learnedPolicyRules.toolName, input.toolName),
          eq(learnedPolicyRules.learnedDecision, input.learnedDecision),
          inArray(learnedPolicyRules.status, ["suggested", "accepted"] as LearnedRuleStatus[]),
        ),
      )
      .all();

    const serializedConditions = stringify(input.conditions);
    const row = rows.find(
      (candidate: typeof learnedPolicyRules.$inferSelect) => (candidate.conditions ?? "null") === serializedConditions,
    );
    return row ? toLearnedRule(row) : null;
  }

  private async supersedeConflicting(agentId: string, toolName: string): Promise<void> {
    const conflicting = this.db
      .select()
      .from(learnedPolicyRules)
      .where(
        and(
          eq(learnedPolicyRules.agentId, agentId),
          eq(learnedPolicyRules.toolName, toolName),
          inArray(learnedPolicyRules.status, ["suggested", "accepted"] as LearnedRuleStatus[]),
        ),
      )
      .all();

    for (const row of conflicting) {
      this.db
        .update(learnedPolicyRules)
        .set({ status: "revoked", revokedAt: Date.now() })
        .where(eq(learnedPolicyRules.id, row.id))
        .run();
    }
  }

  private async updateStatus(id: string, status: Extract<LearnedRuleStatus, "dismissed" | "expired">): Promise<void> {
    this.db
      .update(learnedPolicyRules)
      .set({ status: LearnedRuleStatusSchema.parse(status) })
      .where(eq(learnedPolicyRules.id, id))
      .run();
  }
}

function stringify(value: LearnedRuleConditions | null): string {
  if (!value) return "null";
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))));
}

function toLearnedRule(row: typeof learnedPolicyRules.$inferSelect): LearnedPolicyRule {
  return LearnedPolicyRuleSchema.parse({
    id: row.id,
    agentId: row.agentId,
    toolName: row.toolName,
    learnedDecision: row.learnedDecision,
    conditions: parseJson<LearnedRuleConditions | null>(row.conditions, null),
    evidenceCount: row.evidenceCount,
    consistencyRate: row.consistencyRate,
    status: row.status,
    suggestedAt: new Date(row.suggestedAt),
    acceptedAt: row.acceptedAt != null ? new Date(row.acceptedAt) : undefined,
    revokedAt: row.revokedAt != null ? new Date(row.revokedAt) : undefined,
    expiresAt: row.expiresAt != null ? new Date(row.expiresAt) : undefined,
    userNote: row.userNote ?? undefined,
    sourceApprovalIds: parseJson<string[]>(row.sourceApprovalIds, []),
  });
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (value == null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
