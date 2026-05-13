import { type ReactNode, useEffect, useState } from "react";
import { Button } from "~/components/Button";
import { ProviderIcon, SettingsCard, SmallAction } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";
import { humanize } from "~/lib/text-format";
import type { AgentConnectionBindingView, ConnectionView, LearnedRuleView, ToolConfigEntryView } from "~/lib/types";

type ApprovalMode = ToolConfigEntryView["approvalMode"];
type GoogleAdsAccountOption = { id: string; formattedId: string; label: string };

const PROVIDER_CONFIG_FIELDS: Record<
  string,
  Array<{ key: string; label: string; placeholder: string; type?: "password" | "text"; secret?: boolean }>
> = {};

export interface SettingsConnectionCardProps {
  connection: ConnectionView;
  projectId: string;
  tools: ToolConfigEntryView[];
  scopedRules: LearnedRuleView[];
  scopedSuggestions: LearnedRuleView[];
  providerLogos?: Record<string, string>;
  binding?: AgentConnectionBindingView;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  onSetConnectionApproval: (mode: ApprovalMode) => void;
  onSetToolApproval: (toolName: string, mode: ApprovalMode) => void;
  onListGoogleAdsAccounts?: (connectionId?: string) => Promise<{ accounts?: GoogleAdsAccountOption[]; error?: string }>;
  onSetConnectionConfig?: (provider: string, config: Record<string, unknown>) => Promise<void> | void;
  onSetAgentConnectionBinding?: (binding: {
    provider: string;
    connectionId: string;
    resourceType?: string | null;
    resourceId?: string | null;
    resourceLabel?: string | null;
    alias?: string;
    purpose?: string | null;
    isDefault?: boolean;
  }) => Promise<void> | void;
  onAcceptLearnedRule?: (id: string) => void | Promise<void>;
  onDismissLearnedRule?: (id: string) => void | Promise<void>;
  onSuppressLearnedRule?: (id: string) => void | Promise<void>;
  onRevokeLearnedRule?: (id: string) => void | Promise<void>;
}

export function SettingsConnectionCard({
  connection,
  tools,
  scopedRules,
  scopedSuggestions,
  providerLogos = {},
  binding,
  onConnect,
  onDisconnect,
  onSetConnectionApproval,
  onSetToolApproval,
  onListGoogleAdsAccounts,
  onSetConnectionConfig,
  onSetAgentConnectionBinding,
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  onRevokeLearnedRule,
}: SettingsConnectionCardProps) {
  const meta = getProviderMetadata(connection.provider);
  const configFields =
    connection.provider === "googleads" && connection.connectedAccountId
      ? []
      : (PROVIDER_CONFIG_FIELDS[connection.provider] ?? []);
  const initialConfigValues = Object.fromEntries(
    configFields.map((field) => [field.key, field.secret ? "" : ((connection.config?.[field.key] as string) ?? "")]),
  );
  const [configValues, setConfigValues] = useState<Record<string, string>>(initialConfigValues);
  const [expanded, setExpanded] = useState(false);

  const isBuiltin = connection.provider === "builtin";
  const hasGoogleAdsAccountSelector = connection.provider === "googleads" && Boolean(connection.connectedAccountId);
  const connectionMode = deriveConnectionMode(tools);
  const ruleCount = scopedRules.length + scopedSuggestions.length;
  const hasConnectionActions = connection.provider !== "builtin";
  const hasBody =
    hasGoogleAdsAccountSelector || configFields.length > 0 || tools.length > 0 || ruleCount > 0 || hasConnectionActions;
  const canBulkSet = !isBuiltin && tools.length > 1;

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
                {connection.accountLabel ? ` · ${connection.accountLabel}` : ""}
                {tools.length > 0 ? ` · ${tools.length} tool${tools.length === 1 ? "" : "s"}` : ""}
                {hasGoogleAdsAccountSelector && getConfiguredGoogleAdsCustomerId(connection.config, binding)
                  ? ` · ${formatGoogleAdsCustomerId(getConfiguredGoogleAdsCustomerId(connection.config, binding)!)}`
                  : ""}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            {isBuiltin || tools.length === 0 ? null : <ConnectionStatusPill mode={connectionMode} />}
            {hasBody ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={COLORS.textSecondary}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                role="presentation"
                aria-hidden="true"
                style={{
                  transition: `transform ${MOTION.duration} ${MOTION.ease}`,
                  transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                  display: "block",
                  flexShrink: 0,
                }}
              >
                <title>{expanded ? "Collapse" : "Expand"}</title>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            ) : null}
          </div>
        </div>
      </button>

      {expanded && hasBody ? (
        <div style={{ borderTop: `1px solid ${COLORS.border}` }}>
          {configFields.length > 0 ? (
            <div style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
              {configFields.map((field) => {
                const configInputId = `connection-${connection.id}-${field.key}`;
                const isConfigured = Boolean(connection.config?.[`${field.key}Configured`]);
                return (
                  <div key={field.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label
                      htmlFor={configInputId}
                      style={{
                        width: 104,
                        fontSize: TYPE.scale.xs,
                        color: COLORS.textSecondary,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {field.label}
                    </label>
                    <input
                      id={configInputId}
                      type={field.type ?? "text"}
                      value={configValues[field.key] ?? ""}
                      onChange={(e) =>
                        setConfigValues((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                      onBlur={() => undefined}
                      placeholder={isConfigured ? "Stored - paste a new value to replace" : field.placeholder}
                      style={{
                        flex: 1,
                        minWidth: 0,
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
                );
              })}
            </div>
          ) : null}

          {hasGoogleAdsAccountSelector ? (
            <GoogleAdsAccountSelector
              connection={connection}
              binding={binding}
              expanded={expanded}
              onLoadAccounts={onListGoogleAdsAccounts}
              onSave={(customerId, label) =>
                onSetAgentConnectionBinding
                  ? onSetAgentConnectionBinding({
                      provider: connection.provider,
                      connectionId: connection.id,
                      resourceType: "google_ads_customer",
                      resourceId: customerId,
                      resourceLabel: label,
                      alias: `googleads_${customerId.replace(/\D/g, "")}`,
                      purpose: "Primary Google Ads account for this agent",
                      isDefault: true,
                    })
                  : onSetConnectionConfig?.(connection.provider, {
                      selectedCustomerId: customerId,
                      selectedCustomerLabel: label,
                      selectedCustomerSource: "user",
                    })
              }
            />
          ) : null}

          {tools.length > 0 ? (
            <div style={{ display: "grid" }}>
              <div
                style={{
                  padding: "12px 16px 6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                }}
              >
                <SectionLabel>{isBuiltin ? "Capabilities" : "Tools"}</SectionLabel>
                {canBulkSet ? (
                  <BulkApprovalControl
                    onApply={(mode) => onSetConnectionApproval(mode)}
                    currentMode={connectionMode}
                    toolCount={tools.length}
                  />
                ) : null}
              </div>
              {tools.map((tool, index) => (
                <ToolApprovalRow
                  key={tool.toolName}
                  tool={tool}
                  readOnly={isBuiltin}
                  isLast={index === tools.length - 1}
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
              <SmallAction color={COLORS.textSecondary} onClick={() => onConnect?.(connection.provider)}>
                Change account
              </SmallAction>
              {connection.connectedAccountId ? (
                <SmallAction
                  color={COLORS.red}
                  onClick={() => onDisconnect?.(connection.provider, connection.connectedAccountId!)}
                >
                  Disconnect
                </SmallAction>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </SettingsCard>
  );
}

function GoogleAdsAccountSelector({
  connection,
  binding,
  expanded,
  onLoadAccounts,
  onSave,
}: {
  connection: ConnectionView;
  binding?: AgentConnectionBindingView;
  expanded: boolean;
  onLoadAccounts?: (connectionId?: string) => Promise<{ accounts?: GoogleAdsAccountOption[]; error?: string }>;
  onSave: (customerId: string, label: string) => Promise<void> | void;
}) {
  const [accounts, setAccounts] = useState<GoogleAdsAccountOption[] | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState(
    getConfiguredGoogleAdsCustomerId(connection.config, binding) ?? "",
  );
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedCustomerId(getConfiguredGoogleAdsCustomerId(connection.config, binding) ?? "");
  }, [binding, connection.config]);

  useEffect(() => {
    if (!expanded || accounts || loading || !onLoadAccounts) return;
    setLoading(true);
    setError(null);
    void onLoadAccounts(connection.id)
      .then((result) => {
        setAccounts(result.accounts ?? []);
        setError(result.error ?? null);
      })
      .catch((err) => {
        setAccounts([]);
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setLoading(false));
  }, [accounts, connection.id, expanded, loading, onLoadAccounts]);

  const selectedAccount = accounts?.find((account) => account.id === selectedCustomerId);

  return (
    <div style={{ padding: "14px 16px", display: "grid", gap: 8 }}>
      <SectionLabel>Project account</SectionLabel>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label
          htmlFor={`connection-${connection.id}-googleads-account`}
          style={{ width: 104, fontSize: TYPE.scale.xs, color: COLORS.textSecondary, whiteSpace: "nowrap" }}
        >
          Customer ID
        </label>
        <select
          id={`connection-${connection.id}-googleads-account`}
          value={selectedCustomerId}
          disabled={loading || saving || !onLoadAccounts}
          onChange={(event) => {
            const next = event.target.value;
            const account = accounts?.find((item) => item.id === next);
            setSelectedCustomerId(next);
            setSaving(true);
            setError(null);
            void Promise.resolve(onSave(next, account?.label ?? formatGoogleAdsCustomerId(next)))
              .catch((err) => {
                setError(err instanceof Error ? err.message : String(err));
                setSelectedCustomerId(getConfiguredGoogleAdsCustomerId(connection.config, binding) ?? "");
              })
              .finally(() => setSaving(false));
          }}
          style={{
            flex: "1 1 260px",
            minWidth: 220,
            maxWidth: 420,
            padding: "7px 10px",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            background: COLORS.bg,
            color: selectedCustomerId ? COLORS.text : COLORS.textDim,
            fontSize: TYPE.scale.sm,
            fontFamily: TYPE.body,
            outline: "none",
          }}
        >
          <option value="">{loading ? "Loading accounts..." : "Choose account"}</option>
          {(accounts ?? []).map((account) => (
            <option key={account.id} value={account.id}>
              {account.label}
            </option>
          ))}
        </select>
        <span style={{ fontSize: TYPE.scale.xs, color: saving ? COLORS.accent : COLORS.textDim }}>
          {saving ? "Saving..." : selectedAccount ? "Selected" : ""}
        </span>
      </div>
      {error ? <div style={{ fontSize: TYPE.scale.xs, color: COLORS.orange }}>{error}</div> : null}
    </div>
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

function getConfiguredGoogleAdsCustomerId(
  config: ConnectionView["config"],
  binding?: AgentConnectionBindingView,
): string | null {
  const value = binding?.resourceId ?? config?.selectedCustomerId ?? config?.customerId;
  return typeof value === "string" && value.trim() ? normalizeGoogleAdsCustomerId(value) : null;
}

function normalizeGoogleAdsCustomerId(value: string): string {
  return value.replace(/\D/g, "");
}

function formatGoogleAdsCustomerId(value: string): string {
  const digits = normalizeGoogleAdsCustomerId(value);
  if (digits.length !== 10) return value;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function ConnectionStatusPill({ mode }: { mode: ApprovalMode | "mixed" }) {
  const { label, color } = describeMode(mode);
  return (
    <span
      style={{
        fontFamily: TYPE.body,
        fontSize: TYPE.scale.xs,
        fontWeight: TYPE.weight.medium,
        color,
        padding: "3px 10px",
        borderRadius: RADIUS.pill,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function BulkApprovalControl({
  onApply,
  currentMode,
  toolCount,
}: {
  onApply: (mode: ApprovalMode) => void;
  currentMode: ApprovalMode | "mixed";
  toolCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<ApprovalMode | null>(null);

  const request = (mode: ApprovalMode) => {
    if (currentMode === "mixed") {
      setPending(mode);
      return;
    }
    onApply(mode);
  };

  if (!open) {
    return (
      <SmallAction
        color={COLORS.textSecondary}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Set all…
      </SmallAction>
    );
  }

  if (pending) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontSize: TYPE.scale.xs,
          color: COLORS.textSecondary,
          fontFamily: TYPE.body,
        }}
      >
        <span>
          Set all {toolCount} tools to <strong style={{ color: COLORS.text }}>{describeMode(pending).label}</strong>?
        </span>
        <SmallAction
          color={COLORS.accent}
          onClick={(e) => {
            e.stopPropagation();
            onApply(pending);
            setPending(null);
            setOpen(false);
          }}
        >
          Apply
        </SmallAction>
        <SmallAction
          color={COLORS.textDim}
          onClick={(e) => {
            e.stopPropagation();
            setPending(null);
          }}
        >
          Cancel
        </SmallAction>
      </div>
    );
  }

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <ApprovalSegmented value={currentMode} onChange={(mode) => request(mode)} compact />
      <SmallAction
        color={COLORS.textDim}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(false);
        }}
      >
        Done
      </SmallAction>
    </div>
  );
}

function describeMode(mode: ApprovalMode | "mixed"): { label: string; color: string } {
  switch (mode) {
    case "auto":
      return { label: "All auto", color: COLORS.green };
    case "approval":
      return { label: "Approval required", color: COLORS.orange };
    case "blocked":
      return { label: "Blocked", color: COLORS.red };
    default:
      return { label: "Mixed", color: COLORS.textSecondary };
  }
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

function ToolApprovalRow({
  tool,
  readOnly = false,
  isLast = false,
  onChange,
}: {
  tool: ToolConfigEntryView;
  readOnly?: boolean;
  isLast?: boolean;
  onChange: (mode: ApprovalMode) => void;
}) {
  return (
    <div
      style={{
        padding: "10px 16px",
        borderBottom: isLast ? "none" : `1px solid ${COLORS.border}`,
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
      {readOnly ? null : <ApprovalSegmented value={tool.approvalMode} onChange={onChange} compact />}
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
      {options.map((option) => (
        <SegmentedOption
          key={option.value}
          label={option.label}
          isActive={value === option.value}
          compact={compact}
          onClick={() => onChange(option.value)}
        />
      ))}
    </div>
  );
}

function SegmentedOption({
  label,
  isActive,
  compact,
  onClick,
}: {
  label: string;
  isActive: boolean;
  compact: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);

  const background = isActive ? COLORS.accentDim : hovered ? COLORS.surfaceHover : "transparent";
  const textColor = isActive ? COLORS.accent : hovered ? COLORS.text : COLORS.textSecondary;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setPressed(false);
      }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      style={{
        border: "none",
        borderRadius: RADIUS.pill,
        padding: compact ? "4px 10px" : "6px 12px",
        background,
        color: textColor,
        fontFamily: TYPE.body,
        fontSize: TYPE.scale.xs,
        fontWeight: TYPE.weight.medium,
        cursor: "pointer",
        transition: "background 120ms ease, color 120ms ease, transform 80ms ease",
        transform: pressed ? "scale(0.94)" : "scale(1)",
      }}
    >
      {label}
    </button>
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
