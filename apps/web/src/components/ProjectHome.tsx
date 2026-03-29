import { useState } from "react";
import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { ProjectConnections } from "~/components/ProjectConnections";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { ProjectView } from "~/lib/types";

const transition = `${MOTION.duration} ${MOTION.ease}`;

interface ProjectHomeProps {
  project: ProjectView;
  onSelectAgent: (id: string) => void;
  onNewAgent?: () => void;
  onDeleteProject?: () => void;
}

function isIncompleteDraft(agent: ProjectView["agents"][number]): boolean {
  if (agent.lifecycleStatus !== "draft") return false;
  const hasName = !!agent.name && agent.name !== "Untitled Agent";
  const hasInstructions = !!agent.instructions && agent.instructions.trim().length > 20;
  return !hasName || !hasInstructions;
}

function draftHint(agent: ProjectView["agents"][number]): string {
  const missing: string[] = [];
  if (!agent.name || agent.name === "Untitled Agent") missing.push("name");
  if (!agent.instructions || agent.instructions.trim().length <= 20) missing.push("instructions");
  if (agent.skills.length === 0) missing.push("skills");
  if (missing.length === 0) return "Ready to go live";
  return `Needs ${missing.join(", ")}`;
}

export function ProjectHome({ project, onSelectAgent, onNewAgent, onDeleteProject }: ProjectHomeProps) {
  const [projectTab, setProjectTab] = useState("agents");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const needsAttention = project.agents.filter((a) => a.status === "attention");
  const incompleteDrafts = project.agents.filter(isIncompleteDraft);
  const regularAgents = project.agents.filter((a) => !isIncompleteDraft(a));

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>

      {/* Project header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 24 }}>{project.icon}</span>
          <div style={{ flex: 1 }}>
            <h1
              style={{
                fontSize: TYPE.scale.xl,
                fontWeight: TYPE.weight.semibold,
                fontFamily: TYPE.display,
                letterSpacing: TYPE.tracking.tight,
                color: COLORS.text,
                margin: 0,
              }}
            >
              {project.name}
            </h1>
            <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary, marginTop: 2 }}>
              {project.agents.length} agents · {project.connectionCount} connections
            </div>
          </div>
          {onDeleteProject &&
            (confirmDelete ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: COLORS.textDim }}>Delete project?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: COLORS.textSecondary,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "4px 8px",
                  }}
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={onDeleteProject}
                  style={{
                    background: COLORS.redDim,
                    border: `1px solid ${COLORS.red}`,
                    color: COLORS.red,
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "4px 10px",
                    borderRadius: RADIUS.md,
                  }}
                >
                  Yes, delete
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.textDim,
                  fontSize: 12,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  padding: "4px 8px",
                  transition,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}
              >
                Delete
              </button>
            ))}
        </div>
        {/* Project tabs */}
        <nav style={{ display: "flex", gap: 24, borderBottom: `1px solid ${COLORS.border}` }}>
          {[
            { key: "agents", label: "Agents" },
            { key: "connections", label: "Connections" },
          ].map((t) => (
            <button
              type="button"
              key={t.key}
              onClick={() => setProjectTab(t.key)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: TYPE.body,
                fontSize: TYPE.scale.sm,
                fontWeight: TYPE.weight.medium,
                color: projectTab === t.key ? COLORS.text : COLORS.textDim,
                padding: "12px 0",
                marginBottom: -1,
                borderBottom: `2px solid ${projectTab === t.key ? COLORS.accent : "transparent"}`,
                transition: `color ${transition}`,
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {projectTab === "connections" && <ProjectConnections project={project} />}
      {projectTab === "agents" &&
        (project.agents.length === 0 ? (
          /* Empty state — no agents yet */
          <div style={{ textAlign: "center", padding: "80px 0 40px" }}>
            <div style={{ fontSize: 32, color: COLORS.accent, marginBottom: 12 }}>✦</div>
            <div
              style={{
                fontSize: TYPE.scale.md,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                marginBottom: 6,
              }}
            >
              No agents yet
            </div>
            <div style={{ fontSize: TYPE.scale.base, color: COLORS.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
              Create your first agent to start monitoring and optimizing.
            </div>
            <button
              type="button"
              onClick={() => onNewAgent?.()}
              style={{
                background: COLORS.accent,
                border: "none",
                color: COLORS.white,
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.medium,
                padding: "10px 24px",
                borderRadius: RADIUS.md,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: `background ${transition}`,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentBright)}
              onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.accent)}
            >
              + New agent
            </button>
          </div>
        ) : (
          <>
            {/* Attention-needed summary */}
            {needsAttention.length > 0 && (
              <Card style={{ marginBottom: 20, borderColor: COLORS.orangeDim, background: COLORS.orangeSubtle }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Badge color="orange">
                    {needsAttention.length} need{needsAttention.length === 1 ? "s" : ""} attention
                  </Badge>
                </div>
                {needsAttention.map((agent) => (
                  <button
                    type="button"
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 0",
                      cursor: "pointer",
                      borderBottom: `1px solid ${COLORS.border}`,
                      background: "none",
                      border: "none",
                      borderBottomColor: COLORS.border,
                      borderBottomStyle: "solid",
                      borderBottomWidth: "1px",
                      width: "100%",
                      textAlign: "left",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
                        {agent.name}
                      </div>
                      <div style={{ fontSize: TYPE.scale.sm, color: COLORS.orange, marginTop: 1 }}>
                        {agent.pendingCount > 0
                          ? `${agent.pendingCount} action${agent.pendingCount === 1 ? "" : "s"} need approval`
                          : "Needs attention"}
                      </div>
                    </div>
                    <span style={{ color: COLORS.textDim, fontSize: 18 }}>{"\u2192"}</span>
                  </button>
                ))}
              </Card>
            )}

            {/* Incomplete drafts — resume setup prompt */}
            {incompleteDrafts.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: 12,
                    color: COLORS.textDim,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 12,
                  }}
                >
                  Finish setup
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {incompleteDrafts.map((agent) => (
                    <button
                      type="button"
                      key={agent.id}
                      onClick={() => onSelectAgent(agent.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 16,
                        padding: "14px 18px",
                        background: COLORS.surface,
                        border: `1px dashed ${COLORS.border}`,
                        borderRadius: RADIUS.lg,
                        cursor: "pointer",
                        transition: `border-color ${transition}`,
                        textAlign: "left",
                        width: "100%",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = COLORS.accent;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = COLORS.border;
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          <span
                            style={{
                              fontSize: TYPE.scale.base,
                              fontWeight: TYPE.weight.semibold,
                              color: COLORS.text,
                            }}
                          >
                            {agent.name}
                          </span>
                          <Badge color="orange">Draft</Badge>
                        </div>
                        <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim }}>{draftHint(agent)}</div>
                      </div>
                      <span
                        style={{
                          fontSize: TYPE.scale.xs,
                          fontWeight: TYPE.weight.medium,
                          color: COLORS.accent,
                          flexShrink: 0,
                        }}
                      >
                        Resume setup →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Agent grid */}
            <div
              style={{
                fontSize: 12,
                color: COLORS.textDim,
                textTransform: "uppercase",
                letterSpacing: 1,
                marginBottom: 12,
              }}
            >
              {incompleteDrafts.length > 0 ? "Active agents" : "All agents"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {regularAgents.map((agent) => {
                const statusDotColor =
                  agent.status === "attention"
                    ? COLORS.orange
                    : agent.status === "error"
                      ? COLORS.red
                      : agent.status === "running"
                        ? COLORS.green
                        : COLORS.textDim;
                const isRunning = agent.status === "running";
                const isDraft = agent.lifecycleStatus === "draft";
                return (
                  <Card
                    key={agent.id}
                    onClick={() => onSelectAgent(agent.id)}
                    style={{ cursor: "pointer", padding: 20 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 99,
                          background: statusDotColor,
                          opacity: agent.status === "idle" ? 0.5 : 1,
                          flexShrink: 0,
                          ...(isRunning ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
                        }}
                      />
                      <span style={{ fontSize: TYPE.scale.base, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
                        {agent.name}
                      </span>
                      {isDraft && (
                        <span
                          style={{
                            fontSize: TYPE.scale.xs,
                            fontWeight: TYPE.weight.medium,
                            background: "rgba(107,103,128,0.15)",
                            color: COLORS.textSecondary,
                            padding: "2px 8px",
                            borderRadius: RADIUS.sm,
                          }}
                        >
                          Draft
                        </span>
                      )}
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <span style={{ fontSize: 12, color: COLORS.textSecondary }}>
                        Last run: {agent.lastRunRelative ?? "Never"}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <Badge color="gray">{agent.skills.length} skills</Badge>
                      <Badge color="gray">{agent.lessonCount} lessons</Badge>
                    </div>
                  </Card>
                );
              })}

              {/* Add agent */}
              <Card
                onClick={() => onNewAgent?.()}
                style={{
                  cursor: "pointer",
                  borderStyle: "dashed",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minHeight: 120,
                }}
              >
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 24, color: COLORS.accent }}>+</span>
                  <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary, marginTop: 4 }}>Add agent</div>
                </div>
              </Card>
            </div>
          </>
        ))}
    </div>
  );
}
