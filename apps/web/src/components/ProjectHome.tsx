import { type ReactNode, useState } from "react";
import { AgentCard } from "~/components/AgentCard";
import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { humanizeToolName } from "~/lib/narrate";
import type { AgentView, ConnectionView, ProjectView } from "~/lib/types";

const transition = `${MOTION.duration} ${MOTION.ease}`;
const tabular: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

interface ProjectHomeProps {
  project: ProjectView;
  connections: ConnectionView[];
  onSelectAgent: (id: string, options?: { runId?: string; pendingActionId?: string; tab?: "runs" | "chat" }) => void;
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

function groupNeedsInput(project: ProjectView) {
  const groups = new Map<string, { agentId: string; agentName: string; items: ProjectView["needsInput"] }>();

  for (const item of project.needsInput) {
    if (!groups.has(item.agentId)) {
      groups.set(item.agentId, {
        agentId: item.agentId,
        agentName: item.agentName,
        items: [],
      });
    }
    groups.get(item.agentId)?.items.push(item);
  }

  return [...groups.values()];
}

export function ProjectHome({ project, connections, onSelectAgent, onNewAgent, onDeleteProject }: ProjectHomeProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const needsAttention = project.agents.filter((a) => a.status === "attention");
  const groupedNeedsInput = groupNeedsInput(project);
  const hasNeedsAttention = groupedNeedsInput.length > 0 || needsAttention.length > 0;
  const activeConnections = connections.filter((c) => c.status === "active");
  const incompleteDrafts = project.agents.filter(isIncompleteDraft);
  const regularAgents = project.agents.filter((a) => !isIncompleteDraft(a));

  const runningCount = project.agents.filter((a: AgentView) => a.status === "running").length;
  const attentionCount = needsAttention.length + groupedNeedsInput.reduce((n, g) => n + g.items.length, 0);

  return (
    <div style={{ animation: "fadeIn 0.3s ease" }}>
      <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } } @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>

      {/* Project header */}
      <div style={{ marginBottom: SPACE[6] }}>
        <div style={{ display: "flex", alignItems: "center", gap: SPACE[4], marginBottom: SPACE[4] }}>
          {/* Identity tile — gives the header a real anchor */}
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: RADIUS.sm,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              display: "grid",
              placeItems: "center",
              fontSize: 22,
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-hidden
          >
            {project.icon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1
              style={{
                fontSize: TYPE.scale.xl,
                fontWeight: TYPE.weight.semibold,
                fontFamily: TYPE.display,
                letterSpacing: TYPE.tracking.tight,
                color: COLORS.text,
                margin: 0,
                lineHeight: TYPE.leading.tight,
              }}
            >
              {project.name}
            </h1>
            <ProjectStatusSnapshot
              runningCount={runningCount}
              attentionCount={attentionCount}
              agentCount={project.agents.length}
              connectionCount={project.connectionCount}
            />
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
        {/* Connected services */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {activeConnections.length > 0 ? (
            activeConnections.map((c) => (
              <span
                key={c.id}
                style={{
                  background: COLORS.surfaceHover,
                  borderRadius: RADIUS.pill,
                  padding: "4px 10px",
                  fontSize: TYPE.scale.xs,
                  color: COLORS.textSecondary,
                }}
              >
                {c.provider}
              </span>
            ))
          ) : (
            <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>No systems connected</span>
          )}
          <button
            type="button"
            style={{
              background: "none",
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.pill,
              padding: "4px 10px",
              fontSize: TYPE.scale.xs,
              color: COLORS.textSecondary,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: `border-color ${transition}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          >
            + Connect
          </button>
        </div>
      </div>

      {project.agents.length === 0 ? (
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
          {/* Consolidated needs-attention section */}
          {hasNeedsAttention && (
            <div style={{ marginBottom: SPACE[6] }}>
              <div
                style={{
                  fontSize: TYPE.scale.xs,
                  color: COLORS.textDim,
                  textTransform: "uppercase",
                  letterSpacing: TYPE.tracking.wide,
                  marginBottom: SPACE[3],
                }}
              >
                Needs attention
              </div>

              <Card style={{ borderColor: COLORS.orangeDim, background: COLORS.orangeSubtle }}>
                {(() => {
                  let rowIndex = 0;
                  const rows: ReactNode[] = [];

                  for (const group of groupedNeedsInput) {
                    for (const item of group.items) {
                      const isFirst = rowIndex === 0;
                      rowIndex++;
                      rows.push(
                        <button
                          type="button"
                          key={item.id}
                          onClick={() =>
                            onSelectAgent(item.agentId, {
                              runId: item.runId,
                              pendingActionId: item.approval.id,
                              tab: "runs",
                            })
                          }
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12,
                            padding: "12px 16px",
                            width: "100%",
                            background: "none",
                            border: "none",
                            borderTop: isFirst ? "none" : `1px solid ${COLORS.border}`,
                            textAlign: "left",
                            cursor: "pointer",
                            fontFamily: "inherit",
                            transition,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.draftBg)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{group.agentName}</div>
                            <div
                              style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}
                            >
                              {humanizeToolName(item.approval.proposal.toolName)}
                            </div>
                            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary }}>
                              {item.approval.proposal.reason}
                            </div>
                          </div>
                          <span style={{ color: COLORS.textDim, fontSize: 16, paddingTop: 2, flexShrink: 0 }}>
                            {"\u2192"}
                          </span>
                        </button>,
                      );
                    }
                  }

                  for (const agent of needsAttention) {
                    const isFirst = rowIndex === 0;
                    rowIndex++;
                    rows.push(
                      <button
                        type="button"
                        key={agent.id}
                        onClick={() => onSelectAgent(agent.id)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 12,
                          padding: "12px 16px",
                          width: "100%",
                          background: "none",
                          border: "none",
                          borderTop: isFirst ? "none" : `1px solid ${COLORS.border}`,
                          textAlign: "left",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          transition,
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.draftBg)}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <div style={{ display: "grid", gap: 2 }}>
                          <div
                            style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}
                          >
                            {agent.name}
                          </div>
                          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.orange }}>Needs attention</div>
                        </div>
                        <span style={{ color: COLORS.textDim, fontSize: 16, flexShrink: 0 }}>{"\u2192"}</span>
                      </button>,
                    );
                  }

                  return rows;
                })()}
              </Card>
            </div>
          )}

          {/* Incomplete drafts — resume setup prompt */}
          {incompleteDrafts.length > 0 && (
            <div style={{ marginBottom: SPACE[6] }}>
              <div
                style={{
                  fontSize: TYPE.scale.xs,
                  color: COLORS.textDim,
                  textTransform: "uppercase",
                  letterSpacing: TYPE.tracking.wide,
                  marginBottom: SPACE[3],
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

          {/* Agent grid — only when there are non-draft agents. Section header carries the "new agent" affordance,
              auto-fit grid lets a single agent fill the row instead of leaving a dead column. */}
          {regularAgents.length > 0 && (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: SPACE[3],
                  marginBottom: SPACE[3],
                }}
              >
                <div
                  style={{
                    fontSize: TYPE.scale.xs,
                    color: COLORS.textDim,
                    textTransform: "uppercase",
                    letterSpacing: TYPE.tracking.wide,
                  }}
                >
                  {incompleteDrafts.length > 0 ? "Active agents" : "All agents"}
                </div>
                <button
                  type="button"
                  onClick={() => onNewAgent?.()}
                  style={{
                    background: "none",
                    border: "none",
                    color: COLORS.textSecondary,
                    fontSize: TYPE.scale.xs,
                    fontWeight: TYPE.weight.medium,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    padding: "2px 0",
                    transition: `color ${transition}`,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.accent)}
                  onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
                >
                  + New agent
                </button>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))",
                  gap: SPACE[3],
                }}
              >
                {regularAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} onClick={() => onSelectAgent(agent.id)} />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

interface ProjectStatusSnapshotProps {
  runningCount: number;
  attentionCount: number;
  agentCount: number;
  connectionCount: number;
}

function ProjectStatusSnapshot({
  runningCount,
  attentionCount,
  agentCount,
  connectionCount,
}: ProjectStatusSnapshotProps) {
  const dotSize = 6;
  const items: ReactNode[] = [];

  if (runningCount > 0) {
    items.push(
      <span key="running" style={{ display: "inline-flex", alignItems: "center", gap: 6, ...tabular }}>
        <span
          style={{
            width: dotSize,
            height: dotSize,
            borderRadius: 99,
            background: COLORS.green,
            animation: "pulse 3s ease-in-out infinite",
          }}
        />
        <span style={{ color: COLORS.text }}>{runningCount}</span>
        <span style={{ color: COLORS.textSecondary }}>running</span>
      </span>,
    );
  }

  if (attentionCount > 0) {
    items.push(
      <span key="attention" style={{ display: "inline-flex", alignItems: "center", gap: 6, ...tabular }}>
        <span style={{ width: dotSize, height: dotSize, borderRadius: 99, background: COLORS.orange }} />
        <span style={{ color: COLORS.text }}>{attentionCount}</span>
        <span style={{ color: COLORS.textSecondary }}>needs you</span>
      </span>,
    );
  }

  items.push(
    <span key="counts" style={{ color: COLORS.textDim, ...tabular }}>
      {agentCount} {agentCount === 1 ? "agent" : "agents"} · {connectionCount}{" "}
      {connectionCount === 1 ? "connection" : "connections"}
    </span>,
  );

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: SPACE[3],
        marginTop: SPACE[1],
        fontSize: TYPE.scale.sm,
        lineHeight: 1.3,
      }}
    >
      {items.map((node, i) => (
        <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: SPACE[3] }}>
          {i > 0 && <span style={{ color: COLORS.border }} aria-hidden>·</span>}
          {node}
        </span>
      ))}
    </div>
  );
}
