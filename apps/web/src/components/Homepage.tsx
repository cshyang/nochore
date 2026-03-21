import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import type { Project } from "~/lib/types";
import { Badge } from "~/components/Badge";
import { MiniConfidence } from "~/components/MiniConfidence";
import {
  Sparkle,
  Plus,
  ArrowRight,
  WarningCircle,
  CheckCircle,
} from "@phosphor-icons/react";

export function Homepage({
  projects,
  onSelectProject,
}: {
  projects: Project[];
  onSelectProject: (id: string) => void;
}) {
  const totalAgents = projects.reduce((s, p) => s + p.agents.length, 0);
  const totalAttention = projects.reduce((s, p) => s + p.attentionCount, 0);

  // Gather all attention agents across projects for the "needs you" section
  const attentionItems = projects.flatMap((p) =>
    p.agents
      .filter((a) => a.status === "attention")
      .map((a) => ({ ...a, projectName: p.name, projectId: p.id })),
  );

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      {/* Minimal top bar */}
      <div
        style={{
          padding: "16px 48px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkle size={20} weight="duotone" color={COLORS.accent} />
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.text,
              letterSpacing: -0.3,
              fontFamily: '"Satoshi", sans-serif',
            }}
          >
            Nochore
          </span>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "48px 48px 64px" }}>
        {/* Greeting — the emotional anchor */}
        <div style={{ marginBottom: 48 }}>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              color: COLORS.text,
              margin: 0,
              letterSpacing: -0.5,
              fontFamily: '"Satoshi", sans-serif',
            }}
          >
            Good morning, Chau Shyang.
          </h1>
          <p
            style={{
              fontSize: 16,
              color: COLORS.textSecondary,
              marginTop: 8,
              lineHeight: 1.5,
            }}
          >
            {totalAttention > 0
              ? `${totalAttention} item${totalAttention === 1 ? "" : "s"} need${totalAttention === 1 ? "s" : ""} your attention. ${totalAgents - totalAttention} agent${totalAgents - totalAttention === 1 ? " is" : "s are"} running smoothly.`
              : `All ${totalAgents} agents are running smoothly. Nothing needs your attention.`}
          </p>
        </div>

        {/* Needs attention — only shows when there are items */}
        {attentionItems.length > 0 && (
          <div style={{ marginBottom: 48 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 16,
              }}
            >
              <WarningCircle size={14} weight="light" color={COLORS.textDim} />
              <span
                style={{
                  fontSize: 12,
                  color: COLORS.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  fontWeight: 500,
                }}
              >
                Needs attention
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {attentionItems.map((item) => {
                const agentColor = getAgentColor(item.id);
                return (
                  <div
                    key={item.id}
                    onClick={() => onSelectProject(item.projectId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 16px",
                      borderRadius: RADIUS.sharp,
                      background: COLORS.surface,
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                      borderLeft: `1px solid ${COLORS.border}`,
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = COLORS.surfaceHover)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = COLORS.surface)
                    }
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 600,
                          color: COLORS.text,
                          marginBottom: 2,
                        }}
                      >
                        {item.name}
                      </div>
                      <div style={{ fontSize: 13, color: COLORS.textSecondary }}>
                        {item.statusText}
                        <span style={{ color: COLORS.textDim }}> · {item.projectName}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} weight="light" color={COLORS.textDim} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All clear banner — shows when nothing needs attention */}
        {attentionItems.length === 0 && (
          <div
            style={{
              marginBottom: 48,
              padding: "20px 24px",
              borderRadius: RADIUS.sharp,
              background: COLORS.greenDim,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <CheckCircle size={20} weight="light" color={COLORS.green} />
            <span style={{ fontSize: 14, color: COLORS.green, fontWeight: 500 }}>
              All clear — your agents are watching. You'll be notified when something needs you.
            </span>
          </div>
        )}

        {/* Projects */}
        <div style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: 13,
                color: COLORS.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                fontWeight: 600,
              }}
            >
              Projects
            </span>
            <button
              onClick={() => {}}
              style={{
                background: "none",
                border: "none",
                color: COLORS.textSecondary,
                fontSize: 13,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 8px",
                borderRadius: RADIUS.button,
                transition: "color 0.15s ease",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = COLORS.textSecondary)
              }
            >
              <Plus size={14} weight="light" />
              New project
            </button>
          </div>

          {/* Project list — not cards, more editorial */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {projects.map((proj) => {
              const projLessons = proj.agents.reduce(
                (s, a) => s + a.lessons,
                0,
              );
              const projConfidence = Math.round(
                proj.agents.reduce((s, a) => s + a.confidence, 0) /
                  proj.agents.length,
              );

              return (
                <div
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  style={{
                    padding: "16px",
                    borderRadius: RADIUS.sharp,
                    background: COLORS.surface,
                    cursor: "pointer",
                    transition: "background 0.15s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = COLORS.surfaceHover)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = COLORS.surface)
                  }
                >
                  {/* Project header */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      marginBottom: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <span style={{ fontSize: 20 }}>{proj.icon}</span>
                      <div>
                        <div
                          style={{
                            fontSize: 16,
                            fontWeight: 600,
                            color: COLORS.text,
                            fontFamily: '"Satoshi", sans-serif',
                          }}
                        >
                          {proj.name}
                        </div>
                        <div
                          style={{
                            fontSize: 13,
                            color: COLORS.textSecondary,
                            marginTop: 2,
                          }}
                        >
                          {proj.agents.length} agents · {projLessons} lessons · {projConfidence}% confidence
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {proj.attentionCount > 0 && (
                        <Badge color="yellow">{proj.attentionCount}</Badge>
                      )}
                      <ArrowRight size={16} weight="light" color={COLORS.textDim} />
                    </div>
                  </div>

                  {/* Agent status row */}
                  <div
                    style={{
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    {proj.agents.map((agent) => {
                      const agentColor = getAgentColor(agent.id);
                      return (
                        <div
                          key={agent.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 13,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: RADIUS.pill,
                              background:
                                agent.status === "attention"
                                  ? COLORS.yellow
                                  : agentColor.primary,
                              flexShrink: 0,
                              opacity: agent.status === "running" ? 0.7 : 1,
                            }}
                          />
                          <span
                            style={{
                              color:
                                agent.status === "attention"
                                  ? COLORS.text
                                  : COLORS.textSecondary,
                              fontWeight: agent.status === "attention" ? 500 : 400,
                            }}
                          >
                            {agent.name}
                          </span>
                          <MiniConfidence value={agent.confidence} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
