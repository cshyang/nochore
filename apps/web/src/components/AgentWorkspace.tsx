import {
  ArrowLeft,
  BookOpen,
  ChatCircle,
  Check,
  CircleNotch,
  DotsThree,
  Info,
  Play,
  RocketLaunch,
  WarningCircle,
} from "@phosphor-icons/react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { LiveRunView } from "~/components/LiveRunView";
import { RunRail } from "~/components/RunRail";
import { RunReport } from "~/components/RunReport";
import { SectionHeading, SettingsCard, SettingsRow } from "~/components/SettingsComponents";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";

type JsonRecord = Record<string, unknown>;

type AgentLike = {
  id: string;
  name: string;
  description?: string | null;
  instructions?: string | null;
  skills?: string[];
  schedule?: string | null;
  status?: string | null;
  toolConfig?: JsonRecord | null;
  notificationConfig?: JsonRecord | null;
  [key: string]: unknown;
};

type ProjectLike = {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
};

type SkillLike = {
  id: string;
  name: string;
  description?: string;
};

type ConnectionLike = {
  id?: string;
  provider: string;
  status: string;
  reason?: string;
};

type ApprovalLike = {
  id: string;
  approvalId?: string;
  runId?: string;
  toolName?: string;
  toolInput?: JsonRecord;
  status?: string;
  decisionReason?: string;
  createdAt?: string | number | Date;
  resolvedAt?: string | number | Date;
};

type RunLike = {
  id: string;
  agentId?: string;
  triggerType?: string;
  status?: string;
  startedAt?: string | number | Date;
  completedAt?: string | number | Date;
  error?: string | null;
  result?: {
    headline?: string;
    details?: string[];
    eventsLogged?: number;
    proposals?: Array<{
      id?: string;
      action?: string;
      reason?: string;
      confidence?: number;
      skillSource?: string;
    }>;
    steps?: Array<{
      step?: string;
    }>;
  };
};

type ToolConfigEntryLike = {
  toolName?: string;
  title?: string;
  description?: string;
  mode?: "read" | "write";
  enabled?: boolean;
  approvalMode?: "auto" | "approval" | "blocked";
};

type ToolConfigLike = {
  requiredProviders?: Array<{ provider: string; reason?: string; logo?: string }>;
  tools?: Record<string, ToolConfigEntryLike>;
};

type NotificationConfigLike = {
  inApp?: boolean;
  email?: boolean;
  slack?: boolean;
};

export interface AgentWorkspaceProps {
  agent: AgentLike;
  project: ProjectLike;
  onBack: () => void;
  onDeleteAgent?: () => void;
  onRunNow?: () => Promise<{ runId?: string } | undefined>;
  onApprove?: (approvalId: string) => Promise<{ runId?: string } | undefined> | undefined;
  onReject?: (approvalId: string) => Promise<void> | void;
  onUpdateAgent?: (
    updates: Partial<{
      name: string;
      description: string;
      instructions: string;
      skills: string[];
      schedule: string;
      toolConfig: ToolConfigLike;
      notificationConfig: NotificationConfigLike;
      status: string;
    }>,
  ) => Promise<void> | void;
  onAskDeeper?: (prompt: string, context?: { eventId?: string; runId?: string }) => void;
  availableSkills?: SkillLike[];
  skills?: SkillLike[];
  projectConnections?: ConnectionLike[];
  requiredProviders?: Array<{ provider: string; reason?: string; logo?: string }>;
  approvals?: ApprovalLike[];
  runs?: RunLike[];
  pendingActions?: ApprovalLike[];
  isDraft?: boolean;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  activeRun?: { runId: string; triggerRunId: string; accessToken: string } | null;
  onLiveRunComplete?: () => void;
  runError?: string | null;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeToolConfig(value: unknown): ToolConfigLike {
  if (!value || typeof value !== "object") {
    return { requiredProviders: [], tools: {} };
  }
  const record = value as Record<string, unknown>;
  return {
    requiredProviders: Array.isArray(record.requiredProviders)
      ? record.requiredProviders.filter(
          (item): item is { provider: string; reason?: string; logo?: string } =>
            !!item && typeof item === "object" && typeof (item as Record<string, unknown>).provider === "string",
        )
      : [],
    tools:
      record.tools && typeof record.tools === "object" ? (record.tools as Record<string, ToolConfigEntryLike>) : {},
  };
}

function normalizeNotificationConfig(value: unknown): NotificationConfigLike {
  if (!value || typeof value !== "object") {
    return { inApp: true, email: false, slack: false };
  }
  const record = value as Record<string, unknown>;
  return {
    inApp: record.inApp !== false,
    email: record.email === true,
    slack: record.slack === true,
  };
}

// ---------------------------------------------------------------------------
// DraftChecklist — pre-flight readiness banner for draft agents
// ---------------------------------------------------------------------------

type ChecklistItem = {
  label: string;
  done: boolean;
  hint?: string;
  action?: { label: string; onClick: () => void };
};

function DraftChecklist({
  items,
  onGoLive,
  goingLive,
}: {
  items: ChecklistItem[];
  onGoLive: () => void;
  goingLive: boolean;
}) {
  const doneCount = items.filter((i) => i.done).length;
  const allDone = doneCount === items.length;

  return (
    <div
      style={{
        marginBottom: 18,
        background: COLORS.surface,
        border: `1px solid ${allDone ? COLORS.green : COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 20px",
          borderBottom: `1px solid ${COLORS.border}`,
          flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              fontWeight: TYPE.weight.semibold,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
              marginBottom: 4,
            }}
          >
            Before you go live
          </div>
          <div
            style={{
              fontSize: TYPE.scale.base,
              fontWeight: TYPE.weight.medium,
              color: COLORS.text,
            }}
          >
            {allDone ? "All set — your agent is ready to launch." : `${doneCount} of ${items.length} complete`}
          </div>
        </div>
        <button
          type="button"
          className="btn"
          onClick={onGoLive}
          disabled={!allDone || goingLive}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 22px",
            borderRadius: RADIUS.md,
            border: "none",
            fontFamily: TYPE.body,
            fontSize: TYPE.scale.sm,
            fontWeight: TYPE.weight.medium,
            cursor: allDone && !goingLive ? "pointer" : "not-allowed",
            background: allDone ? COLORS.green : COLORS.border,
            color: allDone ? COLORS.bg : COLORS.textDim,
            transition: `all ${MOTION.duration} ${MOTION.ease}`,
            opacity: goingLive ? 0.6 : 1,
          }}
        >
          {goingLive ? (
            <CircleNotch size={14} weight="bold" style={{ animation: "spin 1s linear infinite" }} />
          ) : (
            <RocketLaunch size={14} weight="bold" />
          )}
          {goingLive ? "Activating..." : "Go live"}
        </button>
      </div>

      {/* Checklist rows */}
      <div style={{ padding: "8px 12px" }}>
        {items.map((item, index) => (
          <div
            key={item.label}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 8px",
              borderBottom: index < items.length - 1 ? `1px solid ${COLORS.border}` : "none",
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: RADIUS.pill,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                background: item.done ? COLORS.greenDim : "transparent",
                border: item.done ? "none" : `1.5px solid ${COLORS.border}`,
                transition: `all ${MOTION.duration} ${MOTION.ease}`,
              }}
            >
              {item.done && <Check size={12} weight="bold" color={COLORS.green} />}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <span
                style={{
                  fontSize: TYPE.scale.sm,
                  fontWeight: TYPE.weight.medium,
                  color: item.done ? COLORS.textSecondary : COLORS.text,
                  textDecoration: item.done ? "line-through" : "none",
                }}
              >
                {item.label}
              </span>
              {!item.done && item.hint && (
                <span
                  style={{
                    fontSize: TYPE.scale.xs,
                    color: COLORS.textDim,
                    marginLeft: 8,
                  }}
                >
                  {item.hint}
                </span>
              )}
            </div>
            {!item.done && item.action && (
              <button
                type="button"
                className="btn"
                onClick={item.action.onClick}
                style={{
                  background: "transparent",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  color: COLORS.textSecondary,
                  fontSize: TYPE.scale.xs,
                  fontWeight: TYPE.weight.medium,
                  fontFamily: TYPE.body,
                  padding: "4px 12px",
                  cursor: "pointer",
                  flexShrink: 0,
                  transition: `all ${MOTION.duration} ${MOTION.ease}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.accent;
                  e.currentTarget.style.color = COLORS.accent;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.textSecondary;
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const PROVIDER_DISPLAY: Record<string, { name: string; icon: string }> = {
  googleads: { name: "Google Ads", icon: "📊" },
  meta: { name: "Meta Ads", icon: "📘" },
  ga4: { name: "Google Analytics", icon: "📈" },
  googlesearchconsole: { name: "Search Console", icon: "🔍" },
  tiktok: { name: "TikTok Ads", icon: "🎵" },
  shopify: { name: "Shopify", icon: "🛍️" },
  stripe: { name: "Stripe", icon: "💳" },
  github: { name: "GitHub", icon: "🐙" },
  gmail: { name: "Gmail", icon: "✉️" },
  slack: { name: "Slack", icon: "💬" },
  outlook: { name: "Outlook", icon: "📧" },
  telegram: { name: "Telegram", icon: "✈️" },
  whatsapp: { name: "WhatsApp", icon: "📱" },
};

function _ToolTrustRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "info";
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span style={{ color: COLORS.textSecondary, fontSize: TYPE.scale.sm }}>{label}</span>
      <Badge
        color={tone === "success" ? "green" : tone === "warning" ? "orange" : tone === "danger" ? "red" : "accent"}
      >
        {value}
      </Badge>
    </div>
  );
}

function SettingsPanel({
  agent,
  skills,
  connections,
  requiredProviders,
  onUpdateAgent,
  onConnect,
  onDisconnect,
  isDraft: _isDraft,
  onRunNow: _onRunNow,
  section = "objective",
}: {
  agent: AgentLike;
  skills: SkillLike[];
  connections: ConnectionLike[];
  requiredProviders: Array<{ provider: string; reason?: string; logo?: string }>;
  onUpdateAgent?: AgentWorkspaceProps["onUpdateAgent"];
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  isDraft: boolean;
  onRunNow?: () => void;
  section?: "objective" | "tools";
}) {
  const toolConfig = normalizeToolConfig(agent.toolConfig);
  const notificationConfig = normalizeNotificationConfig(agent.notificationConfig);
  const [name, setName] = useState(agent.name);
  const [description, setDescription] = useState(agent.description ?? "");
  const [instructions, setInstructions] = useState(agent.instructions ?? "");
  const [schedule, setSchedule] = useState(agent.schedule ?? "manual");
  const [selectedSkills, setSelectedSkills] = useState<string[]>(agent.skills ?? []);
  const [pendingToolConfig, setPendingToolConfig] = useState(toolConfig);
  const [pendingNotificationConfig, setPendingNotificationConfig] = useState(notificationConfig);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(agent.name);
    setDescription(agent.description ?? "");
    setInstructions(agent.instructions ?? "");
    setSchedule(agent.schedule ?? "manual");
    setSelectedSkills(agent.skills ?? []);
    setPendingToolConfig(normalizeToolConfig(agent.toolConfig));
    setPendingNotificationConfig(normalizeNotificationConfig(agent.notificationConfig));
  }, [
    agent.name,
    agent.description,
    agent.instructions,
    agent.schedule,
    agent.skills,
    agent.toolConfig,
    agent.notificationConfig,
  ]);

  const toolEntries = Object.entries(pendingToolConfig.tools ?? {});
  const _autoCount = toolEntries.filter(([, tool]) => tool.enabled !== false && tool.approvalMode === "auto").length;
  const _approvalCount = toolEntries.filter(
    ([, tool]) => tool.enabled !== false && tool.approvalMode === "approval",
  ).length;
  const _blockedCount = toolEntries.filter(([, tool]) => tool.approvalMode === "blocked").length;
  const activeProviderSet = new Set(
    connections.filter((connection) => connection.status === "active").map((connection) => connection.provider),
  );
  const _missingProviders = requiredProviders.filter((provider) => !activeProviderSet.has(provider.provider));

  const persist = async (patch: Partial<Parameters<NonNullable<AgentWorkspaceProps["onUpdateAgent"]>>[0]>) => {
    if (!onUpdateAgent) return;
    setSaving(true);
    try {
      await onUpdateAgent(patch);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {section === "objective" && (
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
            <SettingsRow
              icon="◌"
              title="Description"
              description="A concise summary of the agent's job."
              defaultExpanded
            >
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
              <div style={{ padding: SPACE[4], color: COLORS.textDim, fontSize: TYPE.scale.sm }}>
                No skills selected yet.
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
                      <button
                        type="button"
                        onClick={() => {
                          const next = isEnabled
                            ? selectedSkills.filter((id) => id !== skill.id)
                            : [...selectedSkills, skill.id];
                          setSelectedSkills(next);
                          void persist({ skills: next });
                        }}
                        style={{
                          width: 40,
                          height: 22,
                          borderRadius: 999,
                          border: "none",
                          background: isEnabled ? COLORS.accent : COLORS.border,
                          position: "relative",
                          cursor: "pointer",
                        }}
                      >
                        <span
                          style={{
                            position: "absolute",
                            inset: 3,
                            width: 16,
                            height: 16,
                            borderRadius: 999,
                            background: COLORS.white,
                            left: isEnabled ? 19 : 3,
                            transition: `left ${MOTION.duration} ${MOTION.ease}`,
                          }}
                        />
                      </button>
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
                  checked={pendingNotificationConfig.inApp !== false}
                  onChange={(checked) => {
                    const next = { ...pendingNotificationConfig, inApp: checked };
                    setPendingNotificationConfig(next);
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
                  checked={pendingNotificationConfig.email === true}
                  onChange={(checked) => {
                    const next = { ...pendingNotificationConfig, email: checked };
                    setPendingNotificationConfig(next);
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
                  checked={pendingNotificationConfig.slack === true}
                  onChange={(checked) => {
                    const next = { ...pendingNotificationConfig, slack: checked };
                    setPendingNotificationConfig(next);
                    void persist({ notificationConfig: next });
                  }}
                />
              }
            />
          </SettingsCard>
        </div>
      )}

      {section === "tools" && (
        <div style={{ display: "grid", gap: 18 }}>
          <SectionHeading>Connections</SectionHeading>
          <div style={{ display: "grid", gap: 6 }}>
            {requiredProviders.map((rp) => {
              const display = PROVIDER_DISPLAY[rp.provider];
              const provider = {
                id: rp.provider,
                name: display?.name ?? rp.provider,
                icon: display?.icon ?? "🔌",
                description: rp.reason ?? "",
                logo: rp.logo ?? null,
              };
              const conn = connections.find((c) => c.provider === provider.id);
              const isConnected = conn?.status === "active";
              const accountId: string | null = conn?.id ?? null;
              return (
                <SettingsCard key={provider.id}>
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
                      {provider.logo ? (
                        <img
                          src={provider.logo}
                          alt=""
                          style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0, objectFit: "contain" }}
                        />
                      ) : (
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{provider.icon}</span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}
                        >
                          {provider.name}
                        </div>
                        {provider.description ? (
                          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 2 }}>
                            {provider.description}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    {isConnected ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <Badge color="green">Connected</Badge>
                        <button
                          type="button"
                          className="btn"
                          onClick={() => onConnect?.(provider.id)}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = COLORS.textDim;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = COLORS.border;
                          }}
                          style={{
                            fontFamily: TYPE.body,
                            padding: "4px 10px",
                            borderRadius: RADIUS.pill,
                            border: `1px solid ${COLORS.border}`,
                            background: "transparent",
                            color: COLORS.textSecondary,
                            fontSize: TYPE.scale.xs,
                            cursor: "pointer",
                            transition: `all ${MOTION.duration} ${MOTION.ease}`,
                          }}
                        >
                          Reconnect
                        </button>
                        {accountId && (
                          <button
                            type="button"
                            className="btn"
                            onClick={() => onDisconnect?.(provider.id, accountId)}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = COLORS.red;
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = COLORS.border;
                            }}
                            style={{
                              fontFamily: TYPE.body,
                              padding: "4px 10px",
                              borderRadius: RADIUS.pill,
                              border: `1px solid ${COLORS.border}`,
                              background: "transparent",
                              color: COLORS.red,
                              fontSize: TYPE.scale.xs,
                              cursor: "pointer",
                              transition: `all ${MOTION.duration} ${MOTION.ease}`,
                            }}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => onConnect?.(provider.id)}
                        disabled={!onConnect}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = COLORS.accentDim;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                        style={{
                          fontFamily: TYPE.body,
                          padding: "6px 16px",
                          borderRadius: RADIUS.pill,
                          border: `1px solid ${COLORS.accent}`,
                          background: "transparent",
                          color: COLORS.accent,
                          fontSize: TYPE.scale.xs,
                          fontWeight: TYPE.weight.semibold,
                          cursor: onConnect ? "pointer" : "default",
                          transition: `all ${MOTION.duration} ${MOTION.ease}`,
                          flexShrink: 0,
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

          {toolEntries.length > 0 && (
            <>
              <SectionHeading>Per-tool settings</SectionHeading>
              <SettingsCard>
                {toolEntries.map(([key, tool], index) => (
                  <SettingsRow
                    key={key}
                    icon={tool.mode === "write" ? "↗" : "↘"}
                    title={tool.title ?? humanize(key)}
                    description={tool.description}
                    value={tool.approvalMode ? humanize(tool.approvalMode) : "Auto"}
                    isLast={index === toolEntries.length - 1}
                    defaultExpanded
                    trailing={
                      <Badge color={tool.mode === "write" ? "write" : "read"}>
                        {tool.mode === "write" ? "Write" : "Read"}
                      </Badge>
                    }
                  >
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {(["auto", "approval", "blocked"] as const).map((mode) => (
                        <button
                          type="button"
                          className="pill"
                          key={mode}
                          onClick={() => {
                            const next = {
                              ...pendingToolConfig,
                              tools: {
                                ...(pendingToolConfig.tools ?? {}),
                                [key]: {
                                  ...tool,
                                  approvalMode: mode,
                                  enabled: mode !== "blocked",
                                  toolName: tool.toolName ?? key,
                                },
                              },
                            };
                            setPendingToolConfig(next);
                            void persist({ toolConfig: next });
                          }}
                          style={{
                            fontFamily: TYPE.body,
                            padding: "6px 14px",
                            borderRadius: RADIUS.pill,
                            border: `1px solid ${tool.approvalMode === mode ? COLORS.accent : COLORS.border}`,
                            background: tool.approvalMode === mode ? COLORS.accentDim : "transparent",
                            color: tool.approvalMode === mode ? COLORS.accent : COLORS.textSecondary,
                            fontSize: TYPE.scale.xs,
                            fontWeight: TYPE.weight.medium,
                            cursor: "pointer",
                            transition: `all ${MOTION.duration} ${MOTION.ease}`,
                          }}
                        >
                          {humanize(mode)}
                        </button>
                      ))}
                    </div>
                  </SettingsRow>
                ))}
              </SettingsCard>
            </>
          )}
        </div>
      )}
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
          top: 3,
          left: checked ? 19 : 3,
          width: 14,
          height: 14,
          borderRadius: RADIUS.pill,
          background: COLORS.white,
          transition: `left ${MOTION.duration} ${MOTION.ease}`,
        }}
      />
    </button>
  );
}

const fieldStyle: CSSProperties = {
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

export function AgentWorkspace(props: AgentWorkspaceProps) {
  const {
    agent,
    project,
    onBack,
    onDeleteAgent,
    onRunNow,
    onApprove,
    onReject,
    onUpdateAgent,
    onAskDeeper,
    onConnect,
    onDisconnect,
    approvals: _approvals = [],
    runs = [],
    pendingActions = [],
    requiredProviders = [],
    isDraft: isDraftProp,
    activeRun,
    onLiveRunComplete,
    runError,
  } = props;

  const availableSkills = props.availableSkills ?? props.skills ?? [];
  const projectConnections = props.projectConnections ?? [];
  const isDraft = isDraftProp ?? agent.status?.toLowerCase() === "draft";
  const [tab, setTab] = useState<"activity" | "objective" | "tools" | "chat" | "memory">("activity");
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Auto-select latest run when runs load or on mount
  useEffect(() => {
    if (runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  // Reset selection when agent changes
  useEffect(() => {
    setSelectedRunId(null);
  }, []);

  const selectedRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;

  // Find pending approval for the selected run
  const selectedRunApproval = useMemo(() => {
    if (!selectedRun) return null;
    const pending = pendingActions.find((a) => a.runId === selectedRun.id && a.status === "pending");
    if (!pending) return null;
    return { id: pending.id, toolName: pending.toolName, reason: pending.decisionReason };
  }, [selectedRun, pendingActions]);

  const mergedRequiredProviders = useMemo(() => {
    const config = normalizeToolConfig(agent.toolConfig);
    const providers = new Map<string, { provider: string; reason?: string }>();
    for (const entry of config.requiredProviders ?? []) {
      providers.set(entry.provider, entry);
    }
    for (const entry of requiredProviders) {
      providers.set(entry.provider, entry);
    }
    return [...providers.values()];
  }, [agent.toolConfig, requiredProviders]);

  const activeConnections = projectConnections.filter((connection) => connection.status === "active");

  const handleSave = async (updates: Partial<Parameters<NonNullable<AgentWorkspaceProps["onUpdateAgent"]>>[0]>) => {
    await onUpdateAgent?.(updates);
  };

  // --- Draft checklist readiness ---
  const [goingLive, setGoingLive] = useState(false);

  const activeProviderSet = new Set(projectConnections.filter((c) => c.status === "active").map((c) => c.provider));
  const missingProviders = mergedRequiredProviders.filter((p) => !activeProviderSet.has(p.provider));

  const hasName = !!agent.name && agent.name !== "Untitled Agent";
  const hasInstructions = !!(agent.instructions && agent.instructions.trim().length > 20);
  const hasToolsConnected = mergedRequiredProviders.length === 0 || missingProviders.length === 0;
  const hasSchedule = !!agent.schedule && agent.schedule !== "manual";

  const checklistItems: ChecklistItem[] = isDraft
    ? [
        {
          label: "Name your agent",
          done: hasName,
          hint: "Give it a memorable name",
          action: !hasName ? { label: "Edit", onClick: () => setTab("objective") } : undefined,
        },
        {
          label: "Write instructions",
          done: hasInstructions,
          hint: "Tell it what to monitor and optimize",
          action: !hasInstructions ? { label: "Edit", onClick: () => setTab("objective") } : undefined,
        },
        {
          label: "Connect required tools",
          done: hasToolsConnected,
          hint:
            missingProviders.length > 0
              ? `${missingProviders.map((p) => humanize(p.provider)).join(", ")} not connected`
              : undefined,
          action: !hasToolsConnected ? { label: "Connect", onClick: () => setTab("tools") } : undefined,
        },
        {
          label: "Set a run schedule",
          done: hasSchedule,
          hint: "Or keep manual if you prefer",
          action: !hasSchedule ? { label: "Set", onClick: () => setTab("objective") } : undefined,
        },
      ]
    : [];

  const handleGoLive = async () => {
    if (!onUpdateAgent) return;
    setGoingLive(true);
    try {
      await onUpdateAgent({ status: "live" });
    } finally {
      setGoingLive(false);
    }
  };

  // --- First-run confirmation ---
  const isFirstRun = runs.length === 0;
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);

  const handleRunNowWithConfirm = () => {
    if (isFirstRun && !showFirstRunPrompt) {
      setShowFirstRunPrompt(true);
      return;
    }
    setShowFirstRunPrompt(false);
    void onRunNow?.();
  };

  // Wrap onRunNow so all buttons go through the first-run check
  const wrappedOnRunNow = onRunNow ? handleRunNowWithConfirm : undefined;

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <style>{`
        .aw-shell { color: ${COLORS.text}; font-family: ${TYPE.body}; }
        .aw-shell textarea::-webkit-scrollbar { width: 6px; }
        .aw-shell textarea::-webkit-scrollbar-track { background: transparent; }
        .aw-shell textarea::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 999px; }
        .aw-shell textarea { scrollbar-width: thin; scrollbar-color: ${COLORS.border} transparent; }
        @keyframes awFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes awPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .aw-panel-enter { animation: awFadeIn 0.4s ${MOTION.easeOutExpo} both; }
        .aw-running-dot { animation: awPulse 3s ease-in-out infinite; }
      `}</style>

      <div
        className="aw-shell"
        style={{
          background: `radial-gradient(circle at top left, rgba(255,255,255,0.05), transparent 32%), linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bg} 100%)`,
          padding: "28px clamp(20px, 3vw, 40px) 40px",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 18,
            flexWrap: "wrap",
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, minWidth: 0 }}>
            <button
              type="button"
              onClick={onBack}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.md,
                cursor: "pointer",
                color: COLORS.textSecondary,
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={16} />
            </button>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                <Badge color="accent">
                  {project.icon ?? "◌"} {project.name}
                </Badge>
                <Badge color={isDraft ? "orange" : agent.status === "running" ? "green" : "gray"}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {agent.status === "running" && (
                      <span
                        className="aw-running-dot"
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: RADIUS.pill,
                          background: COLORS.green,
                          display: "inline-block",
                        }}
                      />
                    )}
                    {humanize(agent.status ?? (isDraft ? "draft" : "idle"))}
                  </span>
                </Badge>
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: TYPE.scale.xl,
                  fontFamily: TYPE.display,
                  fontWeight: TYPE.weight.bold,
                  letterSpacing: TYPE.tracking.tight,
                  color: COLORS.text,
                  lineHeight: TYPE.leading.tight,
                }}
              >
                {agent.name}
              </h1>
              <p
                style={{
                  margin: "8px 0 0",
                  color: COLORS.textSecondary,
                  maxWidth: 780,
                  lineHeight: TYPE.leading.normal,
                  fontSize: TYPE.scale.base,
                  fontFamily: TYPE.body,
                }}
              >
                {agent.description || agent.instructions || "No description yet."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {wrappedOnRunNow ? (
              <Button onClick={wrappedOnRunNow}>
                <Play size={13} weight="bold" />
                Run now
              </Button>
            ) : null}
            <div style={{ position: "relative" }}>
              <Button variant="ghost" onClick={() => setMoreOpen((value) => !value)}>
                <DotsThree size={18} />
                More
              </Button>
              {moreOpen ? (
                <>
                  <button
                    type="button"
                    aria-label="Close menu"
                    onClick={() => setMoreOpen(false)}
                    style={{ position: "fixed", inset: 0, border: "none", background: "transparent" }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      right: 0,
                      marginTop: 8,
                      minWidth: 180,
                      background: COLORS.surface,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 12,
                      padding: 6,
                      zIndex: 20,
                    }}
                  >
                    {onDeleteAgent ? (
                      <button
                        type="button"
                        className="btn"
                        onClick={() => {
                          setMoreOpen(false);
                          onDeleteAgent();
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = COLORS.redDim;
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "transparent";
                        }}
                        style={{
                          width: "100%",
                          padding: "10px 12px",
                          background: "transparent",
                          border: "none",
                          color: COLORS.red,
                          textAlign: "left",
                          cursor: "pointer",
                          borderRadius: 8,
                          transition: `background ${MOTION.duration} ${MOTION.ease}`,
                        }}
                      >
                        Delete agent
                      </button>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* Draft pre-flight checklist — visible on all tabs */}
        {isDraft && checklistItems.length > 0 && (
          <DraftChecklist items={checklistItems} onGoLive={() => void handleGoLive()} goingLive={goingLive} />
        )}

        <div style={{ display: "flex", gap: 24, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 22 }}>
          {(["activity", "objective", "tools", "chat", "memory"] as const).map((item) => (
            <button
              type="button"
              key={item}
              onClick={() => setTab(item)}
              style={{
                background: "transparent",
                border: "none",
                padding: "12px 0",
                marginBottom: -1,
                cursor: "pointer",
                color: tab === item ? COLORS.text : COLORS.textDim,
                borderBottom: `2px solid ${tab === item ? COLORS.accent : "transparent"}`,
                fontWeight: TYPE.weight.medium,
                fontSize: TYPE.scale.sm,
                fontFamily: TYPE.body,
                transition: `color ${MOTION.duration} ${MOTION.ease}`,
              }}
            >
              {item.charAt(0).toUpperCase() + item.slice(1)}
            </button>
          ))}
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 10,
              paddingBottom: 12,
              color: COLORS.textDim,
              fontSize: TYPE.scale.xs,
            }}
          >
            <span>{activeConnections.length} connected</span>
            <span>•</span>
            <span>{mergedRequiredProviders.length} required</span>
          </div>
        </div>

        {/* First-run context prompt */}
        {showFirstRunPrompt && (
          <Card style={{ padding: "20px 24px", marginBottom: 18, borderColor: COLORS.accent }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: RADIUS.lg,
                  background: COLORS.accentDim,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Info size={18} weight="bold" color={COLORS.accent} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div
                  style={{
                    fontSize: TYPE.scale.md,
                    fontWeight: TYPE.weight.semibold,
                    color: COLORS.text,
                    fontFamily: TYPE.display,
                    marginBottom: 6,
                  }}
                >
                  Ready to start the first run?
                </div>
                <div
                  style={{
                    fontSize: TYPE.scale.base,
                    color: COLORS.textSecondary,
                    lineHeight: TYPE.leading.normal,
                    marginBottom: 4,
                  }}
                >
                  The agent will follow its instructions, use connected tools to gather data, analyze what it finds, and
                  surface results on the Activity tab.
                </div>
                <ul
                  style={{
                    margin: "10px 0 0",
                    padding: "0 0 0 18px",
                    color: COLORS.textSecondary,
                    fontSize: TYPE.scale.sm,
                    lineHeight: 1.8,
                  }}
                >
                  <li>Runs typically take 30 seconds to a few minutes</li>
                  {mergedRequiredProviders.length > 0 && (
                    <li>Using: {mergedRequiredProviders.map((p) => humanize(p.provider)).join(", ")}</li>
                  )}
                  {Object.values(normalizeToolConfig(agent.toolConfig).tools ?? {}).some(
                    (t) => t.approvalMode === "approval",
                  ) && <li>Write actions will pause for your approval before executing</li>}
                </ul>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0, alignSelf: "center" }}>
                <Button variant="secondary" onClick={() => setShowFirstRunPrompt(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    setShowFirstRunPrompt(false);
                    void onRunNow?.();
                  }}
                >
                  <Play size={13} weight="bold" />
                  Start run
                </Button>
              </div>
            </div>
          </Card>
        )}

        {tab === "activity" && (
          <div
            className="aw-panel-enter"
            style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0 }}
          >
            {runError && (
              <div
                style={{
                  padding: "10px 14px",
                  margin: "0 0 8px 0",
                  background: COLORS.redSubtle,
                  borderLeft: `3px solid ${COLORS.red}`,
                  borderRadius: RADIUS.sm,
                  fontSize: TYPE.scale.sm,
                  color: COLORS.red,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <WarningCircle size={16} weight="bold" />
                {runError}
              </div>
            )}
            {activeRun ? (
              <LiveRunView
                triggerRunId={activeRun.triggerRunId}
                accessToken={activeRun.accessToken}
                runId={activeRun.runId}
                onComplete={onLiveRunComplete}
                onApprove={
                  onApprove
                    ? (id, _reason) => {
                        void onApprove(id);
                      }
                    : undefined
                }
                onReject={
                  onReject
                    ? (id, _reason) => {
                        void onReject(id);
                      }
                    : undefined
                }
              />
            ) : (
              <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
                <RunRail runs={runs} selectedRunId={selectedRun?.id ?? null} onSelect={setSelectedRunId} />
                <RunReport
                  run={selectedRun as any}
                  hasRuns={runs.length > 0}
                  onRunNow={wrappedOnRunNow}
                  pendingApproval={selectedRunApproval}
                  onApprove={(id) => {
                    void onApprove?.(id);
                  }}
                  onReject={(id) => {
                    void onReject?.(id);
                  }}
                />
              </div>
            )}
          </div>
        )}

        {tab === "objective" && (
          <div className="aw-panel-enter">
            <SettingsPanel
              agent={agent}
              skills={availableSkills}
              connections={projectConnections}
              requiredProviders={mergedRequiredProviders}
              onUpdateAgent={handleSave}
              isDraft={isDraft}
              onRunNow={wrappedOnRunNow}
              section="objective"
            />
          </div>
        )}

        {tab === "tools" && (
          <div className="aw-panel-enter">
            <SettingsPanel
              agent={agent}
              skills={availableSkills}
              connections={projectConnections}
              requiredProviders={mergedRequiredProviders}
              onUpdateAgent={handleSave}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              isDraft={isDraft}
              onRunNow={wrappedOnRunNow}
              section="tools"
            />
          </div>
        )}

        {tab === "chat" && (
          <div
            className="aw-panel-enter"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: RADIUS.lg,
                background: COLORS.accentDim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <ChatCircle size={20} weight="bold" color={COLORS.accent} />
            </div>
            <div
              style={{
                fontSize: TYPE.scale.md,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                fontFamily: TYPE.display,
                marginBottom: 6,
              }}
            >
              Talk to {agent.name}
            </div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                color: COLORS.textSecondary,
                maxWidth: 440,
                lineHeight: TYPE.leading.normal,
                marginBottom: 24,
              }}
            >
              Ask about findings, request deeper analysis on a specific run, or give new instructions. The agent uses
              its full context to respond.
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%", maxWidth: 360 }}>
              {[
                "What did you find in the last run?",
                "Which keywords are wasting the most spend?",
                "Run a deeper analysis on yesterday's data",
              ].map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  className="btn"
                  onClick={() => onAskDeeper?.(prompt)}
                  style={{
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.md,
                    color: COLORS.textSecondary,
                    fontSize: TYPE.scale.sm,
                    fontFamily: TYPE.body,
                    padding: "10px 16px",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: `all ${MOTION.duration} ${MOTION.ease}`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = COLORS.accent;
                    e.currentTarget.style.color = COLORS.text;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border;
                    e.currentTarget.style.color = COLORS.textSecondary;
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "memory" && (
          <div
            className="aw-panel-enter"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              padding: "80px 24px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: RADIUS.lg,
                background: COLORS.accentDim,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <BookOpen size={20} weight="bold" color={COLORS.accent} />
            </div>
            <div
              style={{
                fontSize: TYPE.scale.md,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                fontFamily: TYPE.display,
                marginBottom: 6,
              }}
            >
              {agent.name} hasn't learned anything yet
            </div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                color: COLORS.textSecondary,
                maxWidth: 440,
                lineHeight: TYPE.leading.normal,
                marginBottom: 24,
              }}
            >
              After each run, the agent extracts lessons — patterns it noticed, decisions that worked, and mistakes to
              avoid. These compound over time, making each run smarter than the last.
            </div>
            <div style={{ display: "flex", gap: 24, justifyContent: "center", flexWrap: "wrap" }}>
              {[
                { label: "Lessons", desc: "Patterns and takeaways from past runs" },
                { label: "Observations", desc: "Data points the agent is tracking" },
                { label: "Decisions", desc: "Choices made and their outcomes" },
              ].map((item) => (
                <div key={item.label} style={{ textAlign: "center", maxWidth: 140 }}>
                  <div
                    style={{
                      fontSize: TYPE.scale.sm,
                      fontWeight: TYPE.weight.semibold,
                      color: COLORS.textDim,
                      marginBottom: 4,
                    }}
                  >
                    {item.label}
                  </div>
                  <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, lineHeight: TYPE.leading.normal }}>
                    {item.desc}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
