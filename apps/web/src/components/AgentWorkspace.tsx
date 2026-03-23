import { useState, useEffect, useRef, useMemo } from "react";
import { COLORS, RADIUS } from "~/lib/colors";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { SettingsCard, SettingsRow, SectionHeading } from "~/components/SettingsComponents";
import { Card } from "~/components/Card";
import {
  ArrowLeft,
  ChatCircle,
  Check,
  X,
  WarningCircle,
  CheckCircle,
  Info,
  CaretRight,
  Sparkle,
  CircleNotch,
  PaperPlaneTilt,
  ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { sendChat, getChatHistory } from "~/server/chat";
import type { AgentView, ProjectView } from "~/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentWorkspaceProps {
  agent: AgentView;
  project: ProjectView;
  onBack: () => void;
  onDeleteAgent?: () => void;
  runs?: SerializedRun[];
  pendingActions?: SerializedPendingAction[];
  onApprove?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
}

// ---------------------------------------------------------------------------
// Feed data types (mirrored from InsightFeed for locality)
// ---------------------------------------------------------------------------

interface SerializedRun {
  id: string;
  agentId: string;
  triggerType: string;
  startedAt: string;
  completedAt?: string;
  result?: {
    runId: string;
    agentId: string;
    duration: number;
    steps: Array<{
      step: string;
      duration: number;
      data: unknown;
      llmUsage?: { inputTokens: number; outputTokens: number; cost: number };
    }>;
    proposals: Array<{
      id: string;
      action: string;
      toolCategory: string;
      args: Record<string, unknown>;
      reason: string;
      confidence: number;
      skillSource: string;
      reversible: boolean;
      idempotencyKey: string;
    }>;
    eventsLogged: number;
  };
}

interface SerializedPendingAction {
  id: string;
  runId: string;
  agentId: string;
  proposal: {
    id: string;
    action: string;
    toolCategory: string;
    args: Record<string, unknown>;
    reason: string;
    confidence: number;
    skillSource: string;
    reversible: boolean;
    idempotencyKey: string;
  };
  status: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedReason?: string;
}

interface Insight {
  id: string;
  tier: "input" | "auto" | "fyi";
  title: string;
  summary: string;
  recommendation?: string;
  reasoning?: string[];
  policy: string;
  time: string;
  actionId?: string;
}

// ---------------------------------------------------------------------------
// Chat message type
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function humanizeAction(action: string): string {
  return action.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

function transformToInsights(
  runs: SerializedRun[],
  pendingActions: SerializedPendingAction[],
): Insight[] {
  const insights: Insight[] = [];

  for (const action of pendingActions) {
    insights.push({
      id: `pending-${action.id}`,
      actionId: action.id,
      tier: "input",
      title: humanizeAction(action.proposal.action),
      summary: action.proposal.reason,
      recommendation: `${humanizeAction(action.proposal.action)} via ${action.proposal.toolCategory} (${Math.round(action.proposal.confidence * 100)}% confidence)`,
      policy: `Skill: ${action.proposal.skillSource}`,
      time: formatTimeAgo(action.createdAt),
    });
  }

  const pendingRunIds = new Set(pendingActions.map((a) => a.runId));

  for (const run of runs) {
    if (!run.result) continue;
    if (pendingRunIds.has(run.id)) continue;

    const proposals = run.result.proposals;

    if (proposals.length > 0) {
      insights.push({
        id: `run-${run.id}`,
        tier: "auto",
        title:
          proposals.length === 1
            ? humanizeAction(proposals[0].action)
            : `${proposals.length} actions executed`,
        summary:
          proposals.length === 1
            ? proposals[0].reason
            : `Executed: ${proposals.map((p) => humanizeAction(p.action)).join(", ")}`,
        reasoning: proposals.map(
          (p) =>
            `${humanizeAction(p.action)}: ${p.reason} (${Math.round(p.confidence * 100)}% confidence)`,
        ),
        policy: `Skill: ${proposals[0].skillSource}`,
        time: formatTimeAgo(run.startedAt),
      });
    } else {
      const stepNames = run.result.steps.map((s) => s.step).join(" → ");
      insights.push({
        id: `run-${run.id}`,
        tier: "fyi",
        title: `Run completed (${run.triggerType})`,
        summary: `Pipeline: ${stepNames}. No actions needed.`,
        policy: "",
        time: formatTimeAgo(run.startedAt),
      });
    }
  }

  return insights;
}

// ---------------------------------------------------------------------------
// Tier card config
// ---------------------------------------------------------------------------

const tierConfig = {
  input: {
    badgeColor: "yellow" as const,
    label: "NEEDS YOUR INPUT",
    Icon: WarningCircle,
    iconColor: COLORS.yellow,
    leftBorderColor: COLORS.yellow,
  },
  auto: {
    badgeColor: "green" as const,
    label: "AUTO-HANDLED",
    Icon: CheckCircle,
    iconColor: COLORS.green,
    leftBorderColor: COLORS.green,
  },
  fyi: {
    badgeColor: "gray" as const,
    label: "FYI",
    Icon: Info,
    iconColor: COLORS.textDim,
    leftBorderColor: "transparent",
  },
};

// ---------------------------------------------------------------------------
// InsightCard
// ---------------------------------------------------------------------------

function InsightCard({
  insight,
  onApprove,
  onReject,
}: {
  insight: Insight;
  onApprove?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
}) {
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const [resolved, setResolved] = useState<"approved" | "dismissed" | null>(null);
  const tier = tierConfig[insight.tier];

  const isFyi = insight.tier === "fyi";

  const cardStyle: React.CSSProperties = isFyi
    ? {
        background: "transparent",
        border: "none",
        borderBottom: `1px solid ${COLORS.border}`,
        borderRadius: 0,
        paddingLeft: 0,
        paddingRight: 0,
        opacity: resolved ? 0.5 : 1,
        transition: "opacity 0.15s ease",
      }
    : {
        borderLeft: `3px solid ${tier.leftBorderColor}`,
        opacity: resolved ? 0.5 : 1,
        transition: "opacity 0.15s ease",
      };

  return (
    <Card style={cardStyle}>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <Badge color={tier.badgeColor}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <tier.Icon size={13} weight="light" color={tier.iconColor} />
            {tier.label}
          </span>
        </Badge>
        <span style={{ fontSize: 12, color: COLORS.textDim }}>{insight.time}</span>
      </div>

      {/* Title */}
      <h3
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: COLORS.text,
          margin: "0 0 8px 0",
          fontFamily: '"Satoshi", sans-serif',
          lineHeight: 1.3,
        }}
      >
        {insight.title}
      </h3>

      {/* Summary */}
      <p
        style={{
          fontSize: 14,
          color: COLORS.textSecondary,
          lineHeight: 1.6,
          margin: 0,
          fontFamily: '"General Sans", sans-serif',
        }}
      >
        {insight.summary}
      </p>

      {/* Recommendation */}
      {insight.recommendation && (
        <div
          style={{
            marginTop: 16,
            paddingLeft: 16,
            borderLeft: `1px solid ${COLORS.border}`,
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: COLORS.textDim,
              fontWeight: 500,
              marginBottom: 4,
              fontFamily: '"Satoshi", sans-serif',
            }}
          >
            Recommendation
          </div>
          <div
            style={{
              fontSize: 14,
              color: COLORS.text,
              lineHeight: 1.5,
              fontFamily: '"General Sans", sans-serif',
            }}
          >
            {insight.recommendation}
          </div>
        </div>
      )}

      {/* Reasoning toggle */}
      {insight.reasoning && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setReasoningOpen((v) => !v)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: 0,
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: COLORS.textSecondary,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            <CaretRight
              size={13}
              weight="light"
              style={{
                transform: reasoningOpen ? "rotate(90deg)" : "rotate(0deg)",
                transition: "transform 0.15s ease",
              }}
            />
            Why I think this
          </button>
          {reasoningOpen && (
            <div style={{ marginTop: 8, paddingLeft: 4 }}>
              {insight.reasoning.map((r, i) => (
                <div
                  key={i}
                  style={{ display: "flex", gap: 8, marginBottom: 6 }}
                >
                  <span style={{ color: COLORS.textDim, fontSize: 13 }}>
                    {i === insight.reasoning!.length - 1 ? "└" : "├"}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      color: COLORS.textSecondary,
                      lineHeight: 1.5,
                      fontFamily: '"General Sans", sans-serif',
                    }}
                  >
                    {r}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer: policy + actions */}
      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px solid ${COLORS.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 12,
            color: COLORS.textDim,
            fontStyle: "italic",
            fontFamily: '"General Sans", sans-serif',
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {insight.policy}
        </span>

        <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
          {insight.tier === "input" && !resolved && (
            <>
              <Button
                size="sm"
                onClick={() => {
                  setResolved("approved");
                  if (insight.actionId && onApprove) onApprove(insight.actionId);
                }}
              >
                <Check size={13} weight="bold" />
                Approve
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setResolved("dismissed");
                  if (insight.actionId && onReject) onReject(insight.actionId);
                }}
              >
                Dismiss
              </Button>
            </>
          )}
          {resolved === "approved" && (
            <Badge color="green">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Check size={12} weight="bold" />
                Approved
              </span>
            </Badge>
          )}
          {resolved === "dismissed" && <Badge color="gray">Dismissed</Badge>}
          {insight.tier === "auto" && !resolved && (
            <Button size="sm" variant="ghost">
              <ArrowCounterClockwise size={13} weight="light" />
              Undo
            </Button>
          )}
          {insight.tier === "fyi" && (
            <Button size="sm" variant="ghost">
              View full report
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// ActivityFeed
// ---------------------------------------------------------------------------

function ActivityFeed({
  runs = [],
  pendingActions = [],
  onApprove,
  onReject,
}: {
  runs?: SerializedRun[];
  pendingActions?: SerializedPendingAction[];
  onApprove?: (actionId: string) => void;
  onReject?: (actionId: string) => void;
}) {
  const insights = useMemo(() => {
    const hasData = runs.length > 0 || pendingActions.length > 0;
    if (!hasData) return [];
    return transformToInsights(runs, pendingActions);
  }, [runs, pendingActions]);

  if (insights.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          padding: "64px 0",
          color: COLORS.textDim,
        }}
      >
        <span style={{ fontSize: 24, opacity: 0.4 }}>✦</span>
        <span style={{ fontSize: 14, fontFamily: '"General Sans", sans-serif' }}>
          No activity yet. Turn on the schedule to start your agent's first run.
        </span>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {insights.map((insight) => (
        <InsightCard
          key={insight.id}
          insight={insight}
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatDrawer
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  "Explain last run",
  "What should I review?",
  "Run analysis now",
];

function ChatDrawer({
  agentId,
  projectId,
  agentName,
  onClose,
}: {
  agentId: string;
  projectId: string;
  agentName: string;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    getChatHistory({ data: { agentId, projectId, limit: 50 } })
      .then((history) => {
        setMessages(
          (
            history as Array<{
              id: string;
              role: string;
              content: string;
              createdAt: string | number;
            }>
          ).map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            createdAt: new Date(m.createdAt),
          })),
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentId, projectId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, sending]);

  // Focus input after open animation
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, []);

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const result = await sendChat({
        data: { agentId, projectId, message: content },
      });
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: (result as { response: string }).response,
          createdAt: new Date(),
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Something went wrong. Please try again.",
          createdAt: new Date(),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.45)",
          zIndex: 40,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 400,
          background: COLORS.surface,
          borderLeft: `1px solid ${COLORS.border}`,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          animation: "slideInRight 0.2s ease",
        }}
      >
        {/* Drawer header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            borderBottom: `1px solid ${COLORS.border}`,
            flexShrink: 0,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: COLORS.text,
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              Chat with {agentName}
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.textDim,
                marginTop: 2,
                fontFamily: '"General Sans", sans-serif',
              }}
            >
              Ask anything about your campaigns
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: COLORS.textSecondary,
              padding: 6,
              borderRadius: RADIUS.button,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = COLORS.surfaceHover;
              e.currentTarget.style.color = COLORS.text;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = COLORS.textSecondary;
            }}
          >
            <X size={18} weight="light" />
          </button>
        </div>

        {/* Quick actions */}
        {messages.length === 0 && !loading && (
          <div
            style={{
              padding: "12px 20px",
              borderBottom: `1px solid ${COLORS.border}`,
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              flexShrink: 0,
            }}
          >
            {QUICK_ACTIONS.map((qa) => (
              <button
                key={qa}
                onClick={() => handleSend(qa)}
                style={{
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.pill,
                  padding: "6px 14px",
                  fontSize: 12,
                  color: COLORS.textSecondary,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderLight;
                  e.currentTarget.style.color = COLORS.text;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.textSecondary;
                }}
              >
                {qa}
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "16px 20px",
          }}
        >
          {loading ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                padding: 32,
                color: COLORS.textDim,
                fontSize: 13,
              }}
            >
              <CircleNotch
                size={15}
                weight="light"
                style={{ animation: "spin 1s linear infinite" }}
              />
              Loading conversation...
            </div>
          ) : messages.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
                color: COLORS.textDim,
                fontSize: 13,
                textAlign: "center",
                lineHeight: 1.5,
                fontFamily: '"General Sans", sans-serif',
              }}
            >
              Ask your agent anything — it has access to your workspace, run
              history, and policies.
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "82%",
                    padding: "10px 14px",
                    borderRadius: RADIUS.modal,
                    background:
                      msg.role === "user" ? COLORS.surfaceHover : COLORS.bg,
                    border: `1px solid ${COLORS.border}`,
                    color: COLORS.text,
                    fontSize: 14,
                    lineHeight: 1.6,
                    fontFamily: '"General Sans", sans-serif',
                  }}
                >
                  {msg.role === "assistant" && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        marginBottom: 6,
                      }}
                    >
                      <Sparkle size={12} weight="light" color={COLORS.textDim} />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: COLORS.textSecondary,
                          fontFamily: '"Satoshi", sans-serif',
                        }}
                      >
                        Agent
                      </span>
                    </div>
                  )}
                  <div style={{ whiteSpace: "pre-wrap" }}>{msg.content}</div>
                </div>
              </div>
            ))
          )}

          {sending && (
            <div style={{ display: "flex", justifyContent: "flex-start" }}>
              <div
                style={{
                  padding: "10px 14px",
                  borderRadius: RADIUS.modal,
                  background: COLORS.bg,
                  border: `1px solid ${COLORS.border}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: COLORS.textDim,
                  fontSize: 13,
                }}
              >
                <CircleNotch
                  size={13}
                  weight="light"
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Thinking...
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div
          style={{
            padding: "12px 20px 20px",
            borderTop: `1px solid ${COLORS.border}`,
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 8,
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.modal,
              padding: "10px 12px",
              alignItems: "flex-end",
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Ask your agent anything..."
              rows={1}
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                color: COLORS.text,
                fontSize: 14,
                resize: "none",
                outline: "none",
                fontFamily: "inherit",
                lineHeight: 1.5,
              }}
            />
            <button
              onClick={() => handleSend()}
              disabled={sending || !input.trim()}
              style={{
                background: input.trim() ? COLORS.accent : COLORS.surfaceHover,
                border: "none",
                borderRadius: RADIUS.button,
                padding: "6px 10px",
                cursor: input.trim() && !sending ? "pointer" : "default",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "all 0.15s ease",
                flexShrink: 0,
                opacity: sending ? 0.5 : 1,
              }}
            >
              <PaperPlaneTilt
                size={16}
                weight="light"
                color={input.trim() ? COLORS.white : COLORS.textDim}
              />
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// OverviewPanel
// ---------------------------------------------------------------------------

function OverviewPanel({
  agent,
  onDeleteAgent,
}: {
  agent: AgentView;
  onDeleteAgent?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const scheduleLabels: Record<string, string> = {
    hourly: "Every hour",
    "6hours": "Every 6 hours",
    daily: "Daily at 9am",
    weekly: "Weekly on Monday",
    manual: "Manual only",
  };

  return (
    <div>
      {/* Identity */}
      <SectionHeading>Identity</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="✦"
          title="Instructions"
          defaultExpanded={true}
        >
          <p style={{
            color: COLORS.textSecondary,
            fontSize: 13,
            margin: 0,
            lineHeight: 1.7,
            whiteSpace: "pre-wrap",
          }}>
            {agent.description || agent.intent || "No instructions set."}
          </p>
        </SettingsRow>
        <SettingsRow
          icon="◷"
          title="Schedule"
          description="How often the agent runs"
          value={scheduleLabels[agent.schedule] ?? agent.schedule}
        />
      </SettingsCard>

      {/* Skills */}
      {agent.skills.length > 0 && (
        <>
          <SectionHeading>Skills</SectionHeading>
          <SettingsCard>
            {agent.skills.map((skill, i) => (
              <SettingsRow
                key={skill}
                icon="◈"
                title={skill
                  .split(/[-_]/)
                  .map((w) => w[0].toUpperCase() + w.slice(1))
                  .join(" ")}
                description={skill}
                value={<Badge color="green">Active</Badge>}
                isLast={i === agent.skills.length - 1}
              />
            ))}
          </SettingsCard>
        </>
      )}

      {/* Policy */}
      <SectionHeading>Policy</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="⊘"
          title="Global approval"
          description="Require approval for all actions"
          value={agent.globalApprovalRequired ? "On" : "Off"}
        />
        {agent.policyRules.length > 0 ? (
          agent.policyRules.map((rule, i) => (
            <SettingsRow
              key={i}
              icon="◉"
              title={rule}
              description="Policy rule"
            />
          ))
        ) : (
          <SettingsRow
            icon="◉"
            title="No custom rules"
            description="Using platform defaults"
          />
        )}
      </SettingsCard>

      {/* Danger zone */}
      {onDeleteAgent && (
        <>
          <SectionHeading>Danger zone</SectionHeading>
          <SettingsCard>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span
                  style={{
                    fontSize: 16,
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: COLORS.bg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: COLORS.red,
                    opacity: 0.7,
                  }}
                >
                  ⚠
                </span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>
                    Delete this agent
                  </div>
                  <div style={{ fontSize: 13, color: COLORS.textDim, marginTop: 2 }}>
                    Permanently remove this agent and all its data
                  </div>
                </div>
              </div>

              {confirmDelete ? (
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={() => setConfirmDelete(false)}
                    style={{
                      background: "none",
                      border: "none",
                      color: COLORS.textSecondary,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: "6px 12px",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onDeleteAgent}
                    style={{
                      background: COLORS.redDim,
                      border: `1px solid ${COLORS.red}`,
                      color: COLORS.red,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      padding: "6px 12px",
                      borderRadius: RADIUS.button,
                    }}
                  >
                    Confirm delete
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{
                    background: "none",
                    border: "none",
                    color: COLORS.textDim,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "6px 12px",
                    transition: "color 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
                >
                  Delete
                </button>
              )}
            </div>
          </SettingsCard>
        </>
      )}
    </div>
  );
}


// ---------------------------------------------------------------------------
// AgentWorkspace — main export
// ---------------------------------------------------------------------------

export function AgentWorkspace({
  agent,
  project,
  onBack,
  onDeleteAgent,
  runs = [],
  pendingActions = [],
  onApprove,
  onReject,
}: AgentWorkspaceProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "activity">("overview");

  return (
    <div style={{ position: "relative" }}>
      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 0,
        }}
      >
        {/* Back */}
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: COLORS.textSecondary,
            padding: 6,
            borderRadius: RADIUS.button,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = COLORS.surfaceHover;
            e.currentTarget.style.color = COLORS.text;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = COLORS.textSecondary;
          }}
        >
          <ArrowLeft size={18} weight="light" />
        </button>

        {/* Agent name */}
        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: COLORS.text,
            margin: 0,
            fontFamily: '"Satoshi", sans-serif',
            lineHeight: 1.2,
            flex: 1,
            minWidth: 0,
          }}
        >
          {agent.name}
        </h1>

        {/* Chat icon */}
        <IconButton
          active={chatOpen}
          onClick={() => setChatOpen(true)}
          label="Chat"
        >
          <ChatCircle size={18} weight="light" />
        </IconButton>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Tab bar                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${COLORS.border}`, marginBottom: 24, marginTop: 16 }}>
        {(["overview", "activity"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "none",
              border: "none",
              borderBottom: `2px solid ${activeTab === tab ? COLORS.accent : "transparent"}`,
              color: activeTab === tab ? COLORS.text : COLORS.textSecondary,
              fontSize: 14,
              fontWeight: activeTab === tab ? 600 : 400,
              padding: "10px 16px",
              cursor: "pointer",
              fontFamily: '"Satoshi", sans-serif',
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { if (activeTab !== tab) e.currentTarget.style.color = COLORS.text; }}
            onMouseLeave={(e) => { if (activeTab !== tab) e.currentTarget.style.color = COLORS.textSecondary; }}
          >
            {tab === "overview" ? "Overview" : "Activity"}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Main content — overview or activity                                  */}
      {/* ------------------------------------------------------------------ */}
      {activeTab === "overview" ? (
        <OverviewPanel
          agent={agent}
          onDeleteAgent={onDeleteAgent}
        />
      ) : (
        <ActivityFeed
          runs={runs}
          pendingActions={pendingActions}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Chat drawer                                                          */}
      {/* ------------------------------------------------------------------ */}
      {chatOpen && (
        <ChatDrawer
          agentId={agent.id}
          projectId={project.id}
          agentName={agent.name}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// IconButton — small ghost icon button with active state
// ---------------------------------------------------------------------------

function IconButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={{
        background: active ? COLORS.accentDim : "transparent",
        border: active ? `1px solid ${COLORS.accentLight}` : `1px solid transparent`,
        cursor: "pointer",
        color: active ? COLORS.accentLight : COLORS.textSecondary,
        padding: 7,
        borderRadius: RADIUS.button,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = COLORS.surfaceHover;
          e.currentTarget.style.color = COLORS.text;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = COLORS.textSecondary;
        }
      }}
    >
      {children}
    </button>
  );
}
