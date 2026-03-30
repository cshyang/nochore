import { useEffect, useState } from "react";
import { Button } from "~/components/Button";
import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import { SettingsCard, SettingsRow, SectionHeading } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { CONNECTABLE_PROVIDER_SLUGS, getProviderMetadata } from "~/lib/provider-metadata";
import type { ConnectionView, NotificationConfigView } from "~/lib/types";
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
  requiredProviders,
  onUpdateAgent,
  onConnect,
  onDisconnect,
  providerLogos = {},
}: {
  agent: AgentWorkspaceProps["agent"];
  skills: NonNullable<AgentWorkspaceProps["availableSkills"]>;
  connections: NonNullable<AgentWorkspaceProps["projectConnections"]>;
  requiredProviders: NonNullable<AgentWorkspaceProps["requiredProviders"]>;
  onUpdateAgent?: AgentWorkspaceProps["onUpdateAgent"];
  onConnect?: AgentWorkspaceProps["onConnect"];
  onDisconnect?: AgentWorkspaceProps["onDisconnect"];
  providerLogos?: Record<string, string>;
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

  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const connectedProviders = new Set(
    connections.filter((c) => c.status === "active").map((c) => c.provider),
  );
  const projectId = agent.projectId ?? "";

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

      <SectionHeading>Connections</SectionHeading>
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

function ProviderIcon({ provider, logos, size = 20 }: { provider: string; logos: Record<string, string>; size?: number }) {
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
          <button type="button" onClick={() => onConnect?.(connection.provider)} style={smallActionStyle(COLORS.textSecondary)}>
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
          <label style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, whiteSpace: "nowrap" }}>
            {configField.label}
          </label>
          <input
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
