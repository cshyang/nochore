import { useState } from "react";
import { COLORS } from "~/lib/colors";
import { ProjectView } from "~/lib/types";
import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { ProjectConnections } from "~/components/ProjectConnections";

interface ProjectHomeProps {
  project: ProjectView;
  onSelectAgent: (id: string) => void;
  onNewAgent?: () => void;
  onDeleteProject?: () => void;
}

export function ProjectHome({ project, onSelectAgent, onNewAgent, onDeleteProject }: ProjectHomeProps) {
  const [projectTab, setProjectTab] = useState("agents");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const needsAttention = project.agents.filter((a) => a.status === "attention");

  return (
    <div>
      {/* Project header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 24 }}>{project.icon}</span>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: COLORS.text, margin: 0 }}>{project.name}</h1>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
              {project.agents.length} agents · {project.connectionCount} connections
            </div>
          </div>
          {onDeleteProject && (
            confirmDelete ? (
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 12, color: COLORS.textDim }}>Delete project?</span>
                <button onClick={() => setConfirmDelete(false)}
                  style={{ background: "none", border: "none", color: COLORS.textSecondary, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}>
                  No
                </button>
                <button onClick={onDeleteProject}
                  style={{ background: COLORS.redDim, border: `1px solid ${COLORS.red}`, color: COLORS.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "4px 10px", borderRadius: 6 }}>
                  Yes, delete
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                style={{ background: "none", border: "none", color: COLORS.textDim, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "4px 8px" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.red)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textDim)}>
                Delete
              </button>
            )
          )}
        </div>
        {/* Project tabs */}
        <div style={{ display: "flex", gap: 4, background: COLORS.surface, padding: 4, borderRadius: 12 }}>
          {[
            { key: "agents", label: "Agents" },
            { key: "connections", label: "Connections" },
          ].map((t) => (
            <button key={t.key} onClick={() => setProjectTab(t.key)}
              style={{
                flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                fontSize: 13, fontWeight: 600,
                background: projectTab === t.key ? COLORS.accentDim : "transparent",
                color: projectTab === t.key ? COLORS.accentLight : COLORS.textSecondary,
                transition: "all 0.15s ease",
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {projectTab === "connections" && <ProjectConnections project={project} />}
      {projectTab === "agents" && <>
      {project.agents.length === 0 ? (
        /* Empty state — no agents yet */
        <div style={{ textAlign: "center", padding: "80px 0 40px" }}>
          <div style={{ fontSize: 32, color: COLORS.accent, marginBottom: 12 }}>✦</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, marginBottom: 6 }}>
            No agents yet
          </div>
          <div style={{ fontSize: 14, color: COLORS.textSecondary, marginBottom: 24, lineHeight: 1.5 }}>
            Create your first agent to start monitoring and optimizing.
          </div>
          <button
            onClick={() => onNewAgent?.()}
            style={{
              background: COLORS.accent,
              border: "none",
              color: COLORS.white,
              fontSize: 14,
              fontWeight: 500,
              padding: "10px 24px",
              borderRadius: 8,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
          >
            + New agent
          </button>
        </div>
      ) : (
        <>
        {/* Attention-needed summary */}
        {needsAttention.length > 0 && (
          <Card style={{ marginBottom: 20, borderColor: COLORS.yellowDim, background: COLORS.yellowSubtle }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Badge color="yellow">{needsAttention.length} need{needsAttention.length === 1 ? "s" : ""} attention</Badge>
            </div>
            {needsAttention.map((agent) => (
              <div key={agent.id} onClick={() => onSelectAgent(agent.id)}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", cursor: "pointer", borderBottom: `1px solid ${COLORS.border}` }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{agent.name}</div>
                  <div style={{ fontSize: 13, color: COLORS.yellow, marginTop: 1 }}>
                    {agent.pendingCount > 0
                      ? `${agent.pendingCount} action${agent.pendingCount === 1 ? "" : "s"} need approval`
                      : "Needs attention"}
                  </div>
                </div>
                <span style={{ color: COLORS.textDim, fontSize: 18 }}>{"\u2192"}</span>
              </div>
            ))}
          </Card>
        )}

        {/* Agent grid */}
        <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          All agents
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {project.agents.map((agent) => {
            const statusDotColor =
              agent.status === "attention"
                ? COLORS.yellow
                : agent.status === "error"
                  ? COLORS.red
                  : agent.status === "running"
                    ? COLORS.green
                    : COLORS.textDim;
            return (
              <Card key={agent.id} onClick={() => onSelectAgent(agent.id)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{
                    width: 8,
                    height: 8,
                    borderRadius: 99,
                    background: statusDotColor,
                    opacity: agent.status === "idle" ? 0.5 : 1,
                    flexShrink: 0,
                  }} />
                  <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{agent.name}</span>
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
          <Card onClick={() => onNewAgent?.()} style={{ cursor: "pointer", borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 24, color: COLORS.accent }}>+</span>
              <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>Add agent</div>
            </div>
          </Card>
        </div>
        </>
      )}
      </>}
    </div>
  );
}
