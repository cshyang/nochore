import { describe, expect, it } from "vitest";
import { createTestDb } from "../../db/client";
import { LearnedRuleRepository, type SuggestLearnedRuleInput } from "../learned-rule";

function makeInput(overrides: Partial<SuggestLearnedRuleInput> = {}): SuggestLearnedRuleInput {
  return {
    agentId: "agent_001",
    toolName: "GOOGLEADS_ADD_NEGATIVE_KEYWORD",
    learnedDecision: "auto",
    conditions: null,
    evidenceCount: 5,
    consistencyRate: 1.0,
    sourceApprovalIds: ["appr_1", "appr_2"],
    ...overrides,
  };
}

describe("LearnedRuleRepository.suggest", () => {
  it("inserts a new suggestion and returns created=true", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const { created, rule } = await repo.suggest(makeInput());

    expect(created).toBe(true);
    expect(rule.status).toBe("suggested");
    expect(rule.learnedDecision).toBe("auto");
    expect(rule.sourceApprovalIds).toEqual(["appr_1", "appr_2"]);
  });

  it("returns created=false when an identical rule already exists", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const input = makeInput();

    const first = await repo.suggest(input);
    const second = await repo.suggest(input);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.rule.id).toBe(first.rule.id);
  });

  it("treats suggestions with differently-ordered conditions as identical", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const first = await repo.suggest(
      makeInput({
        conditions: { mode: { operator: "eq", value: "read" }, provider: { operator: "eq", value: "googleads" } },
      }),
    );
    const second = await repo.suggest(
      makeInput({
        conditions: { provider: { operator: "eq", value: "googleads" }, mode: { operator: "eq", value: "read" } },
      }),
    );

    expect(second.created).toBe(false);
    expect(second.rule.id).toBe(first.rule.id);
  });

  it("supersedes conflicting rules when decision differs", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const first = await repo.suggest(makeInput({ learnedDecision: "auto" }));
    const second = await repo.suggest(makeInput({ learnedDecision: "blocked" }));

    expect(second.created).toBe(true);
    const firstAfter = await repo.getById(first.rule.id);
    expect(firstAfter?.status).toBe("revoked");
    expect(firstAfter?.revokedAt).toBeInstanceOf(Date);
  });
});

describe("LearnedRuleRepository status transitions", () => {
  it("accept moves a suggestion into listActive", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const { rule } = await repo.suggest(makeInput());

    expect(await repo.listActive("agent_001")).toHaveLength(0);

    await repo.accept(rule.id, "looks right");
    const active = await repo.listActive("agent_001");
    expect(active).toHaveLength(1);
    expect(active[0]!.userNote).toBe("looks right");
    expect(active[0]!.status).toBe("accepted");
  });

  it("accept with modifications updates decision and conditions", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const { rule } = await repo.suggest(makeInput({ learnedDecision: "auto" }));

    await repo.accept(rule.id, undefined, {
      learnedDecision: "blocked",
      conditions: { mode: { operator: "eq", value: "write" } },
    });

    const after = await repo.getById(rule.id);
    expect(after?.learnedDecision).toBe("blocked");
    expect(after?.conditions).toEqual({ mode: { operator: "eq", value: "write" } });
  });

  it("dismiss transitions a rule out of listSuggested", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const { rule } = await repo.suggest(makeInput());

    expect(await repo.listSuggested("agent_001")).toHaveLength(1);

    await repo.dismiss(rule.id);
    expect(await repo.listSuggested("agent_001")).toHaveLength(0);
  });

  it("revoke stamps revokedAt and removes from listActive", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    const { rule } = await repo.suggest(makeInput());
    await repo.accept(rule.id);

    await repo.revoke(rule.id);
    expect(await repo.listActive("agent_001")).toHaveLength(0);

    const after = await repo.getById(rule.id);
    expect(after?.status).toBe("revoked");
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });
});

describe("LearnedRuleRepository suppressions", () => {
  it("suppressSuggestion is idempotent", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    await repo.suppressSuggestion("agent_001", "TOOL_A");
    await repo.suppressSuggestion("agent_001", "TOOL_A");

    expect(await repo.isSuppressed("agent_001", "TOOL_A")).toBe(true);
  });

  it("isSuppressed returns false for unknown agent/tool pairs", async () => {
    const repo = new LearnedRuleRepository(createTestDb());
    expect(await repo.isSuppressed("agent_001", "TOOL_A")).toBe(false);

    await repo.suppressSuggestion("agent_001", "TOOL_A");
    expect(await repo.isSuppressed("agent_002", "TOOL_A")).toBe(false);
    expect(await repo.isSuppressed("agent_001", "TOOL_B")).toBe(false);
  });
});
