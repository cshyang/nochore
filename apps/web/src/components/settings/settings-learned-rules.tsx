import type { ReactNode } from "react";
import { Button } from "~/components/Button";
import { SettingsCard } from "~/components/SettingsComponents";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { humanize } from "~/lib/text-format";
import type { LearnedRuleView } from "~/lib/types";

export interface SettingsLearnedRulesProps {
  learnedRules: LearnedRuleView[];
  learnedRuleSuggestions: LearnedRuleView[];
  onAcceptLearnedRule?: (id: string) => void | Promise<void>;
  onDismissLearnedRule?: (id: string) => void | Promise<void>;
  onSuppressLearnedRule?: (id: string) => void | Promise<void>;
  onRevokeLearnedRule?: (id: string) => void | Promise<void>;
}

export function SettingsLearnedRules({
  learnedRules,
  learnedRuleSuggestions,
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  onRevokeLearnedRule,
}: SettingsLearnedRulesProps) {
  return (
    <SettingsCard>
      {learnedRules.length === 0 && learnedRuleSuggestions.length === 0 ? (
        <div style={{ padding: "16px", color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
          No learned rules yet. Repeated approval decisions will start surfacing here once the agent has enough
          evidence.
        </div>
      ) : null}

      {learnedRules.length > 0 ? (
        <PolicyRuleGroup label="Learned">
          {learnedRules.map((rule) => (
            <PolicyRuleCard
              key={rule.id}
              rule={rule}
              actions={
                onRevokeLearnedRule ? (
                  <Button variant="secondary" size="sm" onClick={() => void onRevokeLearnedRule(rule.id)}>
                    Revoke
                  </Button>
                ) : null
              }
            />
          ))}
        </PolicyRuleGroup>
      ) : null}

      {learnedRuleSuggestions.length > 0 ? (
        <PolicyRuleGroup label="Suggestions" bordered={learnedRules.length > 0}>
          {learnedRuleSuggestions.map((rule) => (
            <PolicyRuleCard
              key={rule.id}
              rule={rule}
              highlight
              actions={
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onAcceptLearnedRule ? (
                    <Button size="sm" onClick={() => void onAcceptLearnedRule(rule.id)}>
                      Accept
                    </Button>
                  ) : null}
                  {onDismissLearnedRule ? (
                    <Button variant="secondary" size="sm" onClick={() => void onDismissLearnedRule(rule.id)}>
                      Dismiss
                    </Button>
                  ) : null}
                  {onSuppressLearnedRule ? (
                    <Button variant="ghost" size="sm" onClick={() => void onSuppressLearnedRule(rule.id)}>
                      Never
                    </Button>
                  ) : null}
                </div>
              }
            />
          ))}
        </PolicyRuleGroup>
      ) : null}
    </SettingsCard>
  );
}

function PolicyRuleGroup({
  label,
  bordered = false,
  children,
}: {
  label: string;
  bordered?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={{ borderTop: bordered ? `1px solid ${COLORS.border}` : "none" }}>
      <div
        style={{
          padding: "14px 16px 0",
          fontSize: TYPE.scale.xs,
          fontWeight: TYPE.weight.semibold,
          letterSpacing: TYPE.tracking.wide,
          textTransform: "uppercase",
          color: COLORS.textDim,
        }}
      >
        {label}
      </div>
      <div style={{ padding: "10px 16px 16px", display: "grid", gap: 12 }}>{children}</div>
    </div>
  );
}

function PolicyRuleCard({
  rule,
  actions,
  highlight = false,
}: {
  rule: LearnedRuleView;
  actions?: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderRadius: RADIUS.lg,
        border: `1px solid ${highlight ? COLORS.orange : COLORS.border}`,
        background: highlight ? COLORS.orangeSubtle : COLORS.bg,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}
      >
        <div style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
          {describeDecision(rule.learnedDecision)} {humanize(rule.toolName)}
        </div>
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          {(rule.consistencyRate * 100).toFixed(0)}% agreement
        </div>
      </div>

      <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>{describeConditions(rule)}</div>

      <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
        Based on {rule.evidenceCount} consistent decision{rule.evidenceCount === 1 ? "" : "s"}.
      </div>

      {actions ? <div>{actions}</div> : null}
    </div>
  );
}

function describeDecision(decision: LearnedRuleView["learnedDecision"]): string {
  switch (decision) {
    case "auto":
      return "Auto-approve";
    case "blocked":
      return "Block";
    default:
      return "Require approval for";
  }
}

function describeConditions(rule: LearnedRuleView): string {
  if (!rule.conditions || Object.keys(rule.conditions).length === 0) {
    return "When: always";
  }

  const parts = Object.entries(rule.conditions).map(([field, condition]) => {
    const fieldLabel = humanize(field);
    const valueLabel = formatConditionValue(condition.value);

    switch (condition.operator) {
      case "eq":
        return `${fieldLabel} is ${valueLabel}`;
      case "lt":
        return `${fieldLabel} < ${valueLabel}`;
      case "gt":
        return `${fieldLabel} > ${valueLabel}`;
      case "lte":
        return `${fieldLabel} ≤ ${valueLabel}`;
      case "gte":
        return `${fieldLabel} ≥ ${valueLabel}`;
      case "in":
        return `${fieldLabel} in ${valueLabel}`;
      default:
        return `${fieldLabel} matches ${valueLabel}`;
    }
  });

  return `When: ${parts.join(" and ")}`;
}

function formatConditionValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }

  if (typeof value === "string") {
    return value;
  }

  return String(value);
}
