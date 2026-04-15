import { type ReactNode, useState } from "react";
import { Button } from "~/components/Button";
import { ProviderIcon, SettingsCard, smallActionStyle } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";
import { humanize } from "~/lib/text-format";
import type { ConnectionView, LearnedRuleView, ToolConfigEntryView } from "~/lib/types";
import { updateConnectionConfig } from "~/server/connections";

type ApprovalMode = ToolConfigEntryView["approvalMode"];

const PROVIDER_CONFIG_FIELDS: Record<string, { key: string; label: string; placeholder: string }> = {
  googleads: { key: "customerId", label: "Customer ID", placeholder: "e.g. 123-456-7890" },
};

export interface SettingsConnectionCardProps {
  connection: ConnectionView;
  projectId: string;
  tools: ToolConfigEntryView[];
  scopedRules: LearnedRuleView[];
  scopedSuggestions: LearnedRuleView[];
  providerLogos?: Record<string, string>;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  onSetConnectionApproval: (mode: ApprovalMode) => void;
  onSetToolApproval: (toolName: string, mode: ApprovalMode) => void;
  onAcceptLearnedRule?: (id: string) => void | Promise<void>;
  onDismissLearnedRule?: (id: string) => void | Promise<void>;
  onSuppressLearnedRule?: (id: string) => void | Promise<void>;
  onRevokeLearnedRule?: (id: string) => void | Promise<void>;
}

export function SettingsConnectionCard({
  connection,
  projectId,
  tools,
  scopedRules,
  scopedSuggestions,
  providerLogos = {},
  onConnect,
  onDisconnect,
  onSetConnectionApproval,
  onSetToolApproval,
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  onRevokeLearnedRule,
}: SettingsConnectionCardProps) {
  const meta = getProviderMetadata(connection.provider);
  const configField = PROVIDER_CONFIG_FIELDS[connection.provider];
  const existingValue = configField ? ((connection.config?.[configField.key] as string) ?? "") : "";
  const configInputId = configField ? `connection-${connection.id}-${configField.key}` : undefined;
  const [configValue, setConfigValue] = useState(existingValue);
  const [expanded, setExpanded] = useState(false);

  const connectionMode = deriveConnectionMode(tools);
  const ruleCount = scopedRules.length + scopedSuggestions.length;
  const hasBody = Boolean(configField) || tools.length > 0 || ruleCount > 0;

  const saveConfig = async () => {
    if (!configField || configValue === existingValue) return;
    await updateConnectionConfig({
      data: { projectId, provider: connection.provider, config: { [configField.key]: configValue.trim() } },
    });
  };

  return (
    <SettingsCard>
      <button
        type="button"
        onClick={() => hasBody && setExpanded((prev) => !prev)}
        style={{
          all: "unset",
          cursor: hasBody ? "pointer" : "default",
          display: "block",
          width: "100%",
          padding: "14px 16px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <ProviderIcon provider={connection.provider} logos={providerLogos} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
                {meta.name}
              </div>
              <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 2 }}>
                {connection.provider === "builtin" ? (
                  <>
                    <span style={{ color: COLORS.accent }}>✦</span> Always available
                  </>
                ) : (
                  <>
                    <span style={{ color: COLORS.green }}>●</span> Connected · authorized by{" "}
                    {connection.authorizedByUserId ?? "you"}
                  </>
                )}
                {tools.length > 0 ? ` · ${tools.length} tool${tools.length === 1 ? "" : "s"}` : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <ApprovalSegmented value={connectionMode} onChange={(mode) => onSetConnectionApproval(mode)} compact />
            {hasBody ? (
              <span
                style={{
                  color: COLORS.textDim,
                  fontSize: TYPE.scale.sm,
                  transition: `transform ${MOTION.duration} ${MOTION.ease}`,
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  display: "inline-block",
                }}
                aria-hidden
              >
                ▾
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {expanded && hasBody ? (
        <div style={{ borderTop: `1px solid ${COLORS.border}` }}>
          {configField ? (
            <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <label
                htmlFor={configInputId}
                style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, whiteSpace: "nowrap" }}
              >
                {configField.label}
              </label>
              <input
                id={configInputId}
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
                onBlur={() => void saveConfig()}
                placeholder={configField.placeholder}
                style={{
                  flex: 1,
                  padding: "6px 10px",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  background: COLORS.bg,
                  color: COLORS.text,
                  fontSize: TYPE.scale.sm,
                  fontFamily: TYPE.body,
                  outline: "none",
                }}
              />
            </div>
          ) : null}

          {tools.length > 0 ? (
            <div style={{ padding: "14px 16px", display: "grid", gap: 8 }}>
              <SectionLabel>Tools</SectionLabel>
              {tools.map((tool) => (
                <ToolApprovalRow
                  key={tool.toolName}
                  tool={tool}
                  onChange={(mode) => onSetToolApproval(tool.toolName, mode)}
                />
              ))}
            </div>
          ) : null}

          {ruleCount > 0 ? (
            <div style={{ padding: "14px 16px", display: "grid", gap: 8, borderTop: `1px solid ${COLORS.border}` }}>
              <SectionLabel>Learned rules</SectionLabel>
              {scopedRules.map((rule) => (
                <LearnedRuleCard
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
              {scopedSuggestions.map((rule) => (
                <LearnedRuleCard
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
            </div>
          ) : null}

          {connection.provider !== "builtin" ? (
            <div
              style={{
                padding: "10px 16px 14px",
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                borderTop: `1px solid ${COLORS.border}`,
              }}
            >
              <button
                type="button"
                onClick={() => onConnect?.(connection.provider)}
                style={smallActionStyle(COLORS.textSecondary)}
              >
                Reconnect
              </button>
              {connection.connectedAccountId ? (
                <button
                  type="button"
                  onClick={() => onDisconnect?.(connection.provider, connection.connectedAccountId!)}
                  style={smallActionStyle(COLORS.red)}
                >
                  Disconnect
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsCard>
  );
}

function deriveConnectionMode(tools: ToolConfigEntryView[]): ApprovalMode | "mixed" {
  if (tools.length === 0) return "auto";
  const modes = new Set(tools.map((t) => t.approvalMode));
  if (modes.size === 1) {
    return tools[0].approvalMode;
  }
  return "mixed";
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: TYPE.scale.xs,
        fontWeight: TYPE.weight.semibold,
        letterSpacing: TYPE.tracking.wide,
        textTransform: "uppercase",
        color: COLORS.textDim,
      }}
    >
      {children}
    </div>
  );
}

function ToolApprovalRow({ tool, onChange }: { tool: ToolConfigEntryView; onChange: (mode: ApprovalMode) => void }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: RADIUS.md,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium, color: COLORS.text }}>{tool.title}</div>
        {tool.description ? (
          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, marginTop: 2 }}>{tool.description}</div>
        ) : null}
      </div>
      <ApprovalSegmented value={tool.approvalMode} onChange={onChange} compact />
    </div>
  );
}

function ApprovalSegmented({
  value,
  onChange,
  compact = false,
}: {
  value: ApprovalMode | "mixed";
  onChange: (mode: ApprovalMode) => void;
  compact?: boolean;
}) {
  const options: Array<{ value: ApprovalMode; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "approval", label: "Approve" },
    { value: "blocked", label: "Block" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        gap: 2,
        padding: 3,
        borderRadius: RADIUS.pill,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}
    >
      {options.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            type="button"
            key={option.value}
            onClick={(e) => {
              e.stopPropagation();
              onChange(option.value);
            }}
            style={{
              border: "none",
              borderRadius: RADIUS.pill,
              padding: compact ? "4px 10px" : "6px 12px",
              background: isActive ? COLORS.accentDim : "transparent",
              color: isActive ? COLORS.accent : COLORS.textSecondary,
              fontFamily: TYPE.body,
              fontSize: TYPE.scale.xs,
              fontWeight: TYPE.weight.medium,
              cursor: "pointer",
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function LearnedRuleCard({
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
        padding: "12px 14px",
        borderRadius: RADIUS.md,
        border: `1px solid ${highlight ? COLORS.orange : COLORS.border}`,
        background: highlight ? COLORS.orangeSubtle : COLORS.bg,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
          {describeDecision(rule.learnedDecision)} {humanize(rule.toolName)}
        </div>
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          {(rule.consistencyRate * 100).toFixed(0)}% agreement
        </div>
      </div>
      <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary }}>{describeConditions(rule)}</div>
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
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "string") return value;
  return String(value);
}
