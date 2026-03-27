import { COLORS, RADIUS, getAgentColor } from "~/lib/colors";
import type { ProjectView, AgentView } from "~/lib/types";
import { Button } from "~/components/Button";
import {
  ArrowLeft,
  Plus,
} from "@phosphor-icons/react";

interface ProjectSidebarProps {
  project: ProjectView;
  activeAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onGoHome: () => void;
  onNewAgent: () => void;
}

export function ProjectSidebar({
  project,
  activeAgentId,
  onSelectAgent,
  onGoHome,
  onNewAgent,
}: ProjectSidebarProps) {
  const draftAgents = project.agents.filter(
    (a) => a.lifecycleStatus === "draft",
  );
  const attentionAgents = project.agents.filter(
    (a) => a.lifecycleStatus !== "draft" && a.status === "attention",
  );
  const activeAgents = project.agents.filter(
    (a) => a.lifecycleStatus !== "draft" && (a.status === "running" || a.status === "idle"),
  );

  return (
    <div
      style={{
        width: 260,
        background: COLORS.surface,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        position: "fixed",
        left: 0,
        top: 0,
        zIndex: 20,
      }}
    >
      {/* Back to projects */}
      <div
        onClick={onGoHome}
        style={{
          padding: "12px 16px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          transition: "background 0.15s ease",
        }}
        onMouseEnter={(e) =>
          (e.currentTarget.style.background = COLORS.surfaceHover)
        }
        onMouseLeave={(e) =>
          (e.currentTarget.style.background = "transparent")
        }
      >
        <ArrowLeft size={14} weight="light" color={COLORS.textSecondary} />
        <span style={{ fontSize: 13, color: COLORS.textSecondary }}>
          All projects
        </span>
      </div>

      {/* Project header */}
      <div
        style={{
          padding: "12px 16px 16px",
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>{project.icon}</span>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.text,
                fontFamily: '"Satoshi", sans-serif',
              }}
            >
              {project.name}
            </div>
            <div style={{ fontSize: 12, color: COLORS.textSecondary }}>
              {project.agents.length} agents · {project.connectionCount} conn
            </div>
          </div>
        </div>
      </div>

      {/* Agent list — grouped by status */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 8px" }}>
        {/* Attention group */}
        {attentionAgents.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontSize: 12,
                color: COLORS.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                padding: "8px 12px 4px",
                fontWeight: 600,
              }}
            >
              Needs attention
            </div>
            {attentionAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                isActive={agent.id === activeAgentId}
                onSelect={() => onSelectAgent(agent.id)}
              />
            ))}
          </div>
        )}

        {/* Running/idle group */}
        {activeAgents.length > 0 && (
          <div>
            <div
              style={{
                fontSize: 12,
                color: COLORS.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                padding: "8px 12px 4px",
                fontWeight: 600,
              }}
            >
              Running
            </div>
            {activeAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                isActive={agent.id === activeAgentId}
                onSelect={() => onSelectAgent(agent.id)}
              />
            ))}
          </div>
        )}

        {/* Draft agents — dimmed with "Draft" badge */}
        {draftAgents.length > 0 && (
          <div style={{ padding: "8px 0" }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: COLORS.textDim,
                textTransform: "uppercase",
                letterSpacing: 0.6,
                padding: "4px 16px 6px",
              }}
            >
              Drafts
            </div>
            {draftAgents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                isActive={agent.id === activeAgentId}
                onSelect={() => onSelectAgent(agent.id)}
                isDraft
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div
        style={{
          padding: "12px 16px",
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        <Button
          onClick={onNewAgent}
          size="sm"
          variant="ghost"
          style={{
            width: "100%",
            justifyContent: "center",
            color: COLORS.textSecondary,
          }}
        >
          <Plus size={14} weight="light" />
          New agent
        </Button>
      </div>
    </div>
  );
}

function AgentRow({
  agent,
  isActive,
  onSelect,
  isDraft,
}: {
  agent: AgentView;
  isActive: boolean;
  onSelect: () => void;
  isDraft?: boolean;
}) {
  const agentColor = getAgentColor(agent.id);
  const isAttention = !isDraft && agent.status === "attention";

  return (
    <div
      onClick={onSelect}
      style={{
        padding: "8px 12px",
        borderRadius: RADIUS.sharp,
        cursor: "pointer",
        marginBottom: 1,
        background: isActive ? COLORS.surfaceHover : "transparent",
        borderLeft: isActive ? `2px solid ${agentColor.primary}` : "2px solid transparent",
        transition: "all 0.15s ease",
      }}
      onMouseEnter={(e) =>
        !isActive && (e.currentTarget.style.background = COLORS.surfaceHover)
      }
      onMouseLeave={(e) =>
        !isActive && (e.currentTarget.style.background = "transparent")
      }
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minWidth: 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: RADIUS.pill,
            background: isAttention
              ? COLORS.yellow
              : agent.status === "error"
                ? COLORS.red
                : agent.status === "idle"
                  ? COLORS.textDim
                  : agentColor.primary,
            flexShrink: 0,
            opacity: isAttention || agent.status === "error" ? 1 : 0.7,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: isActive ? 600 : 400,
            color: isDraft ? COLORS.textDim : isActive ? COLORS.text : COLORS.textSecondary,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            fontStyle: isDraft ? "italic" : "normal",
          }}
        >
          {agent.name}
        </span>
        {isDraft && (
          <span style={{ fontSize: 10, color: COLORS.textDim, marginLeft: "auto", flexShrink: 0, padding: "1px 6px", borderRadius: 99, border: `1px solid ${COLORS.border}` }}>
            Draft
          </span>
        )}
      </div>
      {isAttention && agent.pendingCount > 0 && (
        <div
          style={{
            fontSize: 12,
            color: COLORS.yellow,
            marginTop: 4,
            marginLeft: 14,
            lineHeight: 1.3,
          }}
        >
          {agent.pendingCount} action{agent.pendingCount === 1 ? "" : "s"} need{agent.pendingCount === 1 ? "s" : ""} approval
        </div>
      )}
    </div>
  );
}
