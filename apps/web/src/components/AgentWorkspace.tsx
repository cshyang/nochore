import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, BookOpen, ChatCircle, Check, CheckCircle, CircleNotch, DotsThree, Info, Play, Sparkle, WarningCircle, X } from "@phosphor-icons/react";
import { LiveRunView } from "~/components/LiveRunView";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { COLORS, RADIUS, TYPE, MOTION, SPACE } from "~/lib/colors";
import { SettingsCard, SettingsRow, SectionHeading } from "~/components/SettingsComponents";

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

type TimelineEventLike = {
  id: string;
  type?: string;
  title?: string;
  summary?: string;
  description?: string;
  status?: string;
  timestamp?: string | number | Date;
  runId?: string;
  approvalId?: string;
  actionId?: string;
  toolName?: string;
  tags?: string[];
  details?: string[];
  tone?: "info" | "success" | "warning" | "danger";
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
  requiredProviders?: Array<{ provider: string; reason?: string }>;
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
  onRunNow?: () => Promise<{ runId?: string } | void>;
  onApprove?: (approvalId: string) => Promise<{ runId?: string } | void> | void;
  onReject?: (approvalId: string) => Promise<void> | void;
  onUpdateAgent?: (updates: Partial<{
    name: string;
    description: string;
    instructions: string;
    skills: string[];
    schedule: string;
    toolConfig: ToolConfigLike;
    notificationConfig: NotificationConfigLike;
    status: string;
  }>) => Promise<void> | void;
  onAskDeeper?: (prompt: string, context?: { eventId?: string; runId?: string }) => void;
  availableSkills?: SkillLike[];
  skills?: SkillLike[];
  projectConnections?: ConnectionLike[];
  requiredProviders?: Array<{ provider: string; reason?: string }>;
  timelineEvents?: TimelineEventLike[];
  approvals?: ApprovalLike[];
  runs?: RunLike[];
  pendingActions?: ApprovalLike[];
  isDraft?: boolean;
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  toolkits?: Array<{ id: string; name: string; logo: string | null; isConnected: boolean; connectedAccountId: string | null }>;
  activeRun?: { runId: string; triggerRunId: string; accessToken: string } | null;
  onLiveRunComplete?: () => void;
  runError?: string | null;
}

type TimelineItem = {
  id: string;
  type: string;
  title: string;
  summary: string;
  timestamp: Date;
  tone: "info" | "success" | "warning" | "danger";
  tags: string[];
  runId?: string;
  approvalId?: string;
  actionId?: string;
  details?: string[];
  toolName?: string;
  raw?: TimelineEventLike | RunLike | ApprovalLike;
};

function toDate(value: string | number | Date | undefined): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  return new Date();
}

function formatTimeAgo(value: Date): string {
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status?: string): TimelineItem["tone"] {
  switch ((status ?? "").toLowerCase()) {
    case "completed":
    case "approved":
    case "executed":
    case "active":
    case "live":
      return "success";
    case "failed":
    case "rejected":
    case "blocked":
    case "warning":
      return "danger";
    case "pending":
    case "queued":
    case "running":
    case "waiting_for_approval":
      return "warning";
    default:
      return "info";
  }
}

function toneColor(tone: TimelineItem["tone"]): string {
  switch (tone) {
    case "success":
      return COLORS.green;
    case "warning":
      return COLORS.orange;
    case "danger":
      return COLORS.red;
    case "info":
    default:
      return COLORS.accent;
  }
}

function normalizeToolConfig(value: unknown): ToolConfigLike {
  if (!value || typeof value !== "object") {
    return { requiredProviders: [], tools: {} };
  }
  const record = value as Record<string, unknown>;
  return {
    requiredProviders: Array.isArray(record.requiredProviders)
      ? record.requiredProviders.filter(
          (item): item is { provider: string; reason?: string } =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).provider === "string",
        )
      : [],
    tools:
      record.tools && typeof record.tools === "object"
        ? (record.tools as Record<string, ToolConfigEntryLike>)
        : {},
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

function toTimelineItems(params: {
  timelineEvents: TimelineEventLike[];
  approvals: ApprovalLike[];
  runs: RunLike[];
  pendingActions: ApprovalLike[];
}): TimelineItem[] {
  const approvalItems = params.approvals.map((approval) => {
    const timestamp = toDate(approval.createdAt);
    return {
      id: `approval-${approval.id}`,
      type: "approval",
      title: approval.toolName ? humanize(approval.toolName) : "Approval requested",
      summary: approval.decisionReason ?? "Waiting on a decision.",
      timestamp,
      tone: getStatusTone(approval.status),
      tags: [
        approval.status ? humanize(approval.status) : "pending",
        approval.runId ? "Run attached" : "No run",
      ],
      runId: approval.runId,
      approvalId: approval.approvalId ?? approval.id,
      actionId: approval.id,
      toolName: approval.toolName,
      raw: approval,
    } satisfies TimelineItem;
  });

  const pendingItems = params.pendingActions.map((approval) => ({
    id: `pending-${approval.id}`,
    type: "approval",
    title: approval.toolName ? humanize(approval.toolName) : "Approval requested",
    summary: approval.decisionReason ?? "Waiting on a decision.",
    timestamp: toDate(approval.createdAt),
    tone: getStatusTone(approval.status),
    tags: [approval.status ? humanize(approval.status) : "pending"],
    runId: approval.runId,
    approvalId: approval.approvalId ?? approval.id,
    actionId: approval.id,
    toolName: approval.toolName,
    raw: approval,
  } satisfies TimelineItem));

  const runItems = params.runs.map((run) => {
    const status = (run.status ?? "").toLowerCase();
    const tone = getStatusTone(status);
    const startedAt = toDate(run.startedAt);
    const baseTitle =
      run.result?.headline ??
      (status === "failed"
        ? "Run failed"
        : status === "running"
          ? "Run in progress"
          : status === "queued"
            ? "Run queued"
            : "Run completed");
    const summary =
      run.error ??
      run.result?.details?.[0] ??
      (run.result?.proposals?.length
        ? `${run.result.proposals.length} proposal${run.result.proposals.length === 1 ? "" : "s"} surfaced`
        : `Triggered by ${run.triggerType ?? "manual"}.`);

    return {
      id: `run-${run.id}`,
      type: `run:${status || "unknown"}`,
      title: baseTitle,
      summary,
      timestamp: startedAt,
      tone,
      tags: [
        run.triggerType ? humanize(run.triggerType) : "Run",
        run.status ? humanize(run.status) : "Unknown",
      ],
      runId: run.id,
      details: run.result?.details,
      raw: run,
    } satisfies TimelineItem;
  });

  const eventItems = params.timelineEvents.map((event) => ({
    id: event.id,
    type: event.type ?? "event",
    title: event.title ?? humanize(event.type ?? "event"),
    summary: event.summary ?? event.description ?? "",
    timestamp: toDate(event.timestamp),
    tone: event.tone ?? getStatusTone(event.status),
    tags: event.tags ?? [event.type ? humanize(event.type) : "Event"],
    runId: event.runId,
    approvalId: event.approvalId,
    actionId: event.actionId,
    details: event.details,
    toolName: event.toolName,
    raw: event,
  } satisfies TimelineItem));

  return [...eventItems, ...approvalItems, ...pendingItems, ...runItems]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index);
}

function iconForTone(tone: TimelineItem["tone"]) {
  switch (tone) {
    case "success":
      return CheckCircle;
    case "warning":
      return WarningCircle;
    case "danger":
      return X;
    default:
      return Info;
  }
}

function TimelineCard({
  item,
  onApprove,
  onReject,
  onSelect,
}: {
  item: TimelineItem;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  onSelect?: (item: TimelineItem) => void;
}) {
  const Icon = iconForTone(item.tone);
  return (
    <Card
      style={{
        padding: 18,
        borderLeft: `3px solid ${toneColor(item.tone)}`,
        borderRadius: RADIUS.sm,
        background: COLORS.surface,
      }}
      onClick={() => onSelect?.(item)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
            <Badge color={item.tone === "danger" ? "red" : item.tone === "warning" ? "orange" : item.tone === "success" ? "green" : "accent"}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <Icon size={12} weight="bold" />
                {item.type.includes("approval") ? "Approval" : item.type.startsWith("run") ? "Run" : "Timeline"}
              </span>
            </Badge>
            <span style={{ color: COLORS.textDim, fontSize: TYPE.scale.xs }}>{formatTimeAgo(item.timestamp)}</span>
          </div>
          <h3 style={{ margin: 0, fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text, lineHeight: TYPE.leading.snug, fontFamily: TYPE.display }}>
            {item.title}
          </h3>
          <p style={{ margin: "8px 0 0", color: COLORS.textSecondary, fontSize: TYPE.scale.base, lineHeight: TYPE.leading.normal, fontFamily: TYPE.body }}>
            {item.summary}
          </p>
          {item.details?.length ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
              {item.details.map((detail) => (
                <div key={detail} style={{ color: COLORS.textDim, fontSize: TYPE.scale.xs, lineHeight: TYPE.leading.snug }}>
                  • {detail}
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
          <span style={{ color: COLORS.textDim, fontSize: TYPE.scale.xs }}>{item.timestamp.toLocaleString()}</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {item.tags.map((tag) => (
              <span
                key={tag}
                style={{
                  fontSize: TYPE.scale.xs,
                  padding: "4px 8px",
                  borderRadius: RADIUS.pill,
                  background: COLORS.surface,
                  color: COLORS.textSecondary,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
      {item.approvalId ? (
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Button size="sm" onClick={() => onApprove?.(item.approvalId!)}>
            <Check size={13} weight="bold" />
            Approve
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onReject?.(item.approvalId!)}>
            Reject
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TimelinePanel({
  items,
  onApprove,
  onReject,
  onRunNow,
  selected,
  onSelect,
}: {
  items: TimelineItem[];
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
  onRunNow?: () => void;
  selected: TimelineItem | null;
  onSelect: (item: TimelineItem | null) => void;
}) {


  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <Card style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
              <Badge color="accent">
                <Sparkle size={12} weight="bold" />
                Timeline surface
              </Badge>
              {selected ? (
                <Badge color="accent">Focused on {selected.title}</Badge>
              ) : null}
            </div>
            <h2 style={{ margin: 0, fontSize: TYPE.scale.md, fontFamily: TYPE.display, fontWeight: TYPE.weight.semibold, color: COLORS.text, lineHeight: TYPE.leading.snug }}>
              Event-driven work, approvals, and outcomes in one place.
            </h2>
            <p style={{ margin: "8px 0 0", color: COLORS.textSecondary, lineHeight: TYPE.leading.normal, maxWidth: 600, fontSize: TYPE.scale.base, fontFamily: TYPE.body }}>
              Review what the agent found, approve or reject requested actions, and ask for more context without leaving the timeline.
            </p>
          </div>
          {onRunNow ? (
            <Button onClick={onRunNow}>
              <Play size={13} weight="bold" />
              Run now
            </Button>
          ) : null}
        </div>
      </Card>

      {items.length === 0 ? (
        <Card style={{ padding: SPACE[6], textAlign: "center", color: COLORS.textDim, fontSize: TYPE.scale.base, fontFamily: TYPE.body }}>
          No timeline events yet. Trigger a run or keep the agent in draft while you finish setup.
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {items.map((item) => (
            <TimelineCard
              key={item.id}
              item={item}
              onApprove={onApprove}
              onReject={onReject}
              onSelect={(next) => onSelect(next)}
            />
          ))}
        </div>
      )}

    </div>
  );
}

const POPULAR_PROVIDERS = [
  { id: "gmail", name: "Gmail", icon: "✉️", description: "Send emails and read inbox" },
  { id: "outlook", name: "Outlook", icon: "📧", description: "Microsoft email and calendar" },
  { id: "slack", name: "Slack", icon: "💬", description: "Send messages and notifications" },
  { id: "telegram", name: "Telegram", icon: "✈️", description: "Send messages via Telegram bot" },
  { id: "whatsapp", name: "WhatsApp", icon: "📱", description: "Send WhatsApp messages" },
] as const;

function ToolTrustRow({
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
      <Badge color={tone === "success" ? "green" : tone === "warning" ? "orange" : tone === "danger" ? "red" : "accent"}>
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
  toolkits = [],
  isDraft,
  onRunNow,
  section = "objective",
}: {
  agent: AgentLike;
  skills: SkillLike[];
  connections: ConnectionLike[];
  requiredProviders: Array<{ provider: string; reason?: string }>;
  onUpdateAgent?: AgentWorkspaceProps["onUpdateAgent"];
  onConnect?: (provider: string) => void;
  onDisconnect?: (provider: string, connectedAccountId: string) => void;
  toolkits?: Array<{ id: string; name: string; logo: string | null; isConnected: boolean; connectedAccountId: string | null }>;
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
  }, [agent.id, agent.name, agent.description, agent.instructions, agent.schedule, agent.skills, agent.toolConfig, agent.notificationConfig]);

  const toolEntries = Object.entries(pendingToolConfig.tools ?? {});
  const autoCount = toolEntries.filter(([, tool]) => tool.enabled !== false && tool.approvalMode === "auto").length;
  const approvalCount = toolEntries.filter(([, tool]) => tool.enabled !== false && tool.approvalMode === "approval").length;
  const blockedCount = toolEntries.filter(([, tool]) => tool.approvalMode === "blocked").length;
  const activeProviderSet = new Set(connections.filter((connection) => connection.status === "active").map((connection) => connection.provider));
  const missingProviders = requiredProviders.filter((provider) => !activeProviderSet.has(provider.provider));

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
      {isDraft && section === "objective" ? (
        <Card style={{ padding: 18, borderLeft: `3px solid ${COLORS.orange}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <Badge color="orange">Setup</Badge>
              <h3 style={{ margin: "10px 0 6px", color: COLORS.text, fontSize: TYPE.scale.md, fontFamily: TYPE.display, fontWeight: TYPE.weight.semibold }}>Draft agent</h3>
              <p style={{ margin: 0, color: COLORS.textSecondary, lineHeight: TYPE.leading.normal, fontSize: TYPE.scale.base, fontFamily: TYPE.body }}>
                Finish the instructions, tools, and required connections before launching.
              </p>
            </div>
            {onRunNow ? (
              <Button variant="secondary" onClick={onRunNow}>
                Run check
              </Button>
            ) : null}
          </div>
          {missingProviders.length > 0 ? (
            <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
              {missingProviders.map((provider) => (
                <div key={provider.provider} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "10px 12px", borderRadius: RADIUS.md, background: COLORS.bg, border: `1px solid ${COLORS.border}` }}>
                  <span style={{ color: COLORS.textSecondary, fontSize: TYPE.scale.sm }}>{humanize(provider.provider)}</span>
                  <Badge color="orange">Required</Badge>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ) : null}

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
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
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
                      <button
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
                        <span style={{ position: "absolute", inset: 3, width: 16, height: 16, borderRadius: 999, background: COLORS.white, left: isEnabled ? 19 : 3, transition: `left ${MOTION.duration} ${MOTION.ease}` }} />
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
              trailing={<Toggle checked={pendingNotificationConfig.inApp !== false} onChange={(checked) => { const next = { ...pendingNotificationConfig, inApp: checked }; setPendingNotificationConfig(next); void persist({ notificationConfig: next }); }} />}
            />
            <SettingsRow
              icon="✉"
              title="Email"
              description="Send email summaries."
              trailing={<Toggle checked={pendingNotificationConfig.email === true} onChange={(checked) => { const next = { ...pendingNotificationConfig, email: checked }; setPendingNotificationConfig(next); void persist({ notificationConfig: next }); }} />}
            />
            <SettingsRow
              icon="▣"
              title="Slack"
              description="Notify a Slack channel."
              isLast
              trailing={<Toggle checked={pendingNotificationConfig.slack === true} onChange={(checked) => { const next = { ...pendingNotificationConfig, slack: checked }; setPendingNotificationConfig(next); void persist({ notificationConfig: next }); }} />}
            />
          </SettingsCard>
        </div>
      )}

      {section === "tools" && (
        <div style={{ display: "grid", gap: 18 }}>
          <SectionHeading>Connections</SectionHeading>
          <div style={{ display: "grid", gap: 6 }}>
            {(toolkits.length > 0 ? toolkits : POPULAR_PROVIDERS).map((provider) => {
              const logo = "logo" in provider ? provider.logo : null;
              const fallback = POPULAR_PROVIDERS.find((p) => p.id === provider.id);
              const conn = connections.find((c) => c.provider === provider.id);
              const isConnected = ("isConnected" in provider && provider.isConnected) || conn?.status === "active";
              const accountId = "connectedAccountId" in provider ? (provider.connectedAccountId as string | null) : null;
              return (
                <SettingsCard key={provider.id}>
                  <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                      {logo ? (
                        <img src={logo} alt="" style={{ width: 24, height: 24, borderRadius: 4, flexShrink: 0, objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: 20, flexShrink: 0 }}>{fallback?.icon ?? "🔌"}</span>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>{provider.name}</div>
                        {"description" in provider && provider.description ? (
                          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary, marginTop: 2 }}>{provider.description as string}</div>
                        ) : null}
                      </div>
                    </div>
                    {isConnected ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                        <Badge color="green">Connected</Badge>
                        <button
                          className="btn"
                          onClick={() => onConnect?.(provider.id)}
                          onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.textDim; }}
                          onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; }}
                          style={{ fontFamily: TYPE.body, padding: "4px 10px", borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.textSecondary, fontSize: TYPE.scale.xs, cursor: "pointer", transition: `all ${MOTION.duration} ${MOTION.ease}` }}
                        >
                          Reconnect
                        </button>
                        {accountId && (
                          <button
                            className="btn"
                            onClick={() => onDisconnect?.(provider.id, accountId)}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.red; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = COLORS.border; }}
                            style={{ fontFamily: TYPE.body, padding: "4px 10px", borderRadius: RADIUS.pill, border: `1px solid ${COLORS.border}`, background: "transparent", color: COLORS.red, fontSize: TYPE.scale.xs, cursor: "pointer", transition: `all ${MOTION.duration} ${MOTION.ease}` }}
                          >
                            Disconnect
                          </button>
                        )}
                      </div>
                    ) : (
                      <button
                        className="btn"
                        onClick={() => onConnect?.(provider.id)}
                        disabled={!onConnect}
                        onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.accentDim; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
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
    toolkits = [],
    timelineEvents = [],
    approvals = [],
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
  const isDraft = isDraftProp ?? (agent.status?.toLowerCase() === "draft");
  const [tab, setTab] = useState<"timeline" | "objective" | "tools" | "chat" | "memory">("timeline");
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TimelineItem | null>(null);

  useEffect(() => {
    setSelectedItem(null);
  }, [agent.id]);

  const timelineItems = useMemo(
    () =>
      toTimelineItems({
        timelineEvents,
        approvals,
        runs,
        pendingActions,
      }),
    [timelineEvents, approvals, runs, pendingActions],
  );

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
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 18, flexWrap: "wrap", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 16, minWidth: 0 }}>
            <button
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
                <Badge color="accent">{project.icon ?? "◌"} {project.name}</Badge>
                <Badge color={isDraft ? "orange" : agent.status === "running" ? "green" : "gray"}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {agent.status === "running" && (
                      <span className="aw-running-dot" style={{ width: 6, height: 6, borderRadius: RADIUS.pill, background: COLORS.green, display: "inline-block" }} />
                    )}
                    {humanize(agent.status ?? (isDraft ? "draft" : "idle"))}
                  </span>
                </Badge>
              </div>
              <h1 style={{ margin: 0, fontSize: TYPE.scale.xl, fontFamily: TYPE.display, fontWeight: TYPE.weight.bold, letterSpacing: TYPE.tracking.tight, color: COLORS.text, lineHeight: TYPE.leading.tight }}>
                {agent.name}
              </h1>
              <p style={{ margin: "8px 0 0", color: COLORS.textSecondary, maxWidth: 780, lineHeight: TYPE.leading.normal, fontSize: TYPE.scale.base, fontFamily: TYPE.body }}>
                {agent.description || agent.instructions || "No description yet."}
              </p>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {onRunNow ? (
              <Button onClick={onRunNow}>
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
                    aria-label="Close menu"
                    onClick={() => setMoreOpen(false)}
                    style={{ position: "fixed", inset: 0, border: "none", background: "transparent" }}
                  />
                  <div style={{ position: "absolute", right: 0, marginTop: 8, minWidth: 180, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 6, zIndex: 20 }}>
                    {onDeleteAgent ? (
                      <button
                        className="btn"
                        onClick={() => {
                          setMoreOpen(false);
                          onDeleteAgent();
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.redDim; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
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

        <div style={{ display: "flex", gap: 24, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 22 }}>
          {(["timeline", "objective", "tools", "chat", "memory"] as const).map((item) => (
            <button
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
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, paddingBottom: 12, color: COLORS.textDim, fontSize: TYPE.scale.xs }}>
            <span>{activeConnections.length} connected</span>
            <span>•</span>
            <span>{mergedRequiredProviders.length} required</span>
          </div>
        </div>

        {tab === "timeline" && (
          <div className="aw-panel-enter" style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0 }}>
            {runError && (
              <div style={{
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
              }}>
                <WarningCircle size={16} weight="bold" />
                {runError}
              </div>
            )}
            {activeRun && (
              <LiveRunView
                triggerRunId={activeRun.triggerRunId}
                accessToken={activeRun.accessToken}
                runId={activeRun.runId}
                onComplete={onLiveRunComplete}
                onApprove={onApprove ? (id, reason) => { void onApprove(id); } : undefined}
                onReject={onReject ? (id, reason) => { void onReject(id); } : undefined}
              />
            )}
            <TimelinePanel
              items={timelineItems}
              selected={selectedItem}
              onSelect={setSelectedItem}
              onApprove={(approvalId) => {
                void onApprove?.(approvalId);
              }}
              onReject={(approvalId) => {
                void onReject?.(approvalId);
              }}
              onRunNow={onRunNow ? () => void onRunNow() : undefined}
            />
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
              onRunNow={onRunNow ? () => void onRunNow() : undefined}
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
              toolkits={toolkits}
              isDraft={isDraft}
              onRunNow={onRunNow ? () => void onRunNow() : undefined}
              section="tools"
            />
          </div>
        )}

        {tab === "chat" && (
          <div className="aw-panel-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <ChatCircle size={40} weight="light" style={{ color: COLORS.textDim, marginBottom: 16 }} />
            <div style={{ fontSize: TYPE.scale.md, fontWeight: TYPE.weight.semibold, color: COLORS.text, fontFamily: TYPE.display, marginBottom: 8 }}>
              Talk to {agent.name}
            </div>
            <div style={{ fontSize: TYPE.scale.base, color: COLORS.textSecondary, maxWidth: 400, lineHeight: TYPE.leading.normal }}>
              Ask questions about what the agent has found, request deeper analysis, or give it new instructions.
            </div>
          </div>
        )}

        {tab === "memory" && (
          <div className="aw-panel-enter" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
            <BookOpen size={40} weight="light" style={{ color: COLORS.textDim, marginBottom: 16 }} />
            <div style={{ fontSize: TYPE.scale.md, fontWeight: TYPE.weight.semibold, color: COLORS.text, fontFamily: TYPE.display, marginBottom: 8 }}>
              {agent.name} hasn't learned anything yet
            </div>
            <div style={{ fontSize: TYPE.scale.base, color: COLORS.textSecondary, maxWidth: 400, lineHeight: TYPE.leading.normal }}>
              As the agent runs, it will build up lessons and observations here. These shape how it approaches future tasks.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
