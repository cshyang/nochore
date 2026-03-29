import { useEffect, useState } from "react";
import { Button } from "~/components/Button";
import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import { SettingsCard, SettingsRow, SectionHeading } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";
import type { NotificationConfigView, ToolConfigView } from "~/lib/types";

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

function getToolConfig(toolConfig: ToolConfigView | undefined): ToolConfigView {
  return toolConfig ?? { requiredProviders: [], tools: {} };
}

function getNotificationConfig(notificationConfig: NotificationConfigView | undefined): NotificationConfigView {
  return notificationConfig ?? { inApp: true, email: false, slack: false };
}

export function AgentWorkspaceSettingsPanel({
  agent,
  skills,
  connections,
  requiredProviders,
  onUpdateAgent,
  onConnect,
  onDisconnect,
  section = "objective",
}: {
  agent: AgentWorkspaceProps["agent"];
  skills: NonNullable<AgentWorkspaceProps["availableSkills"]>;
  connections: NonNullable<AgentWorkspaceProps["projectConnections"]>;
  requiredProviders: NonNullable<AgentWorkspaceProps["requiredProviders"]>;
  onUpdateAgent?: AgentWorkspaceProps["onUpdateAgent"];
  onConnect?: AgentWorkspaceProps["onConnect"];
  onDisconnect?: AgentWorkspaceProps["onDisconnect"];
  section?: "objective" | "tools";
}) {
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [instructions, setInstructions] = useState(agent.instructions ?? "");
  const [schedule, setSchedule] = useState(agent.schedule ?? "manual");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(agent.skills ?? []);
  const [notificationConfig, setNotificationConfig] = useState(getNotificationConfig(agent.notificationConfig));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description ?? "");
    setInstructions(agent.instructions ?? "");
    setSchedule(agent.schedule ?? "manual");
    setSelectedSkills(agent.skills ?? []);
    setNotificationConfig(getNotificationConfig(agent.notificationConfig));
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

  if (section === "tools") {
    const toolConfig = getToolConfig(agent.toolConfig);
    const activeProviders = new Set(
      connections.filter((connection) => connection.status === "active").map((connection) => connection.provider),
    );
    const mergedProviders = new Map<string, { provider: string; reason?: string; logo?: string }>();

    for (const requirement of toolConfig.requiredProviders) {
      mergedProviders.set(requirement.provider, requirement);
    }
    for (const requirement of requiredProviders) {
      mergedProviders.set(requirement.provider, requirement);
    }

    const providerList = [...mergedProviders.values()];

    return (
      <div style={{ display: "grid", gap: 18 }}>
        <SectionHeading>Connections</SectionHeading>
        {providerList.length === 0 ? (
          <SettingsCard>
            <div style={{ padding: SPACE[4], color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
              This agent does not require any authenticated providers right now.
            </div>
          </SettingsCard>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {providerList.map((requirement) => {
              const meta = getProviderMetadata(requirement.provider);
              const connection = connections.find((item) => item.provider === requirement.provider);
              const isConnected = activeProviders.has(requirement.provider);
              const connectedAccountId = connection?.connectedAccountId ?? null;

              return (
                <SettingsCard key={requirement.provider}>
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
                      <span style={{ fontSize: 20, flexShrink: 0 }}>{meta.icon}</span>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: TYPE.scale.base,
                            fontWeight: TYPE.weight.semibold,
                            color: COLORS.text,
                          }}
                        >
                          {meta.name}
                        </div>
                        {requirement.reason ? (
                          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 2 }}>
                            {requirement.reason}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {isConnected ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.green }}>Connected</span>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => onConnect?.(requirement.provider)}
                          style={smallActionStyle(COLORS.textSecondary)}
                        >
                          Reconnect
                        </button>
                        {connectedAccountId ? (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => onDisconnect?.(requirement.provider, connectedAccountId)}
                            style={smallActionStyle(COLORS.red)}
                          >
                            Disconnect
                          </button>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => onConnect?.(requirement.provider)}
                        disabled={!onConnect}
                        style={{
                          ...smallActionStyle(COLORS.accent),
                          borderColor: COLORS.accent,
                          cursor: onConnect ? "pointer" : "default",
                        }}
                      >
                        Connect
                      </button>
                    )}
                  </div>
                </SettingsCard>
              );
            })}
          </div>
        )}

        <SettingsCard>
          <div style={{ padding: SPACE[4], color: COLORS.textSecondary, fontSize: TYPE.scale.sm }}>
            Tools are discovered at run time from the providers connected above. This screen only manages authenticated
            provider access.
          </div>
        </SettingsCard>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeading>Identity</SectionHeading>
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
      </SettingsCard>

      <SectionHeading>Instructions</SectionHeading>
      <SettingsCard>
        <div style={{ padding: 16 }}>
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
        </div>
      </SettingsCard>

      <SectionHeading>Skills</SectionHeading>
      <SettingsCard>
        {skills.length === 0 ? (
          <div style={{ padding: SPACE[4], color: COLORS.textDim, fontSize: TYPE.scale.sm }}>No skills selected yet.</div>
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
                      setSelectedSkills(next);
                      void persist({ skills: next });
                    }}
                  />
                }
              />
            );
          })
        )}
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
