import { useEffect, useMemo, useRef, useState } from "react";
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
  const [optimisticToolConfig, setOptimisticToolConfig] = useState<ToolConfigView>(currentToolConfig);
  const optimisticRef = useRef(optimisticToolConfig);
  optimisticRef.current = optimisticToolConfig;

  const currentToolConfigRef = useRef(currentToolConfig);
  currentToolConfigRef.current = currentToolConfig;

  const lastDispatchedToolsRef = useRef(currentToolConfig.tools);
  const lastDispatchedGlobalRef = useRef(currentToolConfig.globalApprovalRequired);
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  const queuedRef = useRef<ToolConfigView | null>(null);

  // Sync: always take server's authoritative fields (requiredProviders).
  // Preserve optimistic tools / globalApprovalRequired only while server hasn't
  // caught up to what we last dispatched.
  useEffect(() => {
    const current = currentToolConfig;
    const optimistic = optimisticRef.current;
    const useServerTools = toolsDictEqual(current.tools, lastDispatchedToolsRef.current);
    const useServerGlobal = current.globalApprovalRequired === lastDispatchedGlobalRef.current;

    const merged: ToolConfigView = {
      ...current,
      tools: useServerTools ? current.tools : optimistic.tools,
      globalApprovalRequired: useServerGlobal ? current.globalApprovalRequired : optimistic.globalApprovalRequired,
    };

    if (!toolConfigsEqual(merged, optimistic)) {
      setOptimisticToolConfig(merged);
    }
  }, [currentToolConfig]);

  const firePersist = (config: ToolConfigView) => {
    inFlightRef.current = onPersistToolConfig(config)
      .catch(() => {
        // Rollback to last known server state so UI doesn't pretend a failed
        // persist succeeded. Reset dispatched refs so future server updates flow.
        const latestServer = currentToolConfigRef.current;
        setOptimisticToolConfig(latestServer);
        lastDispatchedToolsRef.current = latestServer.tools;
        lastDispatchedGlobalRef.current = latestServer.globalApprovalRequired;
        queuedRef.current = null;
      })
      .finally(() => {
        inFlightRef.current = null;
        const queued = queuedRef.current;
        if (queued) {
          queuedRef.current = null;
          lastDispatchedToolsRef.current = queued.tools;
          lastDispatchedGlobalRef.current = queued.globalApprovalRequired;
          firePersist(queued);
        }
      });
  };

  const persistOptimistic = (next: ToolConfigView) => {
    setOptimisticToolConfig(next);
    if (inFlightRef.current) {
      // Latest click wins — collapse pending queue.
      queuedRef.current = next;
      return;
    }
    lastDispatchedToolsRef.current = next.tools;
    lastDispatchedGlobalRef.current = next.globalApprovalRequired;
    firePersist(next);
  };

  const effectiveToolConfig = optimisticToolConfig;
  const optimisticPolicyTools = useMemo(
    () =>
      policyTools.map((tool) => {
        const override = effectiveToolConfig.tools[tool.toolName];
        return override ? { ...tool, ...override } : tool;
      }),
    [policyTools, effectiveToolConfig],
  );

  const activeConnections = connections.filter((connection) => connection.status === "active");
  const builtinConnection: ConnectionView = {
    id: "builtin",
    provider: "builtin",
    status: "active",
    createdAt: 0,
    authorizedByUserId: null,
  };
  const renderableConnections = [builtinConnection, ...activeConnections];
  const connectedProviders = new Set(activeConnections.map((connection) => connection.provider));

  const toolsByProvider = useMemo(() => {
    const map = new Map<string, ToolConfigEntryView[]>();
    for (const tool of optimisticPolicyTools) {
      const list = map.get(tool.provider) ?? [];
      list.push(tool);
      map.set(tool.provider, list);
    }
    map.set("builtin", BUILTIN_CAPABILITIES);
    return map;
  }, [optimisticPolicyTools]);

  const toolProviderByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const tool of optimisticPolicyTools) map.set(tool.toolName, tool.provider);
    return map;
  }, [optimisticPolicyTools]);

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
    const existing = effectiveToolConfig.tools[toolName] ?? optimisticPolicyTools.find((t) => t.toolName === toolName);
    if (!existing) return;
    persistOptimistic({
      ...effectiveToolConfig,
      tools: {
        ...effectiveToolConfig.tools,
        [toolName]: { ...existing, approvalMode: mode },
      },
    });
  };

  const setConnectionApproval = (provider: string, mode: ApprovalMode) => {
    const providerTools = toolsByProvider.get(provider) ?? [];
    if (providerTools.length === 0) return;
    const nextTools = { ...effectiveToolConfig.tools };
    for (const tool of providerTools) {
      nextTools[tool.toolName] = { ...tool, ...effectiveToolConfig.tools[tool.toolName], approvalMode: mode };
    }
    persistOptimistic({ ...effectiveToolConfig, tools: nextTools });
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
              checked={effectiveToolConfig.globalApprovalRequired}
              onChange={(checked) => {
                persistOptimistic({ ...effectiveToolConfig, globalApprovalRequired: checked });
              }}
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

function toolConfigsEqual(a: ToolConfigView, b: ToolConfigView): boolean {
  if (a === b) return true;
  if (a.globalApprovalRequired !== b.globalApprovalRequired) return false;
  if (!toolsDictEqual(a.tools, b.tools)) return false;
  return requiredProvidersEqual(a.requiredProviders, b.requiredProviders);
}

function toolsDictEqual(a: ToolConfigView["tools"], b: ToolConfigView["tools"]): boolean {
  if (a === b) return true;
  const aNames = Object.keys(a);
  const bNames = Object.keys(b);
  if (aNames.length !== bNames.length) return false;
  for (const name of aNames) {
    const aTool = a[name];
    const bTool = b[name];
    if (!bTool) return false;
    if (aTool.approvalMode !== bTool.approvalMode || aTool.enabled !== bTool.enabled) return false;
  }
  return true;
}

function requiredProvidersEqual(
  a: ToolConfigView["requiredProviders"],
  b: ToolConfigView["requiredProviders"],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  const aKeys = new Set(a.map((r) => r.provider));
  for (const r of b) {
    if (!aKeys.has(r.provider)) return false;
  }
  return true;
}

// Baseline runtime tools exposed to every agent. Names match INTERNAL_TOOL_MODES
// in services/worker/src/lib/policy-helpers.ts. The runtime defaults these to
// auto-approval when no explicit per-tool config exists (see worker
// tool-config.ts#getToolConfigForCall), so this card is presented read-only.
const BUILTIN_CAPABILITIES: ToolConfigEntryView[] = [
  {
    toolName: "bash",
    slug: "bash",
    provider: "builtin",
    title: "Run shell commands",
    description: "Execute shell scripts inside the agent's sandbox.",
    mode: "write",
    enabled: true,
    approvalMode: "auto",
  },
  {
    toolName: "edit",
    slug: "edit",
    provider: "builtin",
    title: "Edit files",
    description: "Make targeted edits to files in the agent workspace.",
    mode: "write",
    enabled: true,
    approvalMode: "auto",
  },
  {
    toolName: "read",
    slug: "read",
    provider: "builtin",
    title: "Read workspace files",
    description: "Access KNOWLEDGE.md, POLICY.md, scratchpad, and previous reports.",
    mode: "read",
    enabled: true,
    approvalMode: "auto",
  },
  {
    toolName: "write",
    slug: "write",
    provider: "builtin",
    title: "Write files",
    description: "Create or overwrite files in the agent's scratchpad and reports.",
    mode: "write",
    enabled: true,
    approvalMode: "auto",
  },
  {
    toolName: "spawn_sub_run",
    slug: "spawn_sub_run",
    provider: "builtin",
    title: "Spawn sub-agents",
    description: "Delegate work to a child agent via the coordinated runtime.",
    mode: "write",
    enabled: true,
    approvalMode: "auto",
  },
  {
    toolName: "submit_report",
    slug: "submit_report",
    provider: "builtin",
    title: "Submit reports",
    description: "Emit structured reports for downstream observability.",
    mode: "read",
    enabled: true,
    approvalMode: "auto",
  },
  {
    toolName: "record_metric",
    slug: "record_metric",
    provider: "builtin",
    title: "Record metrics",
    description: "Observe and track the agent's primary success metric across runs.",
    mode: "read",
    enabled: true,
    approvalMode: "auto",
  },
];

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
