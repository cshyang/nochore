import { useMemo, useState } from "react";
import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import { Button } from "~/components/Button";
import { ProviderIcon, SectionHeading, SettingsCard, SettingsRow, Toggle } from "~/components/SettingsComponents";
import { SettingsConnectionCard } from "~/components/settings/settings-connection-card";
import { SettingsLearnedRules } from "~/components/settings/settings-learned-rules";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { CONNECTABLE_PROVIDER_SLUGS, getProviderMetadata } from "~/lib/provider-metadata";
import type { ConnectionView, LearnedRuleView, ToolConfigEntryView, ToolConfigView } from "~/lib/types";

type ApprovalMode = ToolConfigEntryView["approvalMode"];

export interface SettingsAccessPanelProps {
  skills: NonNullable<AgentWorkspaceProps["availableSkills"]>;
  selectedSkills: string[];
  policyTools: ToolConfigEntryView[];
  currentToolConfig: ToolConfigView;
  connections: NonNullable<AgentWorkspaceProps["projectConnections"]>;
  missingRequiredProviders: ToolConfigView["requiredProviders"];
  learnedRules: LearnedRuleView[];
  learnedRuleSuggestions: LearnedRuleView[];
  showProviderPicker: boolean;
  projectId: string;
  providerLogos: Record<string, string>;
  onSetSelectedSkills: (skills: string[]) => void;
  onCommitSkills: (skills: string[]) => void;
  onShowProviderPicker: (open: boolean) => void;
  onPersistToolConfig: (toolConfig: ToolConfigView) => Promise<void>;
  onConnect?: AgentWorkspaceProps["onConnect"];
  onDisconnect?: AgentWorkspaceProps["onDisconnect"];
  onAcceptLearnedRule?: AgentWorkspaceProps["onAcceptLearnedRule"];
  onDismissLearnedRule?: AgentWorkspaceProps["onDismissLearnedRule"];
  onSuppressLearnedRule?: AgentWorkspaceProps["onSuppressLearnedRule"];
  onRevokeLearnedRule?: AgentWorkspaceProps["onRevokeLearnedRule"];
}

export function SettingsAccessPanel({
  skills,
  selectedSkills,
  policyTools,
  currentToolConfig,
  connections,
  missingRequiredProviders,
  learnedRules,
  learnedRuleSuggestions,
  showProviderPicker,
  projectId,
  providerLogos,
  onSetSelectedSkills,
  onCommitSkills,
  onShowProviderPicker,
  onPersistToolConfig,
  onConnect,
  onDisconnect,
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  onRevokeLearnedRule,
}: SettingsAccessPanelProps) {
  const [pendingConsent, setPendingConsent] = useState<{ provider: string; isReconnect: boolean } | null>(null);
  const activeConnections = connections.filter((connection) => connection.status === "active");
  const builtinTools = policyTools.filter((tool) => tool.provider === "builtin");
  const builtinConnection: ConnectionView | null =
    builtinTools.length > 0
      ? {
          id: "builtin",
          provider: "builtin",
          status: "active",
          createdAt: 0,
          authorizedByUserId: null,
        }
      : null;
  const renderableConnections = builtinConnection ? [builtinConnection, ...activeConnections] : activeConnections;
  const connectedProviders = new Set(activeConnections.map((connection) => connection.provider));

  const toolsByProvider = useMemo(() => {
    const map = new Map<string, ToolConfigEntryView[]>();
    for (const tool of policyTools) {
      const list = map.get(tool.provider) ?? [];
      list.push(tool);
      map.set(tool.provider, list);
    }
    return map;
  }, [policyTools]);

  const toolProviderByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of policyTools) map.set(tool.toolName, tool.provider);
    return map;
  }, [policyTools]);

  const rulesByProvider = useMemo(
    () => groupRulesByProvider(learnedRules, toolProviderByName),
    [learnedRules, toolProviderByName],
  );
  const suggestionsByProvider = useMemo(
    () => groupRulesByProvider(learnedRuleSuggestions, toolProviderByName),
    [learnedRuleSuggestions, toolProviderByName],
  );

  const orphanRules = rulesByProvider.get(ORPHAN_KEY) ?? [];
  const orphanSuggestions = suggestionsByProvider.get(ORPHAN_KEY) ?? [];

  const setToolApproval = (toolName: string, mode: ApprovalMode) => {
    const existing = currentToolConfig.tools[toolName] ?? policyTools.find((t) => t.toolName === toolName);
    if (!existing) return;
    void onPersistToolConfig({
      ...currentToolConfig,
      tools: {
        ...currentToolConfig.tools,
        [toolName]: { ...existing, approvalMode: mode },
      },
    });
  };

  const setConnectionApproval = (provider: string, mode: ApprovalMode) => {
    const providerTools = toolsByProvider.get(provider) ?? [];
    if (providerTools.length === 0) return;
    const nextTools = { ...currentToolConfig.tools };
    for (const tool of providerTools) {
      nextTools[tool.toolName] = { ...tool, ...currentToolConfig.tools[tool.toolName], approvalMode: mode };
    }
    void onPersistToolConfig({ ...currentToolConfig, tools: nextTools });
  };

  const requestConnect = (provider: string, isReconnect: boolean) => {
    if (provider === "builtin") return;
    setPendingConsent({ provider, isReconnect });
  };

  const confirmConsent = () => {
    if (!pendingConsent) return;
    onConnect?.(pendingConsent.provider);
    setPendingConsent(null);
  };

  const consentTools = pendingConsent ? (toolsByProvider.get(pendingConsent.provider) ?? []) : [];

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeading>Connections</SectionHeading>
      <div style={{ display: "grid", gap: 6 }}>
        {pendingConsent ? (
          <ConsentPanel
            provider={pendingConsent.provider}
            isReconnect={pendingConsent.isReconnect}
            tools={consentTools}
            providerLogos={providerLogos}
            onConfirm={confirmConsent}
            onCancel={() => setPendingConsent(null)}
          />
        ) : null}
        {renderableConnections.map((connection) => (
          <SettingsConnectionCard
            key={connection.id}
            connection={connection}
            projectId={projectId}
            tools={toolsByProvider.get(connection.provider) ?? []}
            scopedRules={rulesByProvider.get(connection.provider) ?? []}
            scopedSuggestions={suggestionsByProvider.get(connection.provider) ?? []}
            providerLogos={providerLogos}
            onConnect={(provider) => requestConnect(provider, true)}
            onDisconnect={onDisconnect}
            onSetConnectionApproval={(mode) => setConnectionApproval(connection.provider, mode)}
            onSetToolApproval={setToolApproval}
            onAcceptLearnedRule={onAcceptLearnedRule}
            onDismissLearnedRule={onDismissLearnedRule}
            onSuppressLearnedRule={onSuppressLearnedRule}
            onRevokeLearnedRule={onRevokeLearnedRule}
          />
        ))}

        {missingRequiredProviders.map((requirement) => {
          const meta = getProviderMetadata(requirement.provider);
          return (
            <SettingsCard key={requirement.provider}>
              <div style={{ padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                <ProviderIcon provider={requirement.provider} logos={providerLogos} size={20} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: TYPE.scale.sm, color: COLORS.text, fontWeight: TYPE.weight.medium }}>
                    {meta.name}
                  </div>
                  <div style={{ fontSize: TYPE.scale.xs, color: COLORS.orange }}>
                    Not connected — required for this agent
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => requestConnect(requirement.provider, false)}
                  style={{
                    fontFamily: TYPE.body,
                    padding: "6px 14px",
                    borderRadius: RADIUS.md,
                    border: `1px solid ${COLORS.accent}`,
                    background: "transparent",
                    color: COLORS.accent,
                    fontSize: TYPE.scale.xs,
                    cursor: "pointer",
                    fontWeight: TYPE.weight.medium,
                  }}
                >
                  Connect
                </button>
              </div>
            </SettingsCard>
          );
        })}

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
                        onShowProviderPicker(false);
                        requestConnect(slug, false);
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
                onClick={() => onShowProviderPicker(false)}
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
            onClick={() => onShowProviderPicker(true)}
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

      <SectionHeading>Skills</SectionHeading>
      <SettingsCard>
        {skills.length === 0 ? (
          <div style={{ padding: SPACE[4], color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
            No skills available yet.
          </div>
        ) : (
          skills.map((skill, index) => {
            const isEnabled = selectedSkills.includes(skill.id);
            return (
              <SettingsRow
                key={skill.id}
                icon="◈"
                title={skill.name}
                description={skill.description}
                isLast={index === skills.length - 1}
                trailing={
                  <Toggle
                    checked={isEnabled}
                    onChange={() => {
                      const next = isEnabled
                        ? selectedSkills.filter((id) => id !== skill.id)
                        : [...selectedSkills, skill.id];
                      onSetSelectedSkills(next);
                      onCommitSkills(next);
                    }}
                  />
                }
              />
            );
          })
        )}
      </SettingsCard>

      <SectionHeading>General policy</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="⚑"
          title="Require approval for all write actions"
          description="Global override. Reads stay auto unless tightened on a specific tool."
          isLast={orphanRules.length === 0 && orphanSuggestions.length === 0}
          trailing={
            <Toggle
              checked={currentToolConfig.globalApprovalRequired}
              onChange={(checked) =>
                void onPersistToolConfig({ ...currentToolConfig, globalApprovalRequired: checked })
              }
            />
          }
        />
      </SettingsCard>

      {orphanRules.length > 0 || orphanSuggestions.length > 0 ? (
        <SettingsLearnedRules
          learnedRules={orphanRules}
          learnedRuleSuggestions={orphanSuggestions}
          onAcceptLearnedRule={onAcceptLearnedRule}
          onDismissLearnedRule={onDismissLearnedRule}
          onSuppressLearnedRule={onSuppressLearnedRule}
          onRevokeLearnedRule={onRevokeLearnedRule}
        />
      ) : null}
    </div>
  );
}

const ORPHAN_KEY = "__orphan__";

function groupRulesByProvider(
  rules: LearnedRuleView[],
  toolProviderByName: Map<string, string>,
): Map<string, LearnedRuleView[]> {
  const grouped = new Map<string, LearnedRuleView[]>();
  for (const rule of rules) {
    const provider = toolProviderByName.get(rule.toolName) ?? inferProviderFromToolName(rule.toolName) ?? ORPHAN_KEY;
    const list = grouped.get(provider) ?? [];
    list.push(rule);
    grouped.set(provider, list);
  }
  return grouped;
}

function inferProviderFromToolName(toolName: string): string | null {
  const prefix = toolName.split("_")[0];
  return prefix ? prefix.toLowerCase() : null;
}

function ConsentPanel({
  provider,
  isReconnect,
  tools,
  providerLogos,
  onConfirm,
  onCancel,
}: {
  provider: string;
  isReconnect: boolean;
  tools: ToolConfigEntryView[];
  providerLogos: Record<string, string>;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const meta = getProviderMetadata(provider);
  const [acked, setAcked] = useState(false);

  return (
    <SettingsCard>
      <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <ProviderIcon provider={provider} logos={providerLogos} size={22} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
              {isReconnect ? "Reconnect" : "Connect"} {meta.name}
            </div>
            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 2 }}>
              {meta.defaultReason ?? `Authorize ${meta.name} for this agent.`}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: "12px 14px",
            borderRadius: RADIUS.md,
            background: COLORS.bg,
            border: `1px solid ${COLORS.border}`,
            display: "grid",
            gap: 6,
          }}
        >
          <div
            style={{
              fontSize: TYPE.scale.xs,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
            }}
          >
            What this agent will gain access to
          </div>
          {tools.length > 0 ? (
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                color: COLORS.textSecondary,
                fontSize: TYPE.scale.sm,
                lineHeight: TYPE.leading.normal,
              }}
            >
              {tools.slice(0, 6).map((tool) => (
                <li key={tool.toolName}>{tool.title}</li>
              ))}
              {tools.length > 6 ? <li style={{ color: COLORS.textDim }}>+{tools.length - 6} more</li> : null}
            </ul>
          ) : (
            <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>
              Specific actions become visible after connecting. Default approval mode is "Auto" — restrict in Settings
              any time.
            </div>
          )}
        </div>

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            padding: "12px 14px",
            borderRadius: RADIUS.md,
            background: COLORS.orangeSubtle,
            border: `1px solid ${COLORS.orange}`,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={acked}
            onChange={(event) => setAcked(event.target.checked)}
            style={{ marginTop: 3, accentColor: COLORS.accent }}
          />
          <span style={{ fontSize: TYPE.scale.sm, color: COLORS.text, lineHeight: TYPE.leading.normal }}>
            I understand this credential will be usable by anyone who can run this agent. They'll be able to take
            actions on this {meta.name} account on my behalf.
          </span>
        </label>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={!acked}>
            {isReconnect ? "Reconnect" : "Connect"}
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}
