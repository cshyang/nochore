import { useState } from "react";
import { COLORS } from "~/lib/colors";
import { Project } from "~/lib/types";
import { Badge } from "~/components/Badge";
import { Card } from "~/components/Card";
import { MiniConfidence } from "~/components/MiniConfidence";
import { ProgressBar } from "~/components/ProgressBar";
import { ProjectConnections } from "~/components/ProjectConnections";

interface ProjectHomeProps {
  project: Project;
  onSelectAgent: (id: string) => void;
}

export function ProjectHome({ project, onSelectAgent }: ProjectHomeProps) {
  const [projectTab, setProjectTab] = useState("agents");
  const needsAttention = project.agents.filter((a) => a.status === "attention");

  return (
    <div>
      {/* Project header */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 28 }}>{project.icon}</span>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 600, color: COLORS.text, margin: 0 }}>{project.name}</h1>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
              {project.agents.length} agents · {project.sharedTools.length} connections
            </div>
          </div>
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

      {/* Attention-needed summary across project */}
      {needsAttention.length > 0 && (
        <Card style={{ marginBottom: 20, borderColor: COLORS.yellowDim, background: COLORS.yellowSubtle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Badge color="yellow">{needsAttention.length} need{needsAttention.length === 1 ? "s" : ""} attention</Badge>
          </div>
          {needsAttention.map((agent) => (
            <div key={agent.id} onClick={() => onSelectAgent(agent.id)}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", cursor: "pointer", borderBottom: `1px solid ${COLORS.border}` }}
              onMouseEnter={(e) => {
                const arrow = e.currentTarget.querySelector<HTMLElement>('.arrow');
                if (arrow) arrow.style.color = COLORS.text;
              }}
              onMouseLeave={(e) => {
                const arrow = e.currentTarget.querySelector<HTMLElement>('.arrow');
                if (arrow) arrow.style.color = COLORS.textDim;
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{agent.name}</div>
                <div style={{ fontSize: 13, color: COLORS.yellow, marginTop: 1 }}>{agent.statusText}</div>
              </div>
              <span className="arrow" style={{ color: COLORS.textDim, fontSize: 18, transition: "color 0.15s" }}>{"\u2192"}</span>
            </div>
          ))}
        </Card>
      )}

      {/* Agent grid */}
      <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
        All agents
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {project.agents.map((agent) => (
          <Card key={agent.id} onClick={() => onSelectAgent(agent.id)} style={{ cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: agent.status === "attention" ? COLORS.yellow : COLORS.green }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{agent.name}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: COLORS.textSecondary }}>Last run: {agent.lastRun}</span>
              <MiniConfidence value={agent.confidence} />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Badge color="gray">{agent.skills} skills</Badge>
              <Badge color="gray">{agent.lessons} lessons</Badge>
            </div>
          </Card>
        ))}

        {/* Add agent to project */}
        <Card onClick={() => {}} style={{ cursor: "pointer", borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 120 }}>
          <div style={{ textAlign: "center" }}>
            <span style={{ fontSize: 24, color: COLORS.accent }}>+</span>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>Add agent</div>
          </div>
        </Card>
      </div>

      {/* Project-level shared context */}
      <div style={{ marginTop: 28 }}>
        <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          Shared across this project
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
          <Card style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>Connections</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", justifyContent: "center" }}>
              {project.sharedTools.map((t) => <Badge key={t} color="accent">{t}</Badge>)}
            </div>
          </Card>
          <Card style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>Shared Memory</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>
              {project.agents.reduce((sum, a) => sum + a.lessons, 0)}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>lessons total</div>
          </Card>
          <Card style={{ padding: 16, textAlign: "center" }}>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 8 }}>Avg Confidence</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>
              {Math.round(project.agents.reduce((sum, a) => sum + a.confidence, 0) / project.agents.length)}%
            </div>
            <ProgressBar value={Math.round(project.agents.reduce((sum, a) => sum + a.confidence, 0) / project.agents.length)} style={{ marginTop: 8 }} />
          </Card>
        </div>
      </div>
      </>}
    </div>
  );
}
