import { useEffect, useMemo, useState } from "react";
import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import { Button } from "~/components/Button";
import { SectionHeading, SettingsCard, SettingsRow } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { CONNECTABLE_PROVIDER_SLUGS, getProviderMetadata } from "~/lib/provider-metadata";
import type {
  ConnectionView,
  LearnedRuleView,
  NotificationConfigView,
  ToolConfigEntryView,
  ToolConfigView,
} from "~/lib/types";
import { updateConnectionConfig } from "~/server/connections";

const fieldStyle = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.lg,
  background: COLORS.bg,
  color: COLORS.text,
  padding: "12px 14px",
  fontSize: TYPE.scale.base,
  lineHeight: TYPE.leading.normal,
  outline: "none",
  fontFamily: TYPE.body,
  transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
};

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getNotificationConfig(notificationConfig: NotificationConfigView | undefined): NotificationConfigView {
  return notificationConfig ?? { inApp: true, email: false, slack: false };
}

export function AgentWorkspaceSettingsPanel({
  agent,
  skills,
  connections,
  policyToolCatalog = [],
  learnedRuleSuggestions = [],
  learnedRules = [],
  onUpdateAgent,
  onConnect,
  onDisconnect,
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  onRevokeLearnedRule,
  providerLogos = {},
}: {
  agent: AgentWorkspaceProps["agent"];
  skills: NonNullable<AgentWorkspaceProps["availableSkills"]>;
  connections: NonNullable<AgentWorkspaceProps["projectConnections"]>;
  policyToolCatalog?: NonNullable<AgentWorkspaceProps["policyToolCatalog"]>;
  learnedRuleSuggestions?: LearnedRuleView[];
  learnedRules?: LearnedRuleView[];
  onUpdateAgent?: AgentWorkspaceProps["onUpdateAgent"];
  onConnect?: AgentWorkspaceProps["onConnect"];
  onDisconnect?: AgentWorkspaceProps["onDisconnect"];
  onAcceptLearnedRule?: AgentWorkspaceProps["onAcceptLearnedRule"];
  onDismissLearnedRule?: AgentWorkspaceProps["onDismissLearnedRule"];
  onSuppressLearnedRule?: AgentWorkspaceProps["onSuppressLearnedRule"];
  onRevokeLearnedRule?: AgentWorkspaceProps["onRevokeLearnedRule"];
  providerLogos?: Record<string, string>;
}) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [instructions, setInstructions] = useState(agent.instructions ?? "");
  const [schedule, setSchedule] = useState(agent.schedule ?? "manual");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(agent.skills ?? []);
  const [notificationConfig, setNotificationConfig] = useState(getNotificationConfig(agent.notificationConfig));
  const [primaryMetric, setPrimaryMetric] = useState(agent.primaryMetric ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description ?? "");
    setInstructions(agent.instructions ?? "");
    setSchedule(agent.schedule ?? "manual");
    setSelectedSkills(agent.skills ?? []);
    setNotificationConfig(getNotificationConfig(agent.notificationConfig));
    setPrimaryMetric(agent.primaryMetric ?? "");
  }, [agent]);

  const persist = async (patch: Partial<Parameters<NonNullable<AgentWorkspaceProps["onUpdateAgent"]>>[0]>) => {
    if (!onUpdateAgent) return;
    setSaving(true);
    try {
      await onUpdateAgent(patch);
    } finally {
      setSaving(false);
    }
  };

  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const connectedProviders = new Set(connections.filter((c) => c.status === "active").map((c) => c.provider));
  const projectId = agent.projectId ?? "";
  const currentToolConfig = agent.toolConfig ?? { globalApprovalRequired: false, requiredProviders: [], tools: {} };
  const policyTools = useMemo(
    () => buildPolicyTools(currentToolConfig, policyToolCatalog, connectedProviders),
    [currentToolConfig, policyToolCatalog, connectedProviders],
  );

  const persistToolConfig = async (nextToolConfig: ToolConfigView) => {
    await persist({ toolConfig: nextToolConfig });
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeading>Outcome</SectionHeading>
      <SettingsCard>
        <SettingsRow icon="✦" title="Name" description="How the workspace refers to this agent." defaultExpanded>
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void persist({ name })}
            style={fieldStyle}
          />
        </SettingsRow>
        <SettingsRow icon="◌" title="Description" description="A concise summary of the agent's job." defaultExpanded>
          <textarea
            className="textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            onBlur={() => void persist({ description })}
            rows={4}
            style={{ ...fieldStyle, minHeight: 120, resize: "vertical" }}
          />
        </SettingsRow>
        <SettingsRow icon="◷" title="Schedule" value={humanize(schedule)} defaultExpanded>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {["manual", "hourly", "6hours", "daily", "weekly"].map((value) => (
              <button
                type="button"
                className="pill"
                key={value}
                onClick={() => {
                  setSchedule(value);
                  void persist({ schedule: value });
                }}
                style={{
                  fontFamily: TYPE.body,
                  padding: "6px 14px",
                  borderRadius: RADIUS.pill,
                  border: `1px solid ${schedule === value ? COLORS.accent : COLORS.border}`,
                  background: schedule === value ? COLORS.accentDim : "transparent",
                  color: schedule === value ? COLORS.accent : COLORS.textSecondary,
                  fontSize: TYPE.scale.xs,
                  fontWeight: TYPE.weight.medium,
                  cursor: "pointer",
                  transition: `all ${MOTION.duration} ${MOTION.ease}`,
                }}
              >
                {humanize(value)}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow icon="⟡" title="Strategy note" description="Tell the agent what to optimize for, what to avoid, and how to think." defaultExpanded>
          <textarea
            className="textarea"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            onBlur={() => void persist({ instructions })}
            placeholder="Tell the agent what to optimize for, what to avoid, and how to think."
            rows={12}
            style={{ ...fieldStyle, minHeight: 220, resize: "vertical" }}
          />
          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <span style={{ color: COLORS.textDim, fontSize: TYPE.scale.xs }}>
              {saving ? "Saving changes..." : "The instructions become the agent's working prompt."}
            </span>
            <Button variant="secondary" size="sm" onClick={() => void persist({ instructions, description, name })}>
              Save instructions
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>

      <SectionHeading>Success Metric</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="◎"
          title="Primary metric"
          description="The comparability key that identifies which observed metric to track. Your agent will emit metric observations during runs."
          defaultExpanded
        >
          <input
            className="input"
            value={primaryMetric}
            onChange={(event) => setPrimaryMetric(event.target.value)}
            onBlur={() => void persist({ primaryMetric })}
            placeholder="e.g., qualified_cpa|last_7_days|account"
            style={{ ...fieldStyle, fontFamily: TYPE.mono, fontSize: TYPE.scale.sm }}
          />
        </SettingsRow>
      </SettingsCard>

      <SectionHeading>Systems</SectionHeading>
      <div style={{ display: "grid", gap: 6 }}>
        {connections
          .filter((c) => c.status === "active")
          .map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              projectId={projectId}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              providerLogos={providerLogos}
            />
          ))}

        {showProviderPicker ? (
          <SettingsCard>
            <div style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginBottom: 10 }}>
                Select a provider to connect
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {CONNECTABLE_PROVIDER_SLUGS.filter((slug) => !connectedProviders.has(slug)).map((slug) => {
                  const meta = getProviderMetadata(slug);
                  return (
                    <button
                      type="button"
                      key={slug}
                      onClick={() => {
                        setShowProviderPicker(false);
                        onConnect?.(slug);
                      }}
                      style={{
                        fontFamily: TYPE.body,
                        padding: "8px 14px",
                        borderRadius: RADIUS.lg,
                        border: `1px solid ${COLORS.border}`,
                        background: "transparent",
                        color: COLORS.text,
                        fontSize: TYPE.scale.sm,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        transition: `all ${MOTION.duration} ${MOTION.ease}`,
                      }}
                    >
                      <ProviderIcon provider={slug} logos={providerLogos} size={16} /> {meta.name}
                      {meta.connectionType === "direct" ? (
                        <span
                          style={{
                            fontSize: 10,
                            color: COLORS.accent,
                            border: `1px solid ${COLORS.accent}`,
                            borderRadius: RADIUS.pill,
                            padding: "1px 6px",
                            marginLeft: 2,
                          }}
                        >
                          Direct
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setShowProviderPicker(false)}
                style={{
                  fontFamily: TYPE.body,
                  marginTop: 10,
                  padding: "4px 10px",
                  border: "none",
                  background: "transparent",
                  color: COLORS.textDim,
                  fontSize: TYPE.scale.xs,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </SettingsCard>
        ) : (
          <button
            type="button"
            onClick={() => setShowProviderPicker(true)}
            style={{
              fontFamily: TYPE.body,
              padding: "12px 16px",
              borderRadius: RADIUS.lg,
              border: `1px dashed ${COLORS.border}`,
              background: "transparent",
              color: COLORS.textSecondary,
              fontSize: TYPE.scale.sm,
              cursor: "pointer",
              textAlign: "center",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
            }}
          >
            + Add connection
          </button>
        )}
      </div>

      <SectionHeading>Tools & Permissions</SectionHeading>
      <SettingsCard>
        {skills.length === 0 && policyTools.length === 0 ? (
          <div style={{ padding: SPACE[4], color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
            No skills or tools available yet.
          </div>
        ) : (
          <>
            {skills.map((skill) => {
              const isEnabled = selectedSkills.includes(skill.id);

              return (
                <SettingsRow
                  key={skill.id}
                  icon="◈"
                  title={skill.name}
                  description={skill.description}
                  trailing={
                    <Toggle
                      checked={isEnabled}
                      onChange={() => {
                        const next = isEnabled
                          ? selectedSkills.filter((id) => id !== skill.id)
                          : [...selectedSkills, skill.id];
                        setSelectedSkills(next);
                        void persist({ skills: next });
                      }}
                    />
                  }
                />
              );
            })}
            {policyTools.map((tool, index) => (
              <ToolIdentityRow key={tool.toolName} tool={tool} isLast={index === policyTools.length - 1} />
            ))}
          </>
        )}
      </SettingsCard>

      <SectionHeading>Policy</SectionHeading>
      <SettingsCard>
        <PolicyHeaderRow
          checked={currentToolConfig.globalApprovalRequired}
          onChange={(checked) =>
            void persistToolConfig({
              ...currentToolConfig,
              globalApprovalRequired: checked,
            })
          }
        />

        {policyTools.length > 0 ? (
          <div style={{ padding: "0 16px 16px", display: "grid", gap: 10 }}>
            {policyTools.map((tool) => (
              <PolicyApprovalRow
                key={tool.toolName}
                tool={tool}
                onChange={(approvalMode) =>
                  void persistToolConfig({
                    ...currentToolConfig,
                    tools: {
                      ...currentToolConfig.tools,
                      [tool.toolName]: {
                        ...tool,
                        approvalMode,
                      },
                    },
                  })
                }
              />
            ))}
          </div>
        ) : (
          <div style={{ padding: SPACE[4], color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
            Connect a provider to configure approval policy for its tools.
          </div>
        )}

        {learnedRules.length === 0 && learnedRuleSuggestions.length === 0 ? (
          <div style={{ padding: "0 16px 16px", color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
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

      <SectionHeading>Notifications</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="◎"
          title="In-app"
          description="Show events in Nochore."
          trailing={
            <Toggle
              checked={notificationConfig.inApp !== false}
              onChange={(checked) => {
                const next = { ...notificationConfig, inApp: checked };
                setNotificationConfig(next);
                void persist({ notificationConfig: next });
              }}
            />
          }
        />
        <SettingsRow
          icon="✉"
          title="Email"
          description="Send email summaries."
          trailing={
            <Toggle
              checked={notificationConfig.email === true}
              onChange={(checked) => {
                const next = { ...notificationConfig, email: checked };
                setNotificationConfig(next);
                void persist({ notificationConfig: next });
              }}
            />
          }
        />
        <SettingsRow
          icon="▣"
          title="Slack"
          description="Notify a Slack channel."
          isLast
          trailing={
            <Toggle
              checked={notificationConfig.slack === true}
              onChange={(checked) => {
                const next = { ...notificationConfig, slack: checked };
                setNotificationConfig(next);
                void persist({ notificationConfig: next });
              }}
            />
          }
        />
      </SettingsCard>
    </div>
  );
}

function PolicyHeaderRow({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <SettingsRow
      icon="⚑"
      title="Require approval for all write actions"
      description="A global override. Reads stay auto unless you tighten a tool explicitly."
      defaultExpanded
      trailing={<Toggle checked={checked} onChange={onChange} />}
    />
  );
}

function ToolIdentityRow({ tool, isLast }: { tool: ToolConfigEntryView; isLast?: boolean }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        borderBottom: isLast ? "none" : `1px solid ${COLORS.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
          {tool.title}
        </div>
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, marginTop: 2 }}>
          {humanize(tool.provider || "tool")}
          {tool.description ? ` — ${tool.description}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        <span
          style={{
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            padding: "2px 8px",
            borderRadius: RADIUS.pill,
            border: `1px solid ${COLORS.border}`,
            color: tool.mode === "write" ? COLORS.orange : COLORS.textSecondary,
          }}
        >
          {tool.mode === "write" ? "Write" : "Read"}
        </span>
        {tool.enabled ? (
          <span style={{ fontSize: TYPE.scale.xs, color: COLORS.green }}>Enabled</span>
        ) : (
          <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>Disabled</span>
        )}
      </div>
    </div>
  );
}

function PolicyApprovalRow({
  tool,
  onChange,
}: {
  tool: ToolConfigEntryView;
  onChange: (mode: ToolConfigEntryView["approvalMode"]) => void;
}) {
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.bg,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium, color: COLORS.text }}>
        {tool.title}
      </div>
      <ModeSegmentedControl value={tool.approvalMode} onChange={onChange} />
    </div>
  );
}

function ModeSegmentedControl({
  value,
  onChange,
}: {
  value: ToolConfigEntryView["approvalMode"];
  onChange: (mode: ToolConfigEntryView["approvalMode"]) => void;
}) {
  const options: Array<{ value: ToolConfigEntryView["approvalMode"]; label: string }> = [
    { value: "auto", label: "Auto" },
    { value: "approval", label: "Approve" },
    { value: "blocked", label: "Block" },
  ];

  return (
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 4,
        padding: 4,
        borderRadius: RADIUS.pill,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
      }}
    >
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          style={{
            border: "none",
            borderRadius: RADIUS.pill,
            padding: "6px 12px",
            background: value === option.value ? COLORS.accentDim : "transparent",
            color: value === option.value ? COLORS.accent : COLORS.textSecondary,
            fontFamily: TYPE.body,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function buildPolicyTools(
  toolConfig: ToolConfigView,
  catalog: ToolConfigEntryView[],
  connectedProviders: Set<string>,
): ToolConfigEntryView[] {
  const tools = new Map<string, ToolConfigEntryView>();

  for (const tool of catalog) {
    if (!connectedProviders.has(tool.provider)) {
      continue;
    }
    tools.set(tool.toolName, {
      ...tool,
      ...(toolConfig.tools[tool.toolName] ?? {}),
    });
  }

  for (const tool of Object.values(toolConfig.tools)) {
    if (!connectedProviders.has(tool.provider)) {
      continue;
    }
    if (!tools.has(tool.toolName)) {
      tools.set(tool.toolName, tool);
    }
  }

  return [...tools.values()].sort((left, right) =>
    `${left.provider}:${left.title}`.localeCompare(`${right.provider}:${right.title}`),
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        border: "none",
        borderRadius: RADIUS.pill,
        background: checked ? COLORS.accent : COLORS.borderStrong,
        position: "relative",
        cursor: "pointer",
        transition: `background ${MOTION.duration} ${MOTION.ease}`,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: RADIUS.pill,
          background: COLORS.white,
          transition: `left ${MOTION.duration} ${MOTION.ease}`,
        }}
      />
    </button>
  );
}

function ProviderIcon({
  provider,
  logos,
  size = 20,
}: {
  provider: string;
  logos: Record<string, string>;
  size?: number;
}) {
  const logoUrl = logos[provider];
  if (logoUrl) {
    return <img src={logoUrl} alt="" style={{ width: size, height: size, borderRadius: 4, flexShrink: 0 }} />;
  }
  const meta = getProviderMetadata(provider);
  return <span style={{ fontSize: size, flexShrink: 0 }}>{meta.icon}</span>;
}

const PROVIDER_CONFIG_FIELDS: Record<string, { key: string; label: string; placeholder: string }> = {
  googleads: { key: "customerId", label: "Customer ID", placeholder: "e.g. 123-456-7890" },
};

function ConnectionRow({
  connection,
  projectId,
  onConnect,
  onDisconnect,
  providerLogos = {},
}: {
  connection: ConnectionView;
  projectId: string;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  providerLogos?: Record<string, string>;
}) {
  const meta = getProviderMetadata(connection.provider);
  const configField = PROVIDER_CONFIG_FIELDS[connection.provider];
  const existingValue = configField ? ((connection.config?.[configField.key] as string) ?? "") : "";
  const configInputId = configField ? `connection-${connection.id}-${configField.key}` : undefined;
  const [configValue, setConfigValue] = useState(existingValue);

  const saveConfig = async () => {
    if (!configField || configValue === existingValue) return;
    await updateConnectionConfig({
      data: { projectId, provider: connection.provider, config: { [configField.key]: configValue.trim() } },
    });
  };

  return (
    <SettingsCard>
      <div
        style={{
          padding: "14px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <ProviderIcon provider={connection.provider} logos={providerLogos} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
              {meta.name}
            </div>
            {meta.defaultReason ? (
              <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 2 }}>
                {meta.defaultReason}
              </div>
            ) : null}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: TYPE.scale.xs, color: COLORS.green }}>Connected</span>
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
      </div>

      {configField ? (
        <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", gap: 8 }}>
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
    </SettingsCard>
  );
}

function smallActionStyle(color: string) {
  return {
    fontFamily: TYPE.body,
    padding: "4px 10px",
    borderRadius: RADIUS.pill,
    border: `1px solid ${COLORS.border}`,
    background: "transparent",
    color,
    fontSize: TYPE.scale.xs,
    transition: `all ${MOTION.duration} ${MOTION.ease}`,
  };
}

function PolicyRuleGroup({
  label,
  bordered = false,
  children,
}: {
  label: string;
  bordered?: boolean;
  children: React.ReactNode;
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
  actions?: React.ReactNode;
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
