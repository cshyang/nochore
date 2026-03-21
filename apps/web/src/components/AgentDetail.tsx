import { useState } from "react";
import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { Card } from "~/components/Card";
import { MiniConfidence } from "~/components/MiniConfidence";
import { AgentMonitor } from "~/components/AgentMonitor";
import { InsightFeed } from "~/components/InsightFeed";
import type { InsightFeedProps } from "~/components/InsightFeed";
import { AgentChat } from "~/components/AgentChat";
import { MemoryTimeline } from "~/components/MemoryTimeline";
import {
  ArrowLeft,
  Gear,
  Shield,
  Brain,
} from "@phosphor-icons/react";
import type { Agent, Project } from "~/lib/types";

interface AgentDetailProps {
  agent: Agent;
  project: Project;
  onBack: () => void;
  runs?: InsightFeedProps["runs"];
  pendingActions?: InsightFeedProps["pendingActions"];
  onApprove?: InsightFeedProps["onApprove"];
  onReject?: InsightFeedProps["onReject"];
}

const tabs = [
  { key: "monitor", label: "Monitor" },
  { key: "feed", label: "Feed" },
  { key: "chat", label: "Chat" },
  { key: "memory", label: "Memory" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof tabs)[number]["key"];

export function AgentDetail({ agent, project, onBack, runs, pendingActions, onApprove, onReject }: AgentDetailProps) {
  const [tab, setTab] = useState<TabKey>("feed");
  const [hoveredTab, setHoveredTab] = useState<TabKey | null>(null);
  const agentColor = getAgentColor(agent.id);

  return (
    <div>
      {/* Agent header — briefing style */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 16,
          marginBottom: 24,
          paddingBottom: 20,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {/* Back button */}
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
            marginTop: 2,
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

        {/* Agent color indicator + name block */}
        <div
          style={{
            display: "flex",
            alignItems: "stretch",
            gap: 14,
            flex: 1,
            minWidth: 0,
          }}
        >
          {/* Signature color bar */}
          <div
            style={{
              width: 4,
              borderRadius: RADIUS.sharp,
              background: agentColor.primary,
              flexShrink: 0,
              alignSelf: "stretch",
            }}
          />

          {/* Agent info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 6,
              }}
            >
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: COLORS.text,
                  margin: 0,
                  fontFamily: '"Satoshi", sans-serif',
                  lineHeight: 1.2,
                }}
              >
                {agent.name}
              </h1>
              <Badge
                color={agent.status === "attention" ? "yellow" : "green"}
              >
                {agent.status === "attention" ? "Needs input" : "Running"}
              </Badge>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                fontSize: 13,
                color: COLORS.textSecondary,
              }}
            >
              <span>
                {project.icon} {project.name}
              </span>
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: RADIUS.pill,
                  background: COLORS.textDim,
                  flexShrink: 0,
                }}
              />
              <span>Last run {agent.lastRun}</span>
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: RADIUS.pill,
                  background: COLORS.textDim,
                  flexShrink: 0,
                }}
              />
              <MiniConfidence value={agent.confidence} />
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar — crisp underline style */}
      <div
        style={{
          display: "flex",
          gap: 0,
          marginBottom: 24,
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        {tabs.map((t) => {
          const isActive = tab === t.key;
          const isHovered = hoveredTab === t.key;

          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              onMouseEnter={() => setHoveredTab(t.key)}
              onMouseLeave={() => setHoveredTab(null)}
              style={{
                padding: "10px 20px",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontFamily: '"Satoshi", sans-serif',
                fontSize: 13,
                fontWeight: 600,
                color: isActive
                  ? COLORS.text
                  : isHovered
                    ? COLORS.textSecondary
                    : COLORS.textDim,
                transition: "color 0.15s ease",
                position: "relative",
                borderRadius: 0,
              }}
            >
              {t.label}
              {/* Active underline indicator using agent color */}
              <span
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 0,
                  right: 0,
                  height: 2,
                  borderRadius: RADIUS.sharp,
                  background: isActive ? agentColor.primary : "transparent",
                  transition: "background 0.15s ease",
                }}
              />
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === "monitor" && <AgentMonitor agent={agent} />}
      {tab === "feed" && (
        <InsightFeed
          runs={runs}
          pendingActions={pendingActions}
          onApprove={onApprove}
          onReject={onReject}
        />
      )}
      {tab === "chat" && (
        <AgentChat agentId={agent.id} projectId={project.id} />
      )}
      {tab === "memory" && <MemoryTimeline />}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Basic config */}
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Gear
                size={18}
                weight="light"
                color={COLORS.textSecondary}
              />
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: COLORS.text,
                  margin: 0,
                  fontFamily: '"Satoshi", sans-serif',
                }}
              >
                Agent Configuration
              </h3>
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              {[
                {
                  label: "Intent",
                  value:
                    "Monitor Google Ads for search term waste and budget inefficiencies",
                },
                {
                  label: "Tools",
                  value: "Google Ads, Slack (inherited from project)",
                },
                {
                  label: "Schedule",
                  value: "Every 6 hours, 9am\u20136pm EST",
                },
              ].map((item) => (
                <div key={item.label}>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.textDim,
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                    }}
                  >
                    {item.label}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: COLORS.textSecondary,
                      lineHeight: 1.5,
                    }}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Policy summary */}
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 12,
              }}
            >
              <Shield
                size={18}
                weight="light"
                color={COLORS.textSecondary}
              />
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: COLORS.text,
                  margin: 0,
                  fontFamily: '"Satoshi", sans-serif',
                }}
              >
                Policy Rules
              </h3>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  background: COLORS.bg,
                  borderRadius: RADIUS.sharp,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: COLORS.text,
                    }}
                  >
                    Negative keywords
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: COLORS.textSecondary,
                    }}
                  >
                    Add automatically, notify after
                  </div>
                </div>
                <Badge color="green">Auto</Badge>
              </div>
              <div
                style={{
                  padding: "10px 12px",
                  background: COLORS.bg,
                  borderRadius: RADIUS.sharp,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: COLORS.text,
                      }}
                    >
                      Budget changes
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textSecondary,
                      }}
                    >
                      Smart thresholds
                    </div>
                  </div>
                  <Badge color="accent">Tiered</Badge>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    {
                      label: "<$50",
                      badge: "Auto",
                      color: "green" as const,
                    },
                    {
                      label: "$50\u2013200",
                      badge: "Ask",
                      color: "yellow" as const,
                    },
                    {
                      label: ">$200",
                      badge: "Ask+",
                      color: "red" as const,
                    },
                  ].map((t) => (
                    <div
                      key={t.label}
                      style={{
                        flex: 1,
                        padding: "8px 8px",
                        background: COLORS.surface,
                        borderRadius: RADIUS.sharp,
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          color: COLORS.textDim,
                          marginBottom: 2,
                        }}
                      >
                        {t.label}
                      </div>
                      <Badge color={t.color}>{t.badge}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Skills with knowledge attachment */}
          <Card>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 4,
              }}
            >
              <Brain
                size={18}
                weight="light"
                color={COLORS.textSecondary}
              />
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: COLORS.text,
                  margin: 0,
                  fontFamily: '"Satoshi", sans-serif',
                }}
              >
                Skills & Knowledge
              </h3>
            </div>
            <p
              style={{
                fontSize: 12,
                color: COLORS.textSecondary,
                margin: "0 0 14px",
                paddingLeft: 26,
              }}
            >
              Attach domain context to each skill to improve the agent's
              reasoning
            </p>

            {[
              {
                name: "Search Term Analysis",
                desc: "Detects wasteful search terms and suggests negatives",
                hasKnowledge: true,
                knowledge:
                  "Brand terms: acme, acme corp, acme marketing platform. Competitor terms to ignore: xyz corp, abc tools. High-intent terms to protect: pricing, demo, free trial.",
              },
              {
                name: "Budget Allocation",
                desc: "Spots over/under-spending across campaigns",
                hasKnowledge: true,
                knowledge:
                  "Q2 total budget cap: $15,000/month. Brand campaigns have priority \u2014 do not reduce below $200/day. Generic campaigns are flexible. Weekend spend should be 30% lower than weekdays.",
              },
            ].map((skill) => (
              <div
                key={skill.name}
                style={{
                  marginBottom: 16,
                  padding: 16,
                  background: COLORS.bg,
                  borderRadius: RADIUS.sharp,
                  border: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: COLORS.text,
                    }}
                  >
                    {skill.name}
                  </span>
                  <Badge color="green">Active</Badge>
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textSecondary,
                    marginBottom: 12,
                  }}
                >
                  {skill.desc}
                </div>

                {/* Knowledge attachment */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: RADIUS.sharp,
                    border: `1px solid ${COLORS.border}`,
                    background: "transparent",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <Brain
                      size={14}
                      weight="light"
                      color={COLORS.textDim}
                    />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: COLORS.textSecondary,
                      }}
                    >
                      {skill.hasKnowledge
                        ? "Knowledge attached"
                        : "No knowledge attached"}
                    </span>
                  </div>
                  {skill.hasKnowledge ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: COLORS.textSecondary,
                        lineHeight: 1.6,
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {skill.knowledge}
                    </div>
                  ) : (
                    <div
                      style={{ fontSize: 12, color: COLORS.textDim }}
                    >
                      Add domain context to help this skill reason better
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <Button
                      size="sm"
                      variant={
                        skill.hasKnowledge ? "ghost" : "secondary"
                      }
                    >
                      {skill.hasKnowledge
                        ? "Edit knowledge"
                        : "+ Add knowledge"}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}
