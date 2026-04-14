import { useState } from "react";
import type { AgentWorkspaceProps } from "~/components/agent-workspace.types";
import {
  ProviderIcon,
  SectionHeading,
  SettingsCard,
  SettingsRow,
  smallActionStyle,
  Toggle,
} from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { CONNECTABLE_PROVIDER_SLUGS, getProviderMetadata } from "~/lib/provider-metadata";
import { humanize } from "~/lib/text-format";
import type { ConnectionView, ToolConfigEntryView, ToolConfigView } from "~/lib/types";
import { updateConnectionConfig } from "~/server/connections";

export interface SettingsAccessPanelProps {
  skills: NonNullable<AgentWorkspaceProps["availableSkills"]>;
  selectedSkills: string[];
  policyTools: ToolConfigEntryView[];
  connections: NonNullable<AgentWorkspaceProps["projectConnections"]>;
  missingRequiredProviders: ToolConfigView["requiredProviders"];
  showProviderPicker: boolean;
  projectId: string;
  providerLogos: Record<string, string>;
  onSetSelectedSkills: (skills: string[]) => void;
  onCommitSkills: (skills: string[]) => void;
  onShowProviderPicker: (open: boolean) => void;
  onConnect?: AgentWorkspaceProps["onConnect"];
  onDisconnect?: AgentWorkspaceProps["onDisconnect"];
}

export function SettingsAccessPanel({
  skills,
  selectedSkills,
  policyTools,
  connections,
  missingRequiredProviders,
  showProviderPicker,
  projectId,
  providerLogos,
  onSetSelectedSkills,
  onCommitSkills,
  onShowProviderPicker,
  onConnect,
  onDisconnect,
}: SettingsAccessPanelProps) {
  const connectedProviders = new Set(
    connections.filter((connection) => connection.status === "active").map((connection) => connection.provider),
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <SectionHeading>Systems</SectionHeading>
      <div style={{ display: "grid", gap: 6 }}>
        {connections
          .filter((connection) => connection.status === "active")
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
                  onClick={() => onConnect?.(requirement.provider)}
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
                        onSetSelectedSkills(next);
                        onCommitSkills(next);
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
    </div>
  );
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
