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
  DotsThree,
} from "@phosphor-icons/react";
import { sendChat, getChatHistory } from "~/server/chat";
import type { AgentView, ProjectView } from "~/lib/types";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface AgentWorkspaceProps {
  agent: AgentView;
  project: ProjectView;
  availableSkills?: Array<{ id: string; name: string; description: string }>;
  projectConnections?: Array<{ id: string; provider: string; status: string }>;
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

const QUICK_ACTIONS_CHAT = [
  "Explain last run",
  "What should I review?",
  "Run analysis now",
];

const QUICK_ACTIONS_BLUEPRINT = [
  "Monitor Google Ads for budget waste",
  "Research articles and publish to blog",
  "Track competitor pricing changes",
];

function ChatDrawer({
  agentId,
  projectId,
  agentName,
  mode = "chat",
  availableSkills = [],
  onBlueprintComplete,
  onClose,
}: {
  agentId: string;
  projectId: string;
  agentName: string;
  mode?: "chat" | "blueprint";
  availableSkills?: Array<{ id: string; name: string; description: string }>;
  onBlueprintComplete?: (data?: { name: string; description: string; skills?: string[]; schedule?: string; connections?: Array<{ provider: string; reason: string }> }) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reasoningText, setReasoningText] = useState("");
  const [toolStatus, setToolStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (mode === "blueprint") {
      setLoading(false);
      return;
    }
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
  }, [agentId, projectId, mode]);

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

  const handleBlueprintSend = async (text: string) => {
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: text,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setReasoningText("");
    setToolStatus("");

    try {
      const res = await fetch("/api/blueprint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          intent: text,
          availableSkills: availableSkills.map((s) => ({
            id: s.id, name: s.name, description: s.description,
          })),
        }),
      });

      if (!res.ok || !res.body) throw new Error("Blueprint generation failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastBlueprint: Record<string, unknown> | null = null;
      let textAccumulator = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed._type === "reasoning") {
              setReasoningText((prev) => prev + (parsed.text ?? ""));
            } else if (parsed._type === "tool-status") {
              setToolStatus(parsed.text as string);
            } else if (parsed._type === "text") {
              textAccumulator += parsed.text ?? "";
            } else if (parsed._type === "blueprint") {
              const { _type, ...bp } = parsed;
              lastBlueprint = bp;
            }
          } catch { /* skip unparseable */ }
        }
      }

      if (lastBlueprint) {
        const { updateAgentConfig } = await import("~/server/agents");
        await updateAgentConfig({
          data: {
            agentId,
            projectId,
            name: (lastBlueprint.agentName as string) || "Untitled Agent",
            description: (lastBlueprint.summary as string) || "",
            skills: (lastBlueprint.skills as string[]) || [],
            schedule: (lastBlueprint.trigger as { schedule?: string })?.schedule || "manual",
            connections: (lastBlueprint.connections as Array<{ provider: string; reason: string }>) || [],
          },
        });

        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: `I've set up **${lastBlueprint!.agentName}**. The overview shows your agent's configuration — adjust anything you'd like.`,
            createdAt: new Date(),
          },
        ]);

        onBlueprintComplete?.({
          name: (lastBlueprint!.agentName as string) || "Untitled Agent",
          description: (lastBlueprint!.summary as string) || "",
          skills: (lastBlueprint!.skills as string[]) || [],
          schedule: (lastBlueprint!.trigger as { schedule?: string })?.schedule || "manual",
          connections: (lastBlueprint!.connections as Array<{ provider: string; reason: string }>) || [],
        });
      } else if (textAccumulator.trim()) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant" as const,
            content: textAccumulator.trim(),
            createdAt: new Date(),
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant" as const,
          content: "Something went wrong generating the blueprint. Please try again.",
          createdAt: new Date(),
        },
      ]);
    } finally {
      setSending(false);
      setReasoningText("");
      setToolStatus("");
    }
  };

  const handleSend = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || sending) return;

    if (mode === "blueprint") {
      return handleBlueprintSend(content);
    }

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
              {mode === "blueprint" ? "Set up your agent" : `Chat with ${agentName}`}
            </div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.textDim,
                marginTop: 2,
                fontFamily: '"General Sans", sans-serif',
              }}
            >
              {mode === "blueprint" ? "Describe what you want — I'll configure it" : "Ask anything about your campaigns"}
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
            {(mode === "blueprint" ? QUICK_ACTIONS_BLUEPRINT : QUICK_ACTIONS_CHAT).map((qa) => (
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
          className="aw-scroll"
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

          {sending && mode === "blueprint" && reasoningText && (
            <div style={{
              padding: "4px 14px",
              fontSize: 12,
              fontStyle: "italic",
              color: COLORS.textDim,
              lineHeight: 1.5,
              maxHeight: 48,
              overflow: "hidden",
              maskImage: "linear-gradient(to bottom, black 60%, transparent)",
              WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent)",
              opacity: 0.7,
            }}>
              {reasoningText.trim().split("\n").slice(-2).join(" ")}
            </div>
          )}

          {sending && mode === "blueprint" && toolStatus && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "4px 14px",
              fontSize: 12,
              color: COLORS.textDim,
            }}>
              <span style={{ color: COLORS.accent, fontSize: 12 }}>&#10022;</span>
              {toolStatus}
            </div>
          )}

          {sending && !(mode === "blueprint" && (reasoningText || toolStatus)) && (
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
              placeholder={mode === "blueprint" ? "What should this agent do?" : "Ask your agent anything..."}
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

        .aw-scroll::-webkit-scrollbar { width: 6px; }
        .aw-scroll::-webkit-scrollbar-track { background: transparent; }
        .aw-scroll::-webkit-scrollbar-thumb { background: #2A2630; border-radius: 3px; }
        .aw-scroll::-webkit-scrollbar-thumb:hover { background: #352F3D; }
        .aw-scroll { scrollbar-width: thin; scrollbar-color: #2A2630 transparent; }

      `}</style>
    </>
  );
}

// ---------------------------------------------------------------------------
// OverviewPanel
// ---------------------------------------------------------------------------

const PROVIDER_NAMES: Record<string, string> = {
  googleads: "Google Ads",
  slack: "Slack",
  meta: "Meta Ads",
  ga4: "Google Analytics",
  shopify: "Shopify",
  stripe: "Stripe",
  github: "GitHub",
};

function OverviewPanel({
  agent,
  projectId,
  availableSkills = [],
  projectConnections = [],
  onUpdateConfig,
}: {
  agent: AgentView;
  projectId: string;
  availableSkills?: Array<{ id: string; name: string; description: string; consumes?: string[] }>;
  projectConnections?: Array<{ id: string; provider: string; status: string }>;
  onUpdateConfig?: (updates: Record<string, unknown>) => void;
}) {
  const [instructions, setInstructions] = useState(agent.description || agent.intent || "");
  const [notifyOnComplete, setNotifyOnComplete] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSkills, setActiveSkills] = useState<Set<string>>(new Set(agent.skills));
  const [skillApprovals, setSkillApprovals] = useState<Record<string, boolean>>({});
  const [approvalMode, setApprovalMode] = useState<"per-skill" | "all" | "never">(
    agent.globalApprovalRequired ? "all" : "per-skill"
  );
  const [approvalConditions, setApprovalConditions] = useState<string[]>([]);
  const [channelInApp, setChannelInApp] = useState(true);
  const [rules, setRules] = useState<string[]>(agent.policyRules);

  const scheduleLabels: Record<string, string> = {
    hourly: "Every hour",
    "6hours": "Every 6 hours",
    daily: "Daily at 9am",
    weekly: "Weekly on Monday",
    manual: "Manual only",
  };

  const [currentSchedule, setCurrentSchedule] = useState(agent.schedule);

  useEffect(() => {
    setInstructions(agent.description || agent.intent || "");
  }, [agent.description, agent.intent]);

  useEffect(() => {
    setCurrentSchedule(agent.schedule);
  }, [agent.schedule]);

  useEffect(() => {
    setActiveSkills(new Set(agent.skills));
  }, [agent.skills]);

  useEffect(() => {
    setRules(agent.policyRules);
  }, [agent.policyRules]);

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
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            onBlur={async () => {
              if (instructions !== (agent.description || agent.intent || "") && onUpdateConfig) {
                setSaving(true);
                await onUpdateConfig({ description: instructions });
                setSaving(false);
              }
            }}
            placeholder="Describe what this agent should do..."
            rows={6}
            style={{
              width: "100%",
              background: COLORS.bg,
              border: `1px solid ${COLORS.border}`,
              borderRadius: 6,
              color: COLORS.text,
              fontSize: 13,
              lineHeight: 1.7,
              padding: "10px 12px",
              outline: "none",
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
          {saving && <span style={{ fontSize: 11, color: COLORS.textDim, marginTop: 4 }}>Saving...</span>}
        </SettingsRow>
        <SettingsRow icon="◷" title="Schedule" value={scheduleLabels[currentSchedule] ?? currentSchedule}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(scheduleLabels).map(([value, label]) => (
              <button
                key={value}
                onClick={async () => {
                  setCurrentSchedule(value);
                  onUpdateConfig?.({ schedule: value });
                }}
                style={{
                  padding: "6px 14px",
                  borderRadius: 99,
                  border: `1px solid ${currentSchedule === value ? COLORS.accent : COLORS.border}`,
                  background: currentSchedule === value ? COLORS.accentDim : "transparent",
                  color: currentSchedule === value ? COLORS.accentLight : COLORS.textSecondary,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  transition: "all 0.15s ease",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsCard>

      {/* Skills */}
      {(availableSkills.length > 0 || agent.skills.length > 0) && (
        <>
          <SectionHeading>Skills</SectionHeading>
          <SettingsCard>
            {availableSkills.map((skill, i) => {
              const isActive = activeSkills.has(skill.id);
              const needsApproval = skillApprovals[skill.id] ?? false;
              return (
                <SettingsRow
                  key={skill.id}
                  icon="◈"
                  title={skill.name}
                  description={skill.description}
                  isLast={i === availableSkills.length - 1}
                  trailing={
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const next = new Set(activeSkills);
                        if (isActive) next.delete(skill.id);
                        else next.add(skill.id);
                        setActiveSkills(next);
                        onUpdateConfig?.({ skills: [...next] });
                      }}
                      style={{
                        width: 36,
                        height: 20,
                        borderRadius: 10,
                        border: "none",
                        background: isActive ? COLORS.accent : COLORS.border,
                        cursor: "pointer",
                        position: "relative",
                        transition: "background 0.15s ease",
                        flexShrink: 0,
                      }}
                    >
                      <span style={{
                        position: "absolute",
                        top: 2,
                        left: isActive ? 18 : 2,
                        width: 16,
                        height: 16,
                        borderRadius: 8,
                        background: COLORS.white,
                        transition: "left 0.15s ease",
                      }} />
                    </button>
                  }
                >
                  {isActive && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Require approval</span>
                      <button
                        onClick={() => {
                          setSkillApprovals((prev) => ({ ...prev, [skill.id]: !needsApproval }));
                        }}
                        style={{
                          width: 36,
                          height: 20,
                          borderRadius: 10,
                          border: "none",
                          background: needsApproval ? COLORS.accent : COLORS.border,
                          cursor: "pointer",
                          position: "relative",
                          transition: "background 0.15s ease",
                          flexShrink: 0,
                        }}
                      >
                        <span style={{
                          position: "absolute",
                          top: 2,
                          left: needsApproval ? 18 : 2,
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          background: COLORS.white,
                          transition: "left 0.15s ease",
                        }} />
                      </button>
                    </div>
                  )}
                </SettingsRow>
              );
            })}
          </SettingsCard>
        </>
      )}

      {/* Policy */}
      <SectionHeading>Policy</SectionHeading>
      <SettingsCard>
        {rules.map((rule, i) => (
          <SettingsRow
            key={i}
            icon="◉"
            title={rule}
            description="Policy rule"
            trailing={
              <button
                onClick={() => {
                  const next = rules.filter((_, j) => j !== i);
                  setRules(next);
                  onUpdateConfig?.({ policyRules: next });
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.textDim,
                  cursor: "pointer",
                  padding: 4,
                  fontSize: 14,
                  lineHeight: 1,
                  transition: "color 0.15s ease",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
              >
                ×
              </button>
            }
          />
        ))}
        <div style={{ padding: "8px 16px 12px 62px" }}>
          <input
            placeholder="Add policy rule..."
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                const value = (e.target as HTMLInputElement).value.trim();
                const next = [...rules, value];
                setRules(next);
                onUpdateConfig?.({ policyRules: next });
                (e.target as HTMLInputElement).value = "";
              }
            }}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              borderBottom: `1px solid ${COLORS.border}`,
              color: COLORS.text,
              fontSize: 13,
              padding: "6px 0",
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
      </SettingsCard>

      {/* Connections */}
      <SectionHeading>Connections</SectionHeading>
      <SettingsCard>
        {(agent.connections?.length ?? 0) > 0 ? (
          agent.connections.map((conn, i) => {
            const isConnected = projectConnections.some(
              (pc) => pc.provider === conn.provider && pc.status === "active"
            );
            return (
              <SettingsRow
                key={conn.provider}
                icon={isConnected ? "○" : "\u26A0"}
                title={PROVIDER_NAMES[conn.provider] ?? conn.provider}
                description={conn.reason}
                isLast={i === agent.connections.length - 1}
                trailing={
                  isConnected ? (
                    <span style={{
                      fontSize: 11,
                      fontWeight: 500,
                      color: COLORS.green,
                      padding: "3px 10px",
                      borderRadius: 99,
                      background: COLORS.greenDim,
                    }}>
                      Connected
                    </span>
                  ) : (
                    <button
                      onClick={async () => {
                        try {
                          const { initiateConnection } = await import("~/server/connections");
                          const result = await initiateConnection({
                            data: {
                              projectId,
                              provider: conn.provider,
                              callbackUrl: window.location.href,
                            },
                          });
                          const redirectUrl = (result as { redirectUrl: string }).redirectUrl;
                          if (redirectUrl) {
                            window.open(redirectUrl, "_blank");
                          }
                        } catch (err) {
                          console.error("Failed to initiate connection:", err);
                        }
                      }}
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: COLORS.yellow,
                        padding: "3px 10px",
                        borderRadius: 99,
                        background: COLORS.yellowDim,
                        border: `1px solid ${COLORS.yellow}`,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        transition: "all 0.15s ease",
                      }}
                    >
                      Connect
                    </button>
                  )
                }
              />
            );
          })
        ) : (
          <SettingsRow
            icon="○"
            title="No connections needed"
            description="This agent works with its instructions alone"
            isLast={true}
          />
        )}
      </SettingsCard>

      {/* Notifications */}
      <SectionHeading>Notifications</SectionHeading>
      <SettingsCard>
        {/* Global approval override */}
        <SettingsRow
          icon="⊘"
          title="Require approval"
          description="When should actions need your approval"
          value={approvalMode === "all" ? "All actions" : approvalMode === "never" ? "Never" : "Per skill"}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(["per-skill", "all", "never"] as const).map((mode) => {
              const labels = {
                "per-skill": "Per skill — respect each skill's setting",
                "all": "All actions — always ask before acting",
                "never": "Never — auto-approve everything",
              };
              return (
                <button
                  key={mode}
                  onClick={() => {
                    setApprovalMode(mode);
                    onUpdateConfig?.({ globalApprovalRequired: mode === "all" });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 12px",
                    borderRadius: 6,
                    border: `1px solid ${approvalMode === mode ? COLORS.accent : COLORS.border}`,
                    background: approvalMode === mode ? COLORS.accentDim : "transparent",
                    color: approvalMode === mode ? COLORS.text : COLORS.textSecondary,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    transition: "all 0.15s ease",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <span style={{
                    width: 14,
                    height: 14,
                    borderRadius: 7,
                    border: `2px solid ${approvalMode === mode ? COLORS.accent : COLORS.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    {approvalMode === mode && (
                      <span style={{ width: 6, height: 6, borderRadius: 3, background: COLORS.accent }} />
                    )}
                  </span>
                  {labels[mode]}
                </button>
              );
            })}
          </div>
          {/* Custom conditions */}
          {approvalMode === "per-skill" && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, color: COLORS.textDim, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Additional conditions
              </div>
              {approvalConditions.map((condition, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: COLORS.textSecondary, flex: 1 }}>{condition}</span>
                  <button
                    onClick={() => setApprovalConditions((prev) => prev.filter((_, j) => j !== i))}
                    style={{
                      background: "none", border: "none", color: COLORS.textDim,
                      cursor: "pointer", padding: 2, fontSize: 14, lineHeight: 1,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
                  >×</button>
                </div>
              ))}
              <input
                placeholder="e.g. budget changes over $500..."
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.target as HTMLInputElement).value.trim()) {
                    const value = (e.target as HTMLInputElement).value.trim();
                    setApprovalConditions((prev) => [...prev, value]);
                    (e.target as HTMLInputElement).value = "";
                  }
                }}
                style={{
                  width: "100%",
                  background: "none",
                  border: "none",
                  borderBottom: `1px solid ${COLORS.border}`,
                  color: COLORS.text,
                  fontSize: 12,
                  padding: "6px 0",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>
          )}
        </SettingsRow>

        <SettingsRow
          icon="◎"
          title="Run complete"
          description="Notify when a run finishes"
          trailing={
            <button
              onClick={() => setNotifyOnComplete((v) => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, border: "none",
                background: notifyOnComplete ? COLORS.accent : COLORS.border,
                cursor: "pointer", position: "relative",
                transition: "background 0.15s ease", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: notifyOnComplete ? 18 : 2,
                width: 16, height: 16, borderRadius: 8,
                background: COLORS.white, transition: "left 0.15s ease",
              }} />
            </button>
          }
        />

        <SettingsRow
          icon="◎"
          title="Daily digest"
          description="Summary of agent activity"
          trailing={<span style={{ fontSize: 11, color: COLORS.textDim }}>Coming soon</span>}
          isLast={true}
        />
      </SettingsCard>

      {/* Channels */}
      <SectionHeading>Channels</SectionHeading>
      <SettingsCard>
        <SettingsRow
          icon="◎"
          title="In-app"
          description="Notifications in Nochore"
          trailing={
            <button
              onClick={() => setChannelInApp((v) => !v)}
              style={{
                width: 36, height: 20, borderRadius: 10, border: "none",
                background: channelInApp ? COLORS.accent : COLORS.border,
                cursor: "pointer", position: "relative",
                transition: "background 0.15s ease", flexShrink: 0,
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: channelInApp ? 18 : 2,
                width: 16, height: 16, borderRadius: 8,
                background: COLORS.white, transition: "left 0.15s ease",
              }} />
            </button>
          }
        />
        <SettingsRow
          icon="◎"
          title="Email"
          description="Email notifications"
          trailing={<span style={{ fontSize: 11, color: COLORS.textDim }}>Coming soon</span>}
        />
        <SettingsRow
          icon="◎"
          title="Slack"
          description="Slack notifications"
          trailing={<span style={{ fontSize: 11, color: COLORS.textDim }}>Coming soon</span>}
          isLast={true}
        />
      </SettingsCard>
    </div>
  );
}


// ---------------------------------------------------------------------------
// AgentWorkspace — main export
// ---------------------------------------------------------------------------

export function AgentWorkspace({
  agent,
  project,
  availableSkills = [],
  projectConnections = [],
  onBack,
  onDeleteAgent,
  runs = [],
  pendingActions = [],
  onApprove,
  onReject,
}: AgentWorkspaceProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"overview" | "activity">("overview");
  const [blueprintDone, setBlueprintDone] = useState(false);
  const [localOverrides, setLocalOverrides] = useState<Partial<AgentView> | null>(null);

  const isNewAgent = !agent.description && !agent.intent && !blueprintDone;
  const displayAgent = localOverrides ? { ...agent, ...localOverrides } : agent;

  useEffect(() => {
    if (isNewAgent) {
      setChatOpen(true);
    }
  }, [isNewAgent]);

  return (
    <div style={{ position: "relative" }}>
      <style>{`
        textarea::-webkit-scrollbar { width: 5px; }
        textarea::-webkit-scrollbar-track { background: transparent; }
        textarea::-webkit-scrollbar-thumb { background: #2A2630; border-radius: 3px; }
        textarea::-webkit-scrollbar-thumb:hover { background: #352F3D; }
        textarea { scrollbar-width: thin; scrollbar-color: #2A2630 transparent; }
      `}</style>
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
          {displayAgent.name}
        </h1>

        {/* More menu */}
        <div style={{ position: "relative" }}>
          <IconButton
            active={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            label="More"
          >
            <DotsThree size={18} weight="bold" />
          </IconButton>
          {menuOpen && (
            <>
              <div
                onClick={() => setMenuOpen(false)}
                style={{ position: "fixed", inset: 0, zIndex: 39 }}
              />
              <div style={{
                position: "absolute",
                top: "100%",
                right: 0,
                marginTop: 4,
                background: COLORS.surface,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                padding: "4px 0",
                minWidth: 180,
                zIndex: 40,
                boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
              }}>
                <button
                  onClick={() => {
                    if (confirm("Delete this agent and all its data?")) {
                      onDeleteAgent?.();
                    }
                    setMenuOpen(false);
                  }}
                  style={{
                    width: "100%",
                    padding: "8px 16px",
                    background: "none",
                    border: "none",
                    color: COLORS.red,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textAlign: "left",
                    transition: "background 0.1s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                >
                  Delete agent
                </button>
              </div>
            </>
          )}
        </div>

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
          agent={displayAgent}
          projectId={project.id}
          availableSkills={availableSkills}
          projectConnections={projectConnections}
          onUpdateConfig={async (updates) => {
            const { updateAgentConfig } = await import("~/server/agents");
            await updateAgentConfig({
              data: {
                agentId: agent.id,
                projectId: project.id,
                ...updates,
              },
            });
          }}
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
          agentName={displayAgent.name}
          mode={isNewAgent ? "blueprint" : "chat"}
          availableSkills={availableSkills}
          onBlueprintComplete={(data) => {
            setBlueprintDone(true);
            if (data) {
              setLocalOverrides({
                name: data.name,
                description: data.description,
                skills: data.skills ?? [],
                schedule: data.schedule ?? "manual",
                connections: data.connections ?? [],
              });
            }
          }}
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
