import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import { SectionHeading, SettingsCard, SettingsRow, Toggle } from "~/components/SettingsComponents";
import { SettingsLearnedRules } from "~/components/settings/settings-learned-rules";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import type { LearnedRuleView, NotificationConfigView, ToolConfigEntryView, ToolConfigView } from "~/lib/types";

export interface SettingsAutonomyPanelProps {
  currentToolConfig: ToolConfigView;
  policyTools: ToolConfigEntryView[];
  learnedRules: LearnedRuleView[];
  learnedRuleSuggestions: LearnedRuleView[];
  notificationConfig: NotificationConfigView;
  onPersistToolConfig: (toolConfig: ToolConfigView) => Promise<void>;
  onSetNotificationConfig: (notificationConfig: NotificationConfigView) => void;
  onCommitNotifications: (notificationConfig: NotificationConfigView) => void;
  onAcceptLearnedRule?: AgentWorkspaceProps["onAcceptLearnedRule"];
  onDismissLearnedRule?: AgentWorkspaceProps["onDismissLearnedRule"];
  onSuppressLearnedRule?: AgentWorkspaceProps["onSuppressLearnedRule"];
  onRevokeLearnedRule?: AgentWorkspaceProps["onRevokeLearnedRule"];
}

export function SettingsAutonomyPanel({
  currentToolConfig,
  policyTools,
  learnedRules,
  learnedRuleSuggestions,
  notificationConfig,
  onPersistToolConfig,
  onSetNotificationConfig,
  onCommitNotifications,
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  onRevokeLearnedRule,
}: SettingsAutonomyPanelProps) {
  const updateNotifications = (patch: Partial<NotificationConfigView>) => {
    const next = { ...notificationConfig, ...patch };
    onSetNotificationConfig(next);
    onCommitNotifications(next);
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeading>Policy</SectionHeading>
      <SettingsCard>
        <PolicyHeaderRow
          checked={currentToolConfig.globalApprovalRequired}
          onChange={(checked) =>
            void onPersistToolConfig({
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
                  void onPersistToolConfig({
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
      </SettingsCard>

      <SectionHeading>Learned Rules</SectionHeading>
      <SettingsLearnedRules
        learnedRules={learnedRules}
        learnedRuleSuggestions={learnedRuleSuggestions}
        onAcceptLearnedRule={onAcceptLearnedRule}
        onDismissLearnedRule={onDismissLearnedRule}
        onSuppressLearnedRule={onSuppressLearnedRule}
        onRevokeLearnedRule={onRevokeLearnedRule}
      />

      <SectionHeading>Notifications</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="◎"
          title="In-app"
          description="Show events in Nochore."
          trailing={
            <Toggle
              checked={notificationConfig.inApp !== false}
              onChange={(checked) => updateNotifications({ inApp: checked })}
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
              onChange={(checked) => updateNotifications({ email: checked })}
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
              onChange={(checked) => updateNotifications({ slack: checked })}
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
      <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium, color: COLORS.text }}>{tool.title}</div>
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
