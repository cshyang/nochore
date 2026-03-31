import { createServerFn } from "@tanstack/react-start";
import { getProjectDeps } from "./deps";
import { jsonSafe } from "./serializable";

export const acceptLearnedRuleSuggestion = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; ruleId: string }) => input)
  .handler(async ({ data: { projectId, ruleId } }) => {
    const { approvalRepository, learnedRuleRepository, runEventRepository } = getProjectDeps(projectId);
    const rule = await learnedRuleRepository.getById(ruleId);
    if (!rule) {
      throw new Error("Learned rule not found");
    }

    await learnedRuleRepository.accept(ruleId);

    const sourceApprovalId = rule.sourceApprovalIds[0];
    const sourceApproval = sourceApprovalId ? await approvalRepository.getById(sourceApprovalId) : null;
    if (sourceApproval) {
      await runEventRepository.append({
        runId: sourceApproval.runId,
        agentId: sourceApproval.agentId,
        timestamp: new Date(),
        type: "policy_rule_accepted",
        payload: {
          ruleId: rule.id,
          toolName: rule.toolName,
          learnedDecision: rule.learnedDecision,
        },
      });
    }

    return jsonSafe({ ok: true, ruleId, status: "accepted" as const });
  });

export const dismissLearnedRuleSuggestion = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; ruleId: string }) => input)
  .handler(async ({ data: { projectId, ruleId } }) => {
    const { learnedRuleRepository } = getProjectDeps(projectId);
    await learnedRuleRepository.dismiss(ruleId);
    return jsonSafe({ ok: true, ruleId, status: "dismissed" as const });
  });

export const suppressLearnedRuleSuggestion = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; ruleId: string }) => input)
  .handler(async ({ data: { projectId, ruleId } }) => {
    const { learnedRuleRepository } = getProjectDeps(projectId);
    const rule = await learnedRuleRepository.getById(ruleId);
    if (!rule) {
      throw new Error("Learned rule not found");
    }

    await learnedRuleRepository.dismiss(ruleId);
    await learnedRuleRepository.suppressSuggestion(rule.agentId, rule.toolName);

    return jsonSafe({ ok: true, ruleId, status: "suppressed" as const });
  });

export const revokeLearnedRule = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; ruleId: string }) => input)
  .handler(async ({ data: { projectId, ruleId } }) => {
    const { learnedRuleRepository } = getProjectDeps(projectId);
    await learnedRuleRepository.revoke(ruleId);
    return jsonSafe({ ok: true, ruleId, status: "revoked" as const });
  });
