import { useState } from "react";

// ============================================================
// Nochore — Interactive UX Prototype v3
// Two-mode navigation: full-screen lobby → project workspace with sidebar
// ============================================================

const COLORS = {
  bg: "#0F1117",
  surface: "#1A1D27",
  surfaceHover: "#222533",
  border: "#2A2D3A",
  borderLight: "#353849",
  accent: "#6C5CE7",
  accentLight: "#8B7CF7",
  accentDim: "rgba(108, 92, 231, 0.15)",
  accentSubtle: "rgba(108, 92, 231, 0.06)",
  green: "#00D68F",
  greenDim: "rgba(0, 214, 143, 0.15)",
  yellow: "#FFB800",
  yellowDim: "rgba(255, 184, 0, 0.12)",
  yellowSubtle: "rgba(255, 184, 0, 0.04)",
  red: "#FF6B6B",
  redDim: "rgba(255, 107, 107, 0.12)",
  redSubtle: "rgba(255, 107, 107, 0.04)",
  text: "#E8E9ED",
  textSecondary: "#8B8D98",
  textDim: "#838591", // bumped from #5C5E6A for WCAG AA (≥4.5:1 on surface)
  blue: "#4DABF7",
  blueDim: "rgba(77, 171, 247, 0.12)",
  grayDim: "rgba(139, 141, 152, 0.15)",
  white: "#FFFFFF",
  black: "#000000",
};

// ============================================================
// Mock Data
// ============================================================

const PROJECTS = [
  {
    id: "acme",
    name: "Acme Corp",
    icon: "🏢",
    color: "#6C5CE7",
    sharedTools: ["Google Ads", "Slack", "HubSpot"],
    agents: [
      { id: "ad-guardian", name: "Ad Spend Guardian", status: "attention", statusText: "Budget reallocation needs approval", lastRun: "2h ago", skills: 2, lessons: 14, confidence: 78 },
      { id: "content-sched", name: "Content Scheduler", status: "attention", statusText: "3 posts ready for review", lastRun: "1h ago", skills: 3, lessons: 8, confidence: 62 },
      { id: "lead-qual", name: "Lead Qualifier", status: "running", statusText: "All clear", lastRun: "1h ago", skills: 2, lessons: 21, confidence: 88 },
    ],
    attentionCount: 2,
  },
  {
    id: "brightside",
    name: "Brightside Health",
    icon: "🏥",
    color: "#00D68F",
    sharedTools: ["Meta Ads", "Slack", "GA4"],
    agents: [
      { id: "meta-optimizer", name: "Meta Ad Optimizer", status: "running", statusText: "All clear", lastRun: "30m ago", skills: 3, lessons: 32, confidence: 91 },
      { id: "funnel-monitor", name: "Funnel Monitor", status: "running", statusText: "All clear", lastRun: "2h ago", skills: 2, lessons: 15, confidence: 74 },
    ],
    attentionCount: 0,
  },
  {
    id: "internal",
    name: "Internal Ops",
    icon: "⚙️",
    color: "#FFB800",
    sharedTools: ["Jira", "Slack", "GitHub"],
    agents: [
      { id: "invoice-tracker", name: "Invoice Tracker", status: "running", statusText: "All clear", lastRun: "30m ago", skills: 1, lessons: 5, confidence: 55 },
      { id: "competitor-mon", name: "Competitor Monitor", status: "attention", statusText: "New competitor detected", lastRun: "6h ago", skills: 2, lessons: 11, confidence: 69 },
    ],
    attentionCount: 1,
  },
];

// ============================================================
// Shared Components
// ============================================================

function Badge({ color, children }) {
  const colorMap = {
    green: { bg: COLORS.greenDim, text: COLORS.green },
    yellow: { bg: COLORS.yellowDim, text: COLORS.yellow },
    accent: { bg: COLORS.accentDim, text: COLORS.accentLight },
    red: { bg: COLORS.redDim, text: COLORS.red },
    gray: { bg: COLORS.grayDim, text: COLORS.textSecondary },
    blue: { bg: COLORS.blueDim, text: COLORS.blue },
  };
  const c = colorMap[color] || colorMap.gray;
  return (
    <span style={{ display: "inline-block", padding: "4px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, background: c.bg, color: c.text, letterSpacing: 0.3 }}>
      {children}
    </span>
  );
}

function Button({ variant = "primary", size = "md", children, onClick, style }) {
  const base = { border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontFamily: "inherit", transition: "all 0.15s ease", display: "inline-flex", alignItems: "center", gap: 8 };
  const sizes = { sm: { padding: "8px 12px", fontSize: 13 }, md: { padding: "12px 24px", fontSize: 14 }, lg: { padding: "12px 32px", fontSize: 15 } };
  const variants = {
    primary: { background: COLORS.accent, color: COLORS.white },
    secondary: { background: COLORS.surfaceHover, color: COLORS.text, border: `1px solid ${COLORS.border}` },
    ghost: { background: "transparent", color: COLORS.textSecondary },
    success: { background: COLORS.green, color: COLORS.black },
  };
  return (
    <button onClick={onClick} style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      onMouseEnter={(e) => (e.target.style.opacity = 0.85)} onMouseLeave={(e) => (e.target.style.opacity = 1)}>
      {children}
    </button>
  );
}

function Card({ children, style, onClick }) {
  return (
    <div onClick={onClick} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 20, cursor: onClick ? "pointer" : "default", transition: "border-color 0.15s ease", ...style }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.borderColor = COLORS.borderLight)}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.borderColor = COLORS.border)}>
      {children}
    </div>
  );
}

function ProgressBar({ value, color = COLORS.accent, style }) {
  return (
    <div style={{ height: 8, background: COLORS.surfaceHover, borderRadius: 99, overflow: "hidden", ...style }}>
      <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 99, transition: "width 0.15s ease" }} />
    </div>
  );
}

function MiniConfidence({ value }) {
  const color = value >= 80 ? COLORS.green : value >= 60 ? COLORS.yellow : COLORS.textSecondary;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <div style={{ width: 40, height: 4, background: COLORS.surfaceHover, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${value}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ color: COLORS.textDim }}>{value}%</span>
    </div>
  );
}

// ============================================================
// Cross-Project Homepage
// ============================================================

function Homepage({ projects, onSelectProject }) {
  const totalAgents = projects.reduce((s, p) => s + p.agents.length, 0);
  const totalAttention = projects.reduce((s, p) => s + p.attentionCount, 0);
  const totalLessons = projects.reduce((s, p) => s + p.agents.reduce((a, ag) => a + ag.lessons, 0), 0);
  const avgConfidence = Math.round(
    projects.reduce((s, p) => s + p.agents.reduce((a, ag) => a + ag.confidence, 0), 0) / totalAgents
  );

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      {/* Top navbar — full width */}
      <div style={{
        padding: "16px 48px", display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 24, color: COLORS.accent }}>✦</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: COLORS.text, letterSpacing: -0.3 }}>Nochore</span>
        </div>
        <Button size="sm" onClick={() => {}}>+ New project</Button>
      </div>

      {/* Main content — centered with max width */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 48px" }}>
        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 28, fontWeight: 600, color: COLORS.text, margin: 0 }}>Good morning, Chau Shyang.</h1>
          <p style={{ fontSize: 15, color: COLORS.textSecondary, marginTop: 8, marginBottom: 0 }}>
            {totalAttention > 0
              ? `${totalAttention} item${totalAttention === 1 ? "" : "s"} across your projects need attention.`
              : "All clear — your agents are running smoothly."}
          </p>
        </div>

        {/* Global stats bar */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 32 }}>
          {[
            { label: "Projects", value: projects.length, color: COLORS.accent },
            { label: "Agents", value: totalAgents, color: COLORS.blue },
            { label: "Lessons learned", value: totalLessons, color: COLORS.green },
            { label: "Avg confidence", value: `${avgConfidence}%`, color: avgConfidence >= 75 ? COLORS.green : COLORS.yellow },
          ].map((s) => (
            <Card key={s.label} style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{s.label}</div>
            </Card>
          ))}
        </div>

        {/* Needs attention */}
        {totalAttention > 0 && (
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
              Needs attention
            </div>
            {projects.filter((p) => p.attentionCount > 0).map((proj) => (
              <Card key={proj.id} onClick={() => onSelectProject(proj.id)}
                style={{ marginBottom: 8, cursor: "pointer", borderLeft: `3px solid ${COLORS.yellow}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 20 }}>{proj.icon}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{proj.name}</div>
                      <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>
                        {proj.agents.filter((a) => a.status === "attention").map((a) => a.statusText).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge color="yellow">{proj.attentionCount}</Badge>
                    <span style={{ color: COLORS.textDim, fontSize: 18 }}>→</span>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* All projects grid */}
        <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
          All projects
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
          {projects.map((proj) => {
            const projLessons = proj.agents.reduce((s, a) => s + a.lessons, 0);
            const projConfidence = Math.round(proj.agents.reduce((s, a) => s + a.confidence, 0) / proj.agents.length);
            return (
              <Card key={proj.id} onClick={() => onSelectProject(proj.id)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ fontSize: 24, width: 40, height: 40, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", background: `${proj.color}18` }}>{proj.icon}</span>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{proj.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{proj.agents.length} agents · {proj.sharedTools.length} conn</div>
                    </div>
                  </div>
                  {proj.attentionCount > 0 && (
                    <span style={{ width: 24, height: 24, borderRadius: 99, background: COLORS.yellow, color: COLORS.black, fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {proj.attentionCount}
                    </span>
                  )}
                </div>

                {/* Agent mini-list */}
                <div style={{ marginBottom: 16 }}>
                  {proj.agents.map((agent) => (
                    <div key={agent.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 13, color: COLORS.textSecondary }}>
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: agent.status === "attention" ? COLORS.yellow : COLORS.green, flexShrink: 0 }} />
                      <span>{agent.name}</span>
                    </div>
                  ))}
                </div>

                {/* Project health footer */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: `1px solid ${COLORS.border}` }}>
                  <Badge color="gray">{projLessons} lessons</Badge>
                  <MiniConfidence value={projConfidence} />
                </div>
              </Card>
            );
          })}

          {/* New project card */}
          <Card onClick={() => {}} style={{ cursor: "pointer", borderStyle: "dashed", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 180 }}>
            <div style={{ textAlign: "center" }}>
              <span style={{ fontSize: 28, color: COLORS.accent }}>+</span>
              <div style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 8 }}>New project</div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Project Sidebar (only visible inside a project workspace)
// ============================================================

function ProjectSidebar({ project, activeAgentId, onSelectAgent, onGoHome, onNewAgent }) {
  return (
    <div style={{
      width: 260, background: COLORS.surface, borderRight: `1px solid ${COLORS.border}`,
      display: "flex", flexDirection: "column", height: "100vh", position: "fixed", left: 0, top: 0, zIndex: 20,
    }}>
      {/* Back to projects */}
      <div onClick={onGoHome}
        style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 8, borderBottom: `1px solid ${COLORS.border}`, cursor: "pointer" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <span style={{ fontSize: 16, color: COLORS.textSecondary }}>←</span>
        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>All projects</span>
      </div>

      {/* Project header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 20, width: 32, height: 32, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", background: `${project.color}18` }}>{project.icon}</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.text }}>{project.name}</div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{project.agents.length} agents · {project.sharedTools.length} conn</div>
          </div>
        </div>
      </div>

      {/* Agent list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 8px" }}>
        <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, padding: "4px 12px", marginBottom: 4 }}>
          Agents
        </div>
        {project.agents.map((agent) => {
          const isActive = agent.id === activeAgentId;
          return (
            <div key={agent.id} onClick={() => onSelectAgent(agent.id)}
              style={{
                padding: "10px 12px", borderRadius: 8, cursor: "pointer", marginBottom: 2,
                background: isActive ? COLORS.accentDim : "transparent",
                transition: "background 0.15s ease",
              }}
              onMouseEnter={(e) => !isActive && (e.currentTarget.style.background = COLORS.surfaceHover)}
              onMouseLeave={(e) => !isActive && (e.currentTarget.style.background = "transparent")}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: agent.status === "attention" ? COLORS.yellow : COLORS.green, flexShrink: 0 }} />
                <span style={{ fontSize: 14, fontWeight: isActive ? 600 : 400, color: isActive ? COLORS.text : COLORS.textSecondary, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agent.name}</span>
              </div>
              {agent.status === "attention" && (
                <div style={{ fontSize: 12, color: COLORS.yellow, marginTop: 4, marginLeft: 15 }}>{agent.statusText}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: "12px 14px", borderTop: `1px solid ${COLORS.border}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <Button onClick={onNewAgent} size="md" style={{ width: "100%", justifyContent: "center" }}>+ New agent</Button>
      </div>
    </div>
  );
}

// ============================================================
// Project Home (agents grouped inside a project)
// ============================================================

function ProjectHome({ project, onSelectAgent, onSelectTab }) {
  const [projectTab, setProjectTab] = useState("agents");
  const needsAttention = project.agents.filter((a) => a.status === "attention");
  const running = project.agents.filter((a) => a.status === "running");

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
              onMouseEnter={(e) => e.currentTarget.querySelector('.arrow').style.color = COLORS.text}
              onMouseLeave={(e) => e.currentTarget.querySelector('.arrow').style.color = COLORS.textDim}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{agent.name}</div>
                <div style={{ fontSize: 13, color: COLORS.yellow, marginTop: 1 }}>{agent.statusText}</div>
              </div>
              <span className="arrow" style={{ color: COLORS.textDim, fontSize: 18, transition: "color 0.15s" }}>→</span>
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

// ============================================================
// Project Connections Manager
// ============================================================

function ProjectConnections({ project }) {
  const [expandedConn, setExpandedConn] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const connections = [
    {
      id: "google-ads",
      name: "Google Ads",
      icon: "📊",
      status: "healthy",
      lastUsed: "2 hours ago",
      connectedAt: "Jan 15, 2026",
      authType: "OAuth 2.0",
      account: { name: "Acme Corp MCC", id: "123-456-7890", type: "Manager Account" },
      subAccounts: [
        { id: "111-222-3333", name: "Acme - US", selected: true },
        { id: "111-222-4444", name: "Acme - EU", selected: true },
        { id: "111-222-5555", name: "Acme - APAC", selected: false },
      ],
      permissions: { level: "read-write", scopes: ["campaigns.read", "campaigns.write", "reports.read", "keywords.write"] },
      agentUsage: [
        { agent: "Ad Spend Guardian", permission: "read-write", lastUsed: "2h ago" },
        { agent: "Content Scheduler", permission: "read-only", lastUsed: "1h ago" },
      ],
      health: { uptime: "99.8%", lastCheck: "5 min ago", apiQuota: { used: 12400, limit: 50000 }, tokenExpiry: "Auto-refreshed" },
    },
    {
      id: "slack",
      name: "Slack",
      icon: "💬",
      status: "healthy",
      lastUsed: "1 hour ago",
      connectedAt: "Jan 15, 2026",
      authType: "OAuth 2.0",
      account: { name: "Acme Workspace", id: "T0123ACME", type: "Workspace" },
      subAccounts: null,
      permissions: { level: "write", scopes: ["chat:write", "channels:read"] },
      agentUsage: [
        { agent: "Ad Spend Guardian", permission: "write", lastUsed: "2h ago" },
        { agent: "Lead Qualifier", permission: "write", lastUsed: "1h ago" },
      ],
      health: { uptime: "100%", lastCheck: "3 min ago", apiQuota: { used: 340, limit: 10000 }, tokenExpiry: "Auto-refreshed" },
    },
    {
      id: "hubspot",
      name: "HubSpot",
      icon: "🟠",
      status: "warning",
      lastUsed: "6 hours ago",
      connectedAt: "Feb 2, 2026",
      authType: "API Key",
      account: { name: "Acme CRM", id: "hub-acme-001", type: "CRM Portal" },
      subAccounts: null,
      permissions: { level: "read-only", scopes: ["contacts.read", "deals.read"] },
      agentUsage: [
        { agent: "Lead Qualifier", permission: "read-only", lastUsed: "6h ago" },
      ],
      health: { uptime: "94.2%", lastCheck: "8 min ago", apiQuota: { used: 48200, limit: 50000 }, tokenExpiry: "API key (no expiry)", warning: "API quota at 96% — agents may be throttled soon" },
    },
  ];

  const statusConfig = {
    healthy: { color: COLORS.green, label: "Healthy", bg: COLORS.greenDim },
    warning: { color: COLORS.yellow, label: "Warning", bg: COLORS.yellowDim },
    error: { color: COLORS.red, label: "Disconnected", bg: COLORS.redDim },
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 600, color: COLORS.text, margin: 0 }}>Connections</h2>
          <p style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Shared across all agents in {project.icon} {project.name}
          </p>
        </div>
        <Button size="sm" onClick={() => setShowAddModal(!showAddModal)}>+ Add connection</Button>
      </div>

      {/* Add connection modal */}
      {showAddModal && (
        <Card style={{ marginBottom: 16, borderColor: COLORS.accent }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 12 }}>Connect a new service</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {[
              { icon: "📊", name: "Google Ads", type: "OAuth" },
              { icon: "📱", name: "Meta Ads", type: "OAuth" },
              { icon: "💬", name: "Slack", type: "OAuth" },
              { icon: "📈", name: "GA4", type: "OAuth" },
              { icon: "🟠", name: "HubSpot", type: "API Key" },
              { icon: "🛒", name: "Shopify", type: "OAuth" },
              { icon: "💳", name: "Stripe", type: "API Key" },
              { icon: "📋", name: "Jira", type: "OAuth" },
              { icon: "🔍", name: "Search Console", type: "OAuth" },
            ].map((svc) => (
              <div key={svc.name} style={{
                padding: "10px 12px", borderRadius: 8, background: COLORS.surfaceHover, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8, transition: "background 0.15s",
              }}
                onMouseEnter={(e) => e.currentTarget.style.background = COLORS.border}
                onMouseLeave={(e) => e.currentTarget.style.background = COLORS.surfaceHover}
              >
                <span style={{ fontSize: 18 }}>{svc.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{svc.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textDim }}>{svc.type}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim }}>
            500+ integrations available via Composio · <span style={{ color: COLORS.accentLight, cursor: "pointer" }}>Browse all →</span>
          </div>
        </Card>
      )}

      {/* Connection list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {connections.map((conn) => {
          const status = statusConfig[conn.status];
          const isExpanded = expandedConn === conn.id;

          return (
            <Card key={conn.id} style={{ padding: 0, overflow: "hidden" }}>
              {/* Connection header — always visible */}
              <div
                onClick={() => setExpandedConn(isExpanded ? null : conn.id)}
                style={{ padding: "16px 24px", cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}
              >
                <span style={{ fontSize: 24 }}>{conn.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.text }}>{conn.name}</span>
                    <span style={{ width: 8, height: 8, borderRadius: 99, background: status.color }} />
                    <span style={{ fontSize: 12, color: status.color }}>{status.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>
                    {conn.account.name} · {conn.account.id} · Last used {conn.lastUsed}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Badge color={conn.permissions.level === "read-write" ? "accent" : conn.permissions.level === "write" ? "blue" : "gray"}>
                    {conn.permissions.level}
                  </Badge>
                  <span style={{ color: COLORS.textDim, transform: isExpanded ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: "16px 24px" }}>
                  {/* Health warning */}
                  {conn.health.warning && (
                    <div style={{ padding: "10px 14px", background: COLORS.yellowDim, borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14 }}>⚠️</span>
                      <span style={{ fontSize: 13, color: COLORS.yellow }}>{conn.health.warning}</span>
                    </div>
                  )}

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
                    {/* Health stats */}
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Health</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Uptime</span>
                          <span style={{ color: COLORS.text, fontWeight: 600 }}>{conn.health.uptime}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Last health check</span>
                          <span style={{ color: COLORS.text }}>{conn.health.lastCheck}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Token</span>
                          <span style={{ color: COLORS.text }}>{conn.health.tokenExpiry}</span>
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ color: COLORS.textSecondary }}>API quota</span>
                            <span style={{ color: conn.health.apiQuota.used / conn.health.apiQuota.limit > 0.9 ? COLORS.yellow : COLORS.text }}>
                              {(conn.health.apiQuota.used / 1000).toFixed(1)}k / {(conn.health.apiQuota.limit / 1000).toFixed(0)}k
                            </span>
                          </div>
                          <ProgressBar
                            value={(conn.health.apiQuota.used / conn.health.apiQuota.limit) * 100}
                            color={conn.health.apiQuota.used / conn.health.apiQuota.limit > 0.9 ? COLORS.yellow : COLORS.accent}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Connection details */}
                    <div>
                      <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>Details</div>
                      <div style={{ display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Auth type</span>
                          <span style={{ color: COLORS.text }}>{conn.authType}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Account type</span>
                          <span style={{ color: COLORS.text }}>{conn.account.type}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Connected</span>
                          <span style={{ color: COLORS.text }}>{conn.connectedAt}</span>
                        </div>
                        <div style={{ fontSize: 13 }}>
                          <span style={{ color: COLORS.textSecondary }}>Scopes: </span>
                          <span style={{ color: COLORS.textDim }}>{conn.permissions.scopes.join(", ")}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sub-accounts (the "which account?" problem) */}
                  {conn.subAccounts && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                        Sub-accounts
                      </div>
                      <div style={{ background: COLORS.bg, borderRadius: 8, padding: 12 }}>
                        {conn.subAccounts.map((sub) => (
                          <div key={sub.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 4px", borderBottom: `1px solid ${COLORS.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                              <div style={{
                                width: 20, height: 20, borderRadius: 4,
                                border: `2px solid ${sub.selected ? COLORS.accent : COLORS.borderLight}`,
                                background: sub.selected ? COLORS.accent : "transparent",
                                display: "flex", alignItems: "center", justifyContent: "center",
                                fontSize: 12, color: COLORS.white, cursor: "pointer",
                              }}>
                                {sub.selected ? "✓" : ""}
                              </div>
                              <div>
                                <div style={{ fontSize: 13, color: COLORS.text }}>{sub.name}</div>
                                <div style={{ fontSize: 12, color: COLORS.textDim }}>{sub.id}</div>
                              </div>
                            </div>
                            {sub.selected && <Badge color="green">Active</Badge>}
                          </div>
                        ))}
                        <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8, fontStyle: "italic" }}>
                          Agents will only access data from selected sub-accounts
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Per-agent permission overrides */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>
                      Agent access
                    </div>
                    <div style={{ background: COLORS.bg, borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 0, padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}` }}>
                        <span style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase" }}>Agent</span>
                        <span style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", textAlign: "center", width: 100 }}>Permission</span>
                        <span style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", textAlign: "right", width: 80 }}>Last used</span>
                      </div>
                      {conn.agentUsage.map((usage) => (
                        <div key={usage.agent} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 0, padding: "10px 12px", borderBottom: `1px solid ${COLORS.border}`, alignItems: "center" }}>
                          <span style={{ fontSize: 13, color: COLORS.text }}>{usage.agent}</span>
                          <div style={{ textAlign: "center", width: 100 }}>
                            <Badge color={usage.permission === "read-write" ? "accent" : usage.permission === "write" ? "blue" : "gray"}>
                              {usage.permission}
                            </Badge>
                          </div>
                          <span style={{ fontSize: 12, color: COLORS.textDim, textAlign: "right", width: 80 }}>{usage.lastUsed}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 8, fontStyle: "italic" }}>
                      Override default permissions per agent in agent settings
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: "flex", gap: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.border}` }}>
                    <Button size="sm" variant="secondary">Reconnect</Button>
                    <Button size="sm" variant="secondary">Edit scopes</Button>
                    <Button size="sm" variant="ghost" style={{ color: COLORS.red, marginLeft: "auto" }}>Disconnect</Button>
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// Agent Detail: Feed
// ============================================================

function InsightFeed() {
  const [expandedReasoning, setExpandedReasoning] = useState(null);
  const [approved, setApproved] = useState({});
  const [dismissed, setDismissed] = useState({});

  const insights = [
    {
      id: "budget", tier: "input", title: "Budget Reallocation Opportunity",
      summary: 'Campaign "Brand - Exact" is spending $340/day at $12 CPL. Campaign "Generic - Broad" is capped at $100/day at $8 CPL.',
      recommendation: "Move $80/day from Brand → Generic. Expected impact: ~6 more conversions/week.",
      reasoning: [
        "Generic has maintained $8 CPL even at higher spend (tested $150/day in Jan)",
        "Generic is losing 42% impression share due to budget — untapped demand",
        "Brand already captures 91% of available impressions",
      ],
      policy: 'Your policy: "Always ask for budget changes"', time: "2 hours ago",
    },
    {
      id: "negatives", tier: "auto", title: "Added 12 Negative Keywords",
      summary: "Found search terms burning ~$45/day with 0 conversions over 14 days.",
      items: [
        { term: "free marketing tools", cost: "$12/day", conv: "0" },
        { term: "marketing degree online", cost: "$9/day", conv: "0" },
        { term: "what is digital marketing", cost: "$8/day", conv: "0" },
      ],
      policy: "Per your policy: auto-add negatives ✓", time: "2 hours ago",
    },
    {
      id: "snapshot", tier: "fyi", title: "Weekly Performance Snapshot",
      metrics: [
        { label: "CPL", value: "$14.20", change: "↓ 8%", good: true },
        { label: "Spend", value: "$2,840", change: "On pace", good: true },
        { label: "Conversions", value: "200", change: "↑ 12%", good: true },
      ],
      summary2: "Nothing unusual. Your agent is watching.", time: "6 hours ago",
    },
  ];

  const tierConfig = {
    input: { color: "yellow", label: "NEEDS YOUR INPUT", icon: "🟡" },
    auto: { color: "green", label: "AUTO-HANDLED", icon: "✅" },
    fyi: { color: "gray", label: "FYI", icon: "📊" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {insights.map((insight) => {
        const tier = tierConfig[insight.tier];
        const isApproved = approved[insight.id];
        const isDismissed = dismissed[insight.id];

        return (
          <Card key={insight.id} style={{ opacity: isDismissed ? 0.5 : 1, transition: "opacity 0.15s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <Badge color={tier.color}>{tier.icon} {tier.label}</Badge>
              <span style={{ fontSize: 12, color: COLORS.textDim }}>{insight.time}</span>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, margin: "0 0 8px 0" }}>{insight.title}</h3>
            <p style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.6, margin: 0 }}>{insight.summary}</p>

            {insight.recommendation && (
              <div style={{ marginTop: 16, padding: 16, background: COLORS.accentDim, borderRadius: 8, borderLeft: `3px solid ${COLORS.accent}` }}>
                <div style={{ fontSize: 12, color: COLORS.accentLight, fontWeight: 600, marginBottom: 4 }}>MY RECOMMENDATION</div>
                <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.5 }}>{insight.recommendation}</div>
              </div>
            )}

            {insight.reasoning && (
              <div style={{ marginTop: 12 }}>
                <div onClick={() => setExpandedReasoning(expandedReasoning === insight.id ? null : insight.id)}
                  style={{ fontSize: 13, color: COLORS.accentLight, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ transform: expandedReasoning === insight.id ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
                  Why I think this
                </div>
                {expandedReasoning === insight.id && (
                  <div style={{ marginTop: 8, paddingLeft: 4 }}>
                    {insight.reasoning.map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                        <span style={{ color: COLORS.textDim, fontSize: 13 }}>{i === insight.reasoning.length - 1 ? "└" : "├"}</span>
                        <span style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5 }}>{r}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {insight.items && (
              <div style={{ marginTop: 12 }}>
                {insight.items.map((item, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: i < insight.items.length - 1 ? `1px solid ${COLORS.border}` : "none", fontSize: 13 }}>
                    <span style={{ color: COLORS.text }}>"{item.term}"</span>
                    <div style={{ display: "flex", gap: 16, color: COLORS.textSecondary }}>
                      <span>{item.cost}</span>
                      <span style={{ color: COLORS.red }}>{item.conv} conv</span>
                    </div>
                  </div>
                ))}
                <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 8 }}>...and 9 more</div>
              </div>
            )}

            {insight.metrics && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
                {insight.metrics.map((m) => (
                  <div key={m.label} style={{ textAlign: "center", padding: 12, background: COLORS.bg, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 4 }}>{m.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: COLORS.text }}>{m.value}</div>
                    <div style={{ fontSize: 12, color: m.good ? COLORS.green : COLORS.red, marginTop: 2 }}>{m.change}</div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>{insight.policy}</span>
              <div style={{ display: "flex", gap: 8 }}>
                {insight.tier === "input" && !isApproved && !isDismissed && (
                  <>
                    <Button size="sm" onClick={() => setApproved((p) => ({ ...p, [insight.id]: true }))}>Approve</Button>
                    <Button size="sm" variant="ghost" onClick={() => setDismissed((p) => ({ ...p, [insight.id]: true }))}>Dismiss</Button>
                  </>
                )}
                {isApproved && <Badge color="green">✓ Approved</Badge>}
                {isDismissed && <Badge color="gray">Dismissed</Badge>}
                {insight.tier === "auto" && <Button size="sm" variant="ghost">Undo</Button>}
                {insight.tier === "fyi" && <Button size="sm" variant="ghost">Full report</Button>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ============================================================
// Agent Detail: Chat
// ============================================================

function AgentChat() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState([
    {
      from: "agent",
      text: "I noticed a budget reallocation opportunity. Campaign \"Generic - Broad\" could use more budget. Want me to walk you through my reasoning?",
    },
    { from: "user", text: "Why do you think Generic will convert better with more budget?" },
    {
      from: "agent",
      text: "Three reasons:\n\n1. Historical data shows Generic maintains its $8 CPL even during high-spend periods (we tested $150/day in January).\n\n2. Impression share data shows 42% of available searches aren't being shown — that's untapped demand, not just more spend on the same audience.\n\n3. The search terms feeding Generic are high intent (\"buy marketing software\", \"marketing tool pricing\") — these aren't window shoppers.",
      followUp: "Want me to run this as a 7-day experiment instead of a permanent change?",
    },
  ]);

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, { from: "user", text: input }]);
    setInput("");
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          from: "agent",
          text: "Good thinking. I'll set up a 7-day experiment: increase Generic budget by $80/day starting Monday. I'll track CPL, conversion volume, and impression share daily. If CPL rises above $10, I'll pause the experiment early.\n\nI'll send you a mid-week check-in on Wednesday and a full report next Monday.",
          followUp: "Should I go ahead and set this up?",
        },
      ]);
    }, 800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)" }}>
      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16, paddingBottom: 16 }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display: "flex", justifyContent: msg.from === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "80%",
              padding: 16,
              borderRadius: msg.from === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
              background: msg.from === "user" ? COLORS.accent : COLORS.surface,
              border: msg.from === "agent" ? `1px solid ${COLORS.border}` : "none",
              color: COLORS.text,
              fontSize: 14,
              lineHeight: 1.6,
            }}>
              {msg.from === "agent" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: COLORS.accent }}>✦</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: COLORS.accentLight }}>Ad Spend Guardian</span>
                </div>
              )}
              <div style={{ whiteSpace: "pre-wrap" }}>{msg.text}</div>
              {msg.followUp && (
                <div style={{ marginTop: 12, padding: "10px 12px", background: COLORS.accentDim, borderRadius: 8, fontSize: 13, color: COLORS.accentLight }}>
                  {msg.followUp}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{ padding: "12px 0 0", borderTop: `1px solid ${COLORS.border}` }}>
        <div style={{
          display: "flex", gap: 8, background: COLORS.surface, border: `1px solid ${COLORS.border}`,
          borderRadius: 12, padding: "10px 14px", alignItems: "flex-end",
        }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder="Ask your agent anything..."
            rows={1}
            style={{
              flex: 1, background: "transparent", border: "none", color: COLORS.text,
              fontSize: 14, resize: "none", outline: "none", fontFamily: "inherit", lineHeight: 1.5,
            }}
          />
          <Button size="sm" onClick={handleSend} style={{ flexShrink: 0 }}>Send</Button>
        </div>
        <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 8, textAlign: "center" }}>
          Agent has access to: campaign data, search terms, memory (14 lessons), your policies
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Agent Detail: Memory
// ============================================================

function MemoryTimeline() {
  const events = [
    {
      week: "This week",
      items: [
        { type: "lesson", icon: "💡", date: "Mar 18", title: "Weekend budgets don't convert", body: "Weekend budget increases on Generic don't convert — CPL rises 40% on Sat/Sun. Now excluding weekends from budget recommendations.", evidence: "Experiment #12 (Mar 8–15)" },
        { type: "experiment", icon: "🧪", date: "Mar 15", title: "Tested +$50/day on Generic weekends", body: "Result: CPL rose from $8 → $11.20", verdict: { success: false, label: "Not effective" } },
      ],
    },
    {
      week: "Last week",
      items: [
        { type: "lesson", icon: "💡", date: "Mar 10", title: '"Free" = non-buyer intent', body: 'Search terms containing "free" almost always indicate non-buyer intent. Now flagging "free" terms at higher priority.', evidence: '23 "free" terms analyzed, 0 conversions' },
        { type: "outcome", icon: "✅", date: "Mar 9", title: "Budget reallocation succeeded", body: "Moved $80/day from Brand → Generic. Result: +8 conversions/week, CPL held at $8.40", verdict: { success: true, label: "Kept change" } },
      ],
    },
    {
      week: "Week of Mar 1",
      items: [
        { type: "lesson", icon: "💡", date: "Mar 4", title: "Broad match needs tighter negatives", body: "Broad match campaigns generate 3x more irrelevant terms than phrase match.", evidence: "142 search terms analyzed" },
        { type: "outcome", icon: "✅", date: "Mar 2", title: "First negative keyword batch worked", body: "Removed 18 wasteful terms. Saved $32/day, no impact on conversions.", verdict: { success: true, label: "Successful" } },
      ],
    },
  ];

  return (
    <div>
      {/* Trust score */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Agent Confidence</div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 2 }}>14 lessons learned over 6 weeks</div>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, color: COLORS.accentLight }}>78%</div>
        </div>
        <ProgressBar value={78} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 16 }}>
          {[
            { val: "23", label: "Actions proposed" },
            { val: "91%", label: "Approval rate", color: COLORS.green },
            { val: "82%", label: "Positive outcomes", color: COLORS.green },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: m.color || COLORS.text }}>{m.val}</div>
              <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{m.label}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Trust upgrade */}
      <Card style={{ marginBottom: 20, borderColor: COLORS.accent, background: COLORS.accentDim }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 20 }}>🔔</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Your agent has earned more trust</div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5, marginBottom: 12 }}>
              You approved 21 of 23 budget recommendations (91%), and 18 had positive outcomes. Let it handle small changes (under $50/day) automatically?
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm">Yes, increase autonomy</Button>
              <Button size="sm" variant="ghost">Not yet</Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Timeline */}
      {events.map((group) => (
        <div key={group.week} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12, paddingLeft: 20 }}>
            {group.week}
          </div>
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: COLORS.border }} />
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {group.items.map((item, i) => (
                <div key={i} style={{ display: "flex", gap: 16, position: "relative" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 99, background: COLORS.surface, border: `2px solid ${item.type === "lesson" ? COLORS.accent : COLORS.green}`, flexShrink: 0, marginTop: 4, zIndex: 1 }} />
                  <Card style={{ flex: 1, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span>{item.icon}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{item.title}</span>
                      <span style={{ fontSize: 12, color: COLORS.textDim, marginLeft: "auto" }}>{item.date}</span>
                    </div>
                    <p style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.5, margin: 0 }}>{item.body}</p>
                    {item.evidence && <div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 8 }}>Evidence: {item.evidence}</div>}
                    {item.verdict && (
                      <div style={{ marginTop: 8 }}>
                        <Badge color={item.verdict.success ? "green" : "red"}>{item.verdict.success ? "✓" : "✗"} {item.verdict.label}</Badge>
                      </div>
                    )}
                  </Card>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Setup Flow (Moment 1)
// ============================================================

function SetupFlow({ project, onComplete }) {
  const [step, setStep] = useState(0);
  const [text, setText] = useState("");
  const [showTemplates, setShowTemplates] = useState(true);
  const [skills, setSkills] = useState({ search: true, budget: true, trend: false });
  const [connections, setConnections] = useState({ google: false, slack: false });
  const [policies, setPolicies] = useState({ negatives: "auto", budget: "tiered" });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedSubAccounts, setSelectedSubAccounts] = useState({ us: true, eu: true, apac: false });

  const templates = [
    { icon: "📊", name: "Ad Spend Manager", desc: "Monitor and optimize advertising budgets", apps: ["Google Ads", "Slack"], appIcons: ["📊", "💬"] },
    { icon: "🛒", name: "E-commerce Monitor", desc: "Track orders, inventory, and revenue", apps: ["Shopify", "Stripe", "Slack"], appIcons: ["🛒", "💳", "💬"] },
    { icon: "🔍", name: "Competitor Tracker", desc: "Watch competitor pricing and activity", apps: ["Web", "Slack"], appIcons: ["🌐", "💬"] },
  ];

  const skillList = [
    { key: "search", name: "Search Term Analysis", desc: "Detects wasteful search terms and suggests negatives", recommended: true },
    { key: "budget", name: "Budget Allocation", desc: "Spots over/under-spending across campaigns", recommended: true },
    { key: "trend", name: "Trend Forecasting", desc: "Predicts next-week performance trends", recommended: false },
  ];

  const toolList = [
    { key: "google", name: "Google Ads", icon: "📊", reason: "Pull campaign and search term data" },
    { key: "slack", name: "Slack", icon: "💬", reason: "Send alerts and recommendations" },
  ];

  const PolicyOption = ({ group, value, label, sublabel }) => (
    <div onClick={() => setPolicies((prev) => ({ ...prev, [group]: value }))}
      style={{
        display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 12px", borderRadius: 8, cursor: "pointer",
        background: policies[group] === value ? COLORS.accentDim : "transparent", transition: "background 0.15s ease",
      }}>
      <div style={{
        width: 20, height: 20, borderRadius: 99, border: `2px solid ${policies[group] === value ? COLORS.accent : COLORS.borderLight}`,
        background: policies[group] === value ? COLORS.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
      }}>
        {policies[group] === value && <div style={{ width: 8, height: 8, borderRadius: 99, background: COLORS.white }} />}
      </div>
      <div>
        <div style={{ fontSize: 14, color: COLORS.text, fontWeight: policies[group] === value ? 600 : 400 }}>{label}</div>
        {sublabel && <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{sublabel}</div>}
      </div>
    </div>
  );

  if (step === 0) {
    return (
      <div>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✦</div>
          <h2 style={{ color: COLORS.text, fontSize: 22, fontWeight: 600, margin: 0 }}>What do you want your agent to help with?</h2>
          {project && <p style={{ color: COLORS.textSecondary, marginTop: 8, fontSize: 14 }}>Adding to {project.icon} {project.name}</p>}
        </div>
        <div style={{ background: COLORS.surface, border: `1px solid ${text ? COLORS.accent : COLORS.border}`, borderRadius: 12, padding: 16, transition: "border-color 0.15s ease" }}>
          <textarea value={text} onChange={(e) => { setText(e.target.value); setShowTemplates(e.target.value.length === 0); }}
            placeholder="e.g. Monitor our Google Ads and flag budget waste..."
            rows={3} style={{ width: "100%", background: "transparent", border: "none", color: COLORS.text, fontSize: 15, lineHeight: 1.6, resize: "none", outline: "none", fontFamily: "inherit" }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <Button onClick={() => setStep(1)} variant={text ? "primary" : "secondary"}>Continue →</Button>
          </div>
        </div>
        {showTemplates && (
          <div style={{ marginTop: 28 }}>
            <p style={{ color: COLORS.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Or start from a template</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {templates.map((t) => (
                <Card key={t.name} onClick={() => { setText(t.desc); setShowTemplates(false); }} style={{ padding: 16, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 8, minHeight: 24 }}>
                    {t.appIcons.map((ai, idx) => (
                      <span key={idx} title={t.apps[idx]} style={{
                        width: 24, height: 24, borderRadius: 4, background: COLORS.surfaceHover,
                        display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12,
                      }}>{ai}</span>
                    ))}
                  </div>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{t.icon}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{t.name}</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>{t.desc}</div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === 1) {
    const allConnected = connections.google && connections.slack;
    const hasSubAccountSelection = Object.values(selectedSubAccounts).some(Boolean);

    // Scaffold status items
    const scaffoldItems = [
      { label: "Search Term Analysis", status: "ready", detail: "Detects wasteful terms, suggests negatives" },
      { label: "Budget Allocation", status: "ready", detail: "Spots over/under-spending across campaigns" },
      { label: "Google Ads", status: connections.google ? "ready" : "needs_action", detail: connections.google ? "Connected via project" : "Needs connection", actionLabel: "Connect" },
      { label: "Slack", status: connections.slack ? "ready" : "optional", detail: connections.slack ? "Connected for alerts" : "Optional — for sending alerts", actionLabel: "Connect" },
      { label: "Sub-accounts", status: connections.google ? (hasSubAccountSelection ? "ready" : "needs_action") : "blocked", detail: connections.google ? "Select which accounts to monitor" : "Connect Google Ads first" },
    ];

    return (
      <div>
        <p style={{ color: COLORS.accentLight, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>STEP 2 OF 3</p>
        <h2 style={{ color: COLORS.text, fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Here's what I'd set up for you</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>Based on your description, I've configured what I can and flagged what needs you.</p>

        {/* AI scaffold summary — chat-like presentation */}
        <Card style={{ marginBottom: 20, padding: 24, borderColor: COLORS.accent, background: COLORS.accentSubtle }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 14, color: COLORS.accent }}>✦</span>
            <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.accentLight }}>Agent Configuration</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {scaffoldItems.map((item) => {
              const isReady = item.status === "ready";
              const needsAction = item.status === "needs_action";
              const isOptional = item.status === "optional";
              const isBlocked = item.status === "blocked";
              return (
                <div key={item.label} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8,
                  background: needsAction ? COLORS.yellowDim : isBlocked ? COLORS.grayDim : "transparent",
                  border: needsAction ? `1px solid ${COLORS.yellowDim}` : "1px solid transparent",
                }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>
                    {isReady ? "✅" : needsAction ? "⚠️" : isOptional ? "○" : "🔒"}
                  </span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: isBlocked ? COLORS.textDim : COLORS.text }}>{item.label}</div>
                    <div style={{ fontSize: 12, color: isBlocked ? COLORS.textDim : COLORS.textSecondary, marginTop: 1 }}>{item.detail}</div>
                  </div>
                  {(needsAction || isOptional) && item.actionLabel && (
                    <Button size="sm" variant={needsAction ? "primary" : "secondary"}
                      onClick={() => {
                        if (item.label === "Google Ads") setConnections(p => ({ ...p, google: true }));
                        if (item.label === "Slack") setConnections(p => ({ ...p, slack: true }));
                      }}>
                      {item.actionLabel}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Sub-account picker — appears when Google Ads is connected */}
        {connections.google && (
          <Card style={{ marginBottom: 20, padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>⚠️</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Which accounts should I monitor?</span>
            </div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, marginBottom: 12 }}>
              Your Google Ads manager account has 3 sub-accounts. Select which ones this agent can access.
            </div>
            <div style={{ background: COLORS.bg, borderRadius: 8, padding: 8 }}>
              {[
                { key: "us", name: "Acme Corp — US", id: "111-222-3333" },
                { key: "eu", name: "Acme Corp — EU", id: "111-222-4444" },
                { key: "apac", name: "Acme Corp — APAC", id: "111-222-5555" },
              ].map((sub) => (
                <div key={sub.key}
                  onClick={() => setSelectedSubAccounts(p => ({ ...p, [sub.key]: !p[sub.key] }))}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 8px", cursor: "pointer",
                    borderBottom: `1px solid ${COLORS.border}`,
                  }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4,
                    border: `2px solid ${selectedSubAccounts[sub.key] ? COLORS.accent : COLORS.borderLight}`,
                    background: selectedSubAccounts[sub.key] ? COLORS.accent : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, color: COLORS.white, flexShrink: 0,
                  }}>
                    {selectedSubAccounts[sub.key] ? "✓" : ""}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: COLORS.text }}>{sub.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.textDim }}>{sub.id}</div>
                  </div>
                  {selectedSubAccounts[sub.key] && <Badge color="green">Active</Badge>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Skills detail — collapsed by default, expandable */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>
            Adjust skills
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {skillList.map((s) => (
              <Card key={s.key} onClick={() => setSkills((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
                style={{ padding: 12, display: "flex", alignItems: "center", gap: 12, cursor: "pointer", borderColor: skills[s.key] ? COLORS.accent : COLORS.border, background: skills[s.key] ? COLORS.accentDim : COLORS.surface }}>
                <div style={{ width: 20, height: 20, borderRadius: 4, border: `2px solid ${skills[s.key] ? COLORS.accent : COLORS.borderLight}`, background: skills[s.key] ? COLORS.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, color: COLORS.white }}>
                  {skills[s.key] ? "✓" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{s.name}</span>
                    {s.recommended && <Badge color="accent">Recommended</Badge>}
                  </div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 1 }}>{s.desc}</div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button variant="ghost" onClick={() => setStep(0)}>← Back</Button>
          <Button onClick={() => setStep(2)}>Set ground rules →</Button>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div>
        <p style={{ color: COLORS.accentLight, fontSize: 13, fontWeight: 600, marginBottom: 4 }}>STEP 3 OF 3</p>
        <h2 style={{ color: COLORS.text, fontSize: 20, fontWeight: 600, margin: "0 0 6px" }}>Before I start, a few ground rules</h2>
        <p style={{ color: COLORS.textSecondary, fontSize: 14, marginBottom: 20 }}>Set how much autonomy your agent has. You can always adjust these later.</p>

        {/* Negative keywords policy */}
        <Card style={{ marginBottom: 12, padding: 16 }}>
          <p style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>When I find wasteful search terms...</p>
          <PolicyOption group="negatives" value="auto" label="Add negative keywords automatically" sublabel="I'll handle it and keep you posted" />
          <PolicyOption group="negatives" value="ask" label="Show me first, I'll decide" />
          <PolicyOption group="negatives" value="notify" label="Add them, but notify me after" />
        </Card>

        {/* Budget policy — with tiered thresholds */}
        <Card style={{ marginBottom: 12, padding: 16 }}>
          <p style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 12 }}>For budget changes...</p>
          <PolicyOption group="budget" value="tiered" label="Smart thresholds" sublabel="Different rules based on amount" />
          <PolicyOption group="budget" value="ask" label="Always ask me first" sublabel="I'll propose, you approve" />
          <PolicyOption group="budget" value="never" label="Never touch budgets" />

          {/* Tiered breakdown — shows when "smart thresholds" is selected */}
          {policies.budget === "tiered" && (
            <div style={{ marginTop: 16, marginLeft: 28, padding: 16, background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
              <div style={{ fontSize: 12, color: COLORS.accentLight, fontWeight: 600, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Threshold rules
              </div>
              {[
                { range: "Under $50/day", action: "Auto-approve", color: COLORS.green, icon: "✅", desc: "Small changes, let the agent handle it" },
                { range: "$50 – $200/day", action: "Ask me first", color: COLORS.yellow, icon: "🟡", desc: "Medium changes, I'll review before executing" },
                { range: "Over $200/day", action: "Ask + explain reasoning", color: COLORS.red, icon: "🔴", desc: "Large changes, show full analysis" },
              ].map((tier, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0",
                  borderBottom: i < 2 ? `1px solid ${COLORS.border}` : "none",
                }}>
                  <span style={{ fontSize: 14, marginTop: 1 }}>{tier.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>{tier.range}</span>
                      <Badge color={tier.color === COLORS.green ? "green" : tier.color === COLORS.yellow ? "yellow" : "red"}>
                        {tier.action}
                      </Badge>
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 2 }}>{tier.desc}</div>
                  </div>
                </div>
              ))}
              <div style={{ marginTop: 12, fontSize: 12, color: COLORS.textDim, fontStyle: "italic" }}>
                Thresholds are customizable after setup
              </div>
            </div>
          )}
        </Card>

        {/* Global override */}
        <Card style={{ marginBottom: 16, padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Require approval for ALL actions</div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary, marginTop: 4 }}>Override all policies — nothing runs without your OK</div>
          </div>
          <div style={{
            width: 48, height: 24, borderRadius: 99, background: COLORS.border, cursor: "pointer",
            display: "flex", alignItems: "center", padding: 4, transition: "background 0.15s ease",
          }}>
            <div style={{ width: 16, height: 16, borderRadius: 99, background: COLORS.textSecondary, transition: "transform 0.15s ease" }} />
          </div>
        </Card>

        {/* Advanced settings */}
        <div onClick={() => setShowAdvanced(!showAdvanced)}
          style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.textSecondary, fontSize: 13, cursor: "pointer", marginBottom: 16, padding: "4px 0" }}>
          <span style={{ transform: showAdvanced ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s ease", display: "inline-block" }}>▶</span>
          Advanced settings
        </div>

        {showAdvanced && (
          <Card style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Max total budget change / day</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>$ 500</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Check frequency</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>Every 6 hours</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Active hours</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>9am – 6pm EST</div>
              </div>
              <div>
                <label style={{ fontSize: 12, color: COLORS.textSecondary, display: "block", marginBottom: 8 }}>Notify via</label>
                <div style={{ padding: "8px 12px", background: COLORS.bg, border: `1px solid ${COLORS.border}`, borderRadius: 8, color: COLORS.text, fontSize: 14 }}>Slack + In-app</div>
              </div>
            </div>
          </Card>
        )}

        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <Button variant="ghost" onClick={() => setStep(1)}>← Back</Button>
          <Button onClick={() => setStep(3)}>Launch agent →</Button>
        </div>
      </div>
    );
  }

  // Step 3: Complete
  return (
    <div style={{ textAlign: "center", paddingTop: 40 }}>
      <div style={{ fontSize: 56, marginBottom: 16 }}>✦</div>
      <h2 style={{ color: COLORS.text, fontSize: 24, fontWeight: 600, margin: 0 }}>Your agent is live</h2>
      <p style={{ color: COLORS.textSecondary, marginTop: 8, fontSize: 15, lineHeight: 1.6 }}>
        Ad Spend Guardian is now monitoring your campaigns.
        {project && <><br />Added to {project.icon} {project.name}</>}
      </p>

      <Card style={{ marginTop: 28, textAlign: "left", maxWidth: 400, margin: "28px auto 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `linear-gradient(135deg, ${COLORS.accent}, ${COLORS.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 600, color: COLORS.text }}>Ad Spend Guardian</div>
            <Badge color="green">Active</Badge>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Skills</div><div style={{ color: COLORS.textSecondary }}>Search Terms · Budget</div></div>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Tools</div><div style={{ color: COLORS.textSecondary }}>Google Ads · Slack</div></div>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Policy</div><div style={{ color: COLORS.textSecondary }}>Auto negatives · Ask budgets</div></div>
          <div><div style={{ color: COLORS.textDim, marginBottom: 3 }}>Schedule</div><div style={{ color: COLORS.textSecondary }}>Every 6 hours</div></div>
        </div>
      </Card>

      <div style={{ marginTop: 28 }}>
        <Button onClick={onComplete} size="lg">Go to dashboard →</Button>
      </div>
    </div>
  );
}

// ============================================================
// Agent Monitor — skill-driven performance dashboard
// ============================================================

function AgentMonitor({ agent }) {
  const [timeRange, setTimeRange] = useState("7d");
  const ranges = [
    { key: "24h", label: "24h" },
    { key: "7d", label: "7 days" },
    { key: "30d", label: "30 days" },
    { key: "90d", label: "90 days" },
  ];

  // Mock data — in reality, skills define what metrics to surface
  const kpiCards = [
    { label: "Total Spend", value: "$12,480", change: "+8.2%", direction: "up", color: COLORS.text },
    { label: "Cost per Lead", value: "$34.20", change: "-12.5%", direction: "down", color: COLORS.green },
    { label: "Conversions", value: "365", change: "+22.1%", direction: "up", color: COLORS.green },
    { label: "Wasted Spend", value: "$1,840", change: "-31.4%", direction: "down", color: COLORS.green },
  ];

  const keywordRows = [
    { keyword: "enterprise software demo", clicks: 482, cpl: "$18.40", conv: 26, score: 9, trend: "up" },
    { keyword: "saas pricing calculator", clicks: 341, cpl: "$22.10", conv: 15, score: 8, trend: "up" },
    { keyword: "best crm for startups", clicks: 298, cpl: "$31.50", conv: 9, score: 7, trend: "flat" },
    { keyword: "free project management", clicks: 512, cpl: "$48.20", conv: 4, score: 4, trend: "down" },
    { keyword: "how to manage employees", clicks: 189, cpl: "$67.30", conv: 1, score: 2, trend: "down" },
  ];

  // Mini sparkline (simplified bar chart)
  const spendByDay = [68, 72, 55, 80, 92, 78, 85, 70, 95, 88, 76, 82, 90, 73];

  return (
    <div>
      {/* Header: what this monitor covers + time range */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 1 }}>
            Monitoring · powered by skills
          </div>
          <div style={{ fontSize: 13, color: COLORS.textSecondary, marginTop: 4 }}>
            Data from <Badge color="accent">Google Ads</Badge> · Last synced 12 min ago
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, background: COLORS.surface, padding: 4, borderRadius: 8 }}>
          {ranges.map((r) => (
            <button key={r.key} onClick={() => setTimeRange(r.key)}
              style={{
                padding: "4px 12px", border: "none", borderRadius: 4, cursor: "pointer", fontFamily: "inherit",
                fontSize: 12, fontWeight: 600,
                background: timeRange === r.key ? COLORS.accentDim : "transparent",
                color: timeRange === r.key ? COLORS.accentLight : COLORS.textDim,
                transition: "all 0.15s ease",
              }}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} style={{ padding: 16 }}>
            <div style={{ fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>{kpi.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
            <div style={{ fontSize: 12, marginTop: 4, color: kpi.direction === "down" && kpi.label !== "Total Spend" ? COLORS.green : kpi.direction === "up" && kpi.label === "Wasted Spend" ? COLORS.red : kpi.label === "Total Spend" ? COLORS.textSecondary : COLORS.green }}>
              {kpi.direction === "up" ? "↑" : "↓"} {kpi.change} vs prev period
            </div>
          </Card>
        ))}
      </div>

      {/* Spend trend mini-chart */}
      <Card style={{ marginBottom: 20, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Daily Spend Trend</div>
          <Badge color="gray">Last {timeRange}</Badge>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80 }}>
          {spendByDay.map((val, i) => (
            <div key={i} style={{
              flex: 1, height: `${val}%`, borderRadius: "4px 4px 0 0",
              background: i === spendByDay.length - 1 ? COLORS.accent : COLORS.accentDim,
              transition: "height 0.15s ease",
            }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>Mar 7</span>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>Mar 20</span>
        </div>
      </Card>

      {/* Keywords table */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>Top Keywords by Spend</div>
          <span style={{ fontSize: 12, color: COLORS.textDim }}>Sorted by cost-per-lead</span>
        </div>
        {/* Table header */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.5fr", padding: "8px 16px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 12, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.5 }}>
          <span>Keyword</span>
          <span style={{ textAlign: "right" }}>Clicks</span>
          <span style={{ textAlign: "right" }}>CPL</span>
          <span style={{ textAlign: "right" }}>Conv.</span>
          <span style={{ textAlign: "right" }}>QS</span>
          <span style={{ textAlign: "center" }}>Trend</span>
        </div>
        {/* Table rows */}
        {keywordRows.map((row, i) => {
          const isWaste = row.score <= 4;
          return (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "2fr 0.8fr 0.8fr 0.8fr 0.6fr 0.5fr",
              padding: "10px 16px", borderBottom: i < keywordRows.length - 1 ? `1px solid ${COLORS.border}` : "none",
              background: isWaste ? COLORS.redSubtle : "transparent",
              fontSize: 13,
            }}>
              <span style={{ color: COLORS.text, fontWeight: 600 }}>
                {row.keyword}
                {isWaste && <span style={{ marginLeft: 8 }}><Badge color="red">waste</Badge></span>}
              </span>
              <span style={{ textAlign: "right", color: COLORS.textSecondary }}>{row.clicks}</span>
              <span style={{ textAlign: "right", color: isWaste ? COLORS.red : COLORS.text, fontWeight: 600 }}>{row.cpl}</span>
              <span style={{ textAlign: "right", color: COLORS.textSecondary }}>{row.conv}</span>
              <span style={{ textAlign: "right" }}>
                <span style={{ display: "inline-block", width: 24, height: 24, borderRadius: 99, fontSize: 12, fontWeight: 700, lineHeight: "24px", textAlign: "center",
                  background: row.score >= 7 ? COLORS.greenDim : row.score >= 5 ? COLORS.yellowDim : COLORS.redDim,
                  color: row.score >= 7 ? COLORS.green : row.score >= 5 ? COLORS.yellow : COLORS.red,
                }}>{row.score}</span>
              </span>
              <span style={{ textAlign: "center", fontSize: 14 }}>
                {row.trend === "up" ? "📈" : row.trend === "down" ? "📉" : "➡️"}
              </span>
            </div>
          );
        })}
      </Card>

      {/* Agent insight callout */}
      <Card style={{ marginTop: 20, borderColor: COLORS.accentDim, background: COLORS.accentDim }}>
        <div style={{ display: "flex", gap: 12 }}>
          <span style={{ fontSize: 16 }}>💡</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, marginBottom: 4 }}>Agent Insight</div>
            <div style={{ fontSize: 13, color: COLORS.textSecondary, lineHeight: 1.6 }}>
              2 keywords flagged as waste are consuming 14.7% of budget but producing only 3.4% of conversions.
              "free project management" and "how to manage employees" have been underperforming for 12 days.
              The agent has already raised this in the Feed — pending your approval to add them as negative keywords.
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// Agent Detail Shell (tabs: Monitor / Feed / Chat / Memory / Settings)
// ============================================================

function AgentDetail({ agent, project, onBack }) {
  const [tab, setTab] = useState("monitor");
  const tabs = [
    { key: "monitor", label: "Monitor" },
    { key: "feed", label: "Feed" },
    { key: "chat", label: "Chat" },
    { key: "memory", label: "Memory" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div>
      {/* Agent header with back */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div onClick={onBack} style={{ cursor: "pointer", color: COLORS.textSecondary, fontSize: 18, padding: "4px 8px", borderRadius: 8 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
          ←
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `linear-gradient(135deg, ${project.color}, ${COLORS.accentLight})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>✦</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: COLORS.text }}>{agent.name}</div>
          <div style={{ fontSize: 12, color: COLORS.textSecondary }}>{project.icon} {project.name} · Last run {agent.lastRun}</div>
        </div>
        <Badge color={agent.status === "attention" ? "yellow" : "green"}>
          {agent.status === "attention" ? "Needs input" : "Running"}
        </Badge>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 24, background: COLORS.surface, padding: 4, borderRadius: 12 }}>
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: "8px 0", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
              fontSize: 13, fontWeight: 600,
              background: tab === t.key ? COLORS.accentDim : "transparent",
              color: tab === t.key ? COLORS.accentLight : COLORS.textSecondary,
              transition: "all 0.15s ease",
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "monitor" && <AgentMonitor agent={agent} />}
      {tab === "feed" && <InsightFeed />}
      {tab === "chat" && <AgentChat />}
      {tab === "memory" && <MemoryTimeline />}
      {tab === "settings" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Basic config */}
          <Card>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, margin: "0 0 12px" }}>Agent Configuration</h3>
            <div style={{ display: "grid", gap: 16 }}>
              {[
                { label: "Intent", value: "Monitor Google Ads for search term waste and budget inefficiencies" },
                { label: "Tools", value: "Google Ads, Slack (inherited from project)" },
                { label: "Schedule", value: "Every 6 hours, 9am–6pm EST" },
              ].map((item) => (
                <div key={item.label}>
                  <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{item.label}</div>
                  <div style={{ fontSize: 14, color: COLORS.textSecondary, lineHeight: 1.5 }}>{item.value}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Policy summary */}
          <Card>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, margin: "0 0 12px" }}>Policy Rules</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ padding: "10px 12px", background: COLORS.bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Negative keywords</div>
                  <div style={{ fontSize: 12, color: COLORS.textSecondary }}>Add automatically, notify after</div>
                </div>
                <Badge color="green">Auto</Badge>
              </div>
              <div style={{ padding: "10px 12px", background: COLORS.bg, borderRadius: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: COLORS.text }}>Budget changes</div>
                    <div style={{ fontSize: 12, color: COLORS.textSecondary }}>Smart thresholds</div>
                  </div>
                  <Badge color="accent">Tiered</Badge>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[
                    { label: "<$50", badge: "Auto", color: "green" },
                    { label: "$50–200", badge: "Ask", color: "yellow" },
                    { label: ">$200", badge: "Ask+", color: "red" },
                  ].map((t) => (
                    <div key={t.label} style={{ flex: 1, padding: "8px 8px", background: COLORS.surface, borderRadius: 4, textAlign: "center" }}>
                      <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 2 }}>{t.label}</div>
                      <Badge color={t.color}>{t.badge}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Skills with knowledge attachment */}
          <Card>
            <h3 style={{ fontSize: 16, fontWeight: 600, color: COLORS.text, margin: "0 0 4px" }}>Skills & Knowledge</h3>
            <p style={{ fontSize: 12, color: COLORS.textSecondary, margin: "0 0 14px" }}>Attach domain context to each skill to improve the agent's reasoning</p>

            {[
              {
                name: "Search Term Analysis",
                desc: "Detects wasteful search terms and suggests negatives",
                hasKnowledge: true,
                knowledge: "Brand terms: acme, acme corp, acme marketing platform. Competitor terms to ignore: xyz corp, abc tools. High-intent terms to protect: pricing, demo, free trial.",
              },
              {
                name: "Budget Allocation",
                desc: "Spots over/under-spending across campaigns",
                hasKnowledge: true,
                knowledge: "Q2 total budget cap: $15,000/month. Brand campaigns have priority — do not reduce below $200/day. Generic campaigns are flexible. Weekend spend should be 30% lower than weekdays.",
              },
            ].map((skill) => (
              <div key={skill.name} style={{ marginBottom: 16, padding: 16, background: COLORS.bg, borderRadius: 8, border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>{skill.name}</span>
                  <Badge color="green">Active</Badge>
                </div>
                <div style={{ fontSize: 12, color: COLORS.textSecondary, marginBottom: 12 }}>{skill.desc}</div>

                {/* Knowledge attachment */}
                <div style={{
                  padding: 12, borderRadius: 8, border: `1px dashed ${skill.hasKnowledge ? COLORS.accent : COLORS.borderLight}`,
                  background: skill.hasKnowledge ? COLORS.accentDim : "transparent",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12 }}>📚</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: skill.hasKnowledge ? COLORS.accentLight : COLORS.textDim }}>
                      {skill.hasKnowledge ? "Knowledge attached" : "No knowledge attached"}
                    </span>
                  </div>
                  {skill.hasKnowledge ? (
                    <div style={{ fontSize: 12, color: COLORS.textSecondary, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {skill.knowledge}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: COLORS.textDim }}>
                      Add domain context to help this skill reason better
                    </div>
                  )}
                  <div style={{ marginTop: 8 }}>
                    <Button size="sm" variant={skill.hasKnowledge ? "ghost" : "secondary"}>
                      {skill.hasKnowledge ? "Edit knowledge" : "+ Add knowledge"}
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

// ============================================================
// Main App
// ============================================================

export default function App() {
  const [activeProjectId, setActiveProjectId] = useState(null); // null = homepage
  const [activeAgentId, setActiveAgentId] = useState(null);
  const [showSetup, setShowSetup] = useState(false);

  const activeProject = activeProjectId ? PROJECTS.find((p) => p.id === activeProjectId) : null;
  const activeAgent = activeProject?.agents.find((a) => a.id === activeAgentId);
  const isHome = !activeProjectId;

  const goHome = () => { setActiveProjectId(null); setActiveAgentId(null); setShowSetup(false); };
  const enterProject = (id) => { setActiveProjectId(id); setActiveAgentId(null); setShowSetup(false); };

  // Homepage — full-screen, no sidebar
  if (isHome) {
    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: COLORS.text }}>
        <Homepage
          projects={PROJECTS}
          onSelectProject={enterProject}
        />
      </div>
    );
  }

  // Project workspace — sidebar + content
  return (
    <div style={{ background: COLORS.bg, minHeight: "100vh", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: COLORS.text }}>
      <ProjectSidebar
        project={activeProject}
        activeAgentId={activeAgentId}
        onSelectAgent={(id) => { setActiveAgentId(id); setShowSetup(false); }}
        onGoHome={goHome}
        onNewAgent={() => { setActiveAgentId(null); setShowSetup(true); }}
      />

      {/* Main content */}
      <div style={{ marginLeft: 260, padding: "28px 32px", maxWidth: 720 }}>
        {showSetup ? (
          <SetupFlow
            project={activeProject}
            onComplete={() => { setShowSetup(false); setActiveAgentId(null); }}
          />
        ) : activeAgent ? (
          <AgentDetail
            agent={activeAgent}
            project={activeProject}
            onBack={() => setActiveAgentId(null)}
          />
        ) : (
          <ProjectHome
            project={activeProject}
            onSelectAgent={(id) => setActiveAgentId(id)}
          />
        )}
      </div>
    </div>
  );
}
