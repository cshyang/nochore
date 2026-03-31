import type { ApprovalRepository } from "../repositories/approval";
import type { LearnedRuleRepository } from "../repositories/learned-rule";
import type { LearnedPolicyRule } from "../types";
import { DEFAULT_DETECTION_CONFIG, type DetectionConfig, detectApprovalPatterns } from "./pattern-detector";

export async function detectAndSuggestLearnedRules(params: {
  agentId: string;
  approvalRepository: ApprovalRepository;
  learnedRuleRepository: LearnedRuleRepository;
  now?: Date;
  config?: Partial<DetectionConfig>;
}): Promise<LearnedPolicyRule[]> {
  const config: DetectionConfig = {
    ...DEFAULT_DETECTION_CONFIG,
    ...params.config,
  };

  const approvals = await params.approvalRepository.listByAgent(params.agentId, ["approved", "rejected"]);
  const patterns = detectApprovalPatterns(approvals, config, params.now ?? new Date());
  const suggestions: LearnedPolicyRule[] = [];

  for (const pattern of patterns) {
    if (await params.learnedRuleRepository.isSuppressed(pattern.agentId, pattern.toolName)) {
      continue;
    }

    const suggestion = await params.learnedRuleRepository.suggest({
      agentId: pattern.agentId,
      toolName: pattern.toolName,
      learnedDecision: pattern.decision === "approved" ? "auto" : "blocked",
      conditions: pattern.commonConditions,
      evidenceCount: pattern.count,
      consistencyRate: pattern.consistencyRate,
      sourceApprovalIds: pattern.sourceApprovalIds,
    });

    if (suggestion.created) {
      suggestions.push(suggestion.rule);
    }
  }

  return suggestions;
}
