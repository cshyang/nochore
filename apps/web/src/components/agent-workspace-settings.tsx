import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import { Button } from "~/components/Button";
import { fieldStyle } from "~/components/SettingsComponents";
import { SettingsAccessPanel } from "~/components/settings/settings-access-panel";
import { SettingsAutonomyPanel } from "~/components/settings/settings-autonomy-panel";
import { SettingsBasicsPanel } from "~/components/settings/settings-basics-panel";
import { COLORS, MOTION, RADIUS, SHADOW, TYPE } from "~/lib/colors";
import type { LearnedRuleView, NotificationConfigView, ToolConfigEntryView, ToolConfigView } from "~/lib/types";

type SettingsLocalTab = "basics" | "access" | "autonomy";

const SETTINGS_TAB_OPTIONS: Array<{ value: SettingsLocalTab; label: string }> = [
  { value: "basics", label: "Basics" },
  { value: "access", label: "Access" },
  { value: "autonomy", label: "Autonomy" },
];

function getNotificationConfig(notificationConfig: NotificationConfigView | undefined): NotificationConfigView {
  return notificationConfig ?? { inApp: true, email: false, slack: false };
}

function buildPolicyTools(
  toolConfig: ToolConfigView,
  catalog: ToolConfigEntryView[],
  connectedProviders: Set<string>,
): ToolConfigEntryView[] {
  const tools = new Map<string, ToolConfigEntryView>();

  for (const tool of catalog) {
    if (!connectedProviders.has(tool.provider)) continue;
    tools.set(tool.toolName, {
      ...tool,
      ...(toolConfig.tools[tool.toolName] ?? {}),
    });
  }

  for (const tool of Object.values(toolConfig.tools)) {
    if (!connectedProviders.has(tool.provider)) continue;
    if (!tools.has(tool.toolName)) tools.set(tool.toolName, tool);
  }

  return [...tools.values()].sort((left, right) =>
    `${left.provider}:${left.title}`.localeCompare(`${right.provider}:${right.title}`),
  );
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
  const [localTab, setLocalTab] = useState<SettingsLocalTab>("basics");
  const [name, setName] = useState(agent.name);
  const [briefing, setBriefing] = useState(agent.instructions ?? agent.description ?? "");
  const [schedule, setSchedule] = useState(agent.schedule ?? "manual");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(agent.skills ?? []);
  const [notificationConfig, setNotificationConfig] = useState(getNotificationConfig(agent.notificationConfig));
  const [primaryMetric, setPrimaryMetric] = useState(agent.primaryMetric ?? "");
  const [saving, setSaving] = useState(false);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [briefingModalOpen, setBriefingModalOpen] = useState(false);

  useEffect(() => {
    setLocalTab("basics");
    setName(agent.name);
    setBriefing(agent.instructions ?? agent.description ?? "");
    setSchedule(agent.schedule ?? "manual");
    setSelectedSkills(agent.skills ?? []);
    setNotificationConfig(getNotificationConfig(agent.notificationConfig));
    setPrimaryMetric(agent.primaryMetric ?? "");
  }, [agent.id]);

  const persist = async (patch: Partial<Parameters<NonNullable<AgentWorkspaceProps["onUpdateAgent"]>>[0]>) => {
    if (!onUpdateAgent) return;
    setSaving(true);
    try {
      await onUpdateAgent(patch);
    } finally {
      setSaving(false);
    }
  };

  const connectedProviders = useMemo(
    () =>
      new Set(
        connections.filter((connection) => connection.status === "active").map((connection) => connection.provider),
      ),
    [connections],
  );
  const projectId = agent.projectId ?? "";
  const currentToolConfig = agent.toolConfig ?? { globalApprovalRequired: false, requiredProviders: [], tools: {} };
  const missingRequiredProviders = useMemo(
    () => currentToolConfig.requiredProviders.filter((requirement) => !connectedProviders.has(requirement.provider)),
    [connectedProviders, currentToolConfig.requiredProviders],
  );
  const policyTools = useMemo(
    () => buildPolicyTools(currentToolConfig, policyToolCatalog, connectedProviders),
    [currentToolConfig, policyToolCatalog, connectedProviders],
  );
  const persistToolConfig = async (nextToolConfig: ToolConfigView) => {
    await persist({ toolConfig: nextToolConfig });
  };

  return (
    <div style={{ display: "grid", gap: 18, paddingBottom: 24 }}>
      <SettingsLocalTabs activeTab={localTab} onChange={setLocalTab} />

      {localTab === "basics" ? (
        <SettingsBasicsPanel
          name={name}
          briefing={briefing}
          schedule={schedule}
          primaryMetric={primaryMetric}
          onNameChange={setName}
          onScheduleChange={(value) => {
            setSchedule(value);
            void persist({ schedule: value });
          }}
          onPrimaryMetricChange={setPrimaryMetric}
          onCommitName={() => void persist({ name })}
          onCommitPrimaryMetric={() => void persist({ primaryMetric })}
          onOpenBriefing={() => setBriefingModalOpen(true)}
        />
      ) : null}

      {localTab === "access" ? (
        <SettingsAccessPanel
          skills={skills}
          selectedSkills={selectedSkills}
          policyTools={policyTools}
          connections={connections}
          missingRequiredProviders={missingRequiredProviders}
          showProviderPicker={showProviderPicker}
          projectId={projectId}
          providerLogos={providerLogos}
          onSetSelectedSkills={setSelectedSkills}
          onCommitSkills={(next) => void persist({ skills: next })}
          onShowProviderPicker={setShowProviderPicker}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      ) : null}

      {localTab === "autonomy" ? (
        <SettingsAutonomyPanel
          currentToolConfig={currentToolConfig}
          policyTools={policyTools}
          learnedRules={learnedRules}
          learnedRuleSuggestions={learnedRuleSuggestions}
          notificationConfig={notificationConfig}
          onPersistToolConfig={persistToolConfig}
          onSetNotificationConfig={setNotificationConfig}
          onCommitNotifications={(next) => void persist({ notificationConfig: next })}
          onAcceptLearnedRule={onAcceptLearnedRule}
          onDismissLearnedRule={onDismissLearnedRule}
          onSuppressLearnedRule={onSuppressLearnedRule}
          onRevokeLearnedRule={onRevokeLearnedRule}
        />
      ) : null}

      {briefingModalOpen ? (
        <BriefingModal
          value={briefing}
          saving={saving}
          onChange={setBriefing}
          onSave={(value) => {
            const firstLine = value.split("\n")[0].trim();
            const description = firstLine.length > 200 ? `${firstLine.slice(0, 197)}...` : firstLine;
            void persist({ instructions: value, description });
            setBriefingModalOpen(false);
          }}
          onClose={() => {
            setBriefing(agent.instructions ?? agent.description ?? "");
            setBriefingModalOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function SettingsLocalTabs({
  activeTab,
  onChange,
}: {
  activeTab: SettingsLocalTab;
  onChange: (tab: SettingsLocalTab) => void;
}) {
  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 2,
        background: COLORS.bg,
        paddingTop: 8,
        paddingBottom: 4,
      }}
    >
      <div
        style={{
          display: "inline-flex",
          gap: 4,
          padding: 4,
          background: COLORS.bgRaised,
          borderRadius: RADIUS.md,
        }}
      >
        {SETTINGS_TAB_OPTIONS.map((option) => {
          const isActive = activeTab === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              style={{
                background: isActive ? COLORS.surface : "transparent",
                border: isActive ? `1px solid ${COLORS.border}` : "1px solid transparent",
                borderRadius: RADIUS.sm,
                padding: "6px 14px",
                cursor: "pointer",
                color: isActive ? COLORS.text : COLORS.textDim,
                fontWeight: isActive ? TYPE.weight.semibold : TYPE.weight.medium,
                fontSize: TYPE.scale.xs,
                fontFamily: TYPE.body,
                whiteSpace: "nowrap",
                transition: `all ${MOTION.duration} ${MOTION.ease}`,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BriefingModal({
  value,
  saving,
  onChange,
  onSave,
  onClose,
}: {
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.selectionStart = textarea.value.length;
      textarea.selectionEnd = textarea.value.length;
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 40,
      }}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: COLORS.scrimHeavy,
          border: "none",
          cursor: "default",
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: "relative",
          zIndex: 1,
          width: "100%",
          maxWidth: 860,
          height: "min(85vh, 720px)",
          display: "flex",
          flexDirection: "column",
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg,
          overflow: "hidden",
          boxShadow: SHADOW.xl,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <div>
            <div
              style={{
                fontSize: TYPE.scale.md,
                fontWeight: TYPE.weight.semibold,
                fontFamily: TYPE.display,
                color: COLORS.text,
              }}
            >
              Briefing
            </div>
            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, marginTop: 2 }}>
              Tell the agent what to do, what to optimize for, and how to think.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: COLORS.textDim,
              fontSize: 18,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: 24, display: "flex", flexDirection: "column" }}>
          <textarea
            ref={textareaRef}
            className="textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Describe the agent's job, what it should optimize for, what to avoid, and any domain-specific context it needs."
            style={{
              ...fieldStyle,
              flex: 1,
              resize: "none",
              lineHeight: TYPE.leading.loose,
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 24px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <span style={{ color: COLORS.textDim, fontSize: TYPE.scale.xs }}>
            {saving ? "Saving..." : "This becomes the agent's working prompt."}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => onSave(value)}>
              Save briefing
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
