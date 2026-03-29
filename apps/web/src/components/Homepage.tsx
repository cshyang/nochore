import {
  ArrowRight,
  CheckCircle,
  CircleNotch,
  FolderSimplePlus,
  Plus,
  Sparkle,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "~/components/Badge";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { ProjectView } from "~/lib/types";

export function Homepage({
  projects,
  onSelectProject,
  onCreateProject,
}: {
  projects: ProjectView[];
  onSelectProject: (id: string) => void;
  onCreateProject?: (name: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating && inputRef.current) {
      inputRef.current.focus();
    }
  }, [creating]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || submitting) return;
    setSubmitting(true);
    try {
      await onCreateProject?.(name);
    } finally {
      setSubmitting(false);
      setCreating(false);
      setNewName("");
    }
  };

  const handleCancel = () => {
    setCreating(false);
    setNewName("");
  };

  const totalAgents = projects.reduce((s, p) => s + p.agents.length, 0);
  const totalAttention = projects.reduce((s, p) => s + p.attentionCount, 0);

  // Gather all attention agents across projects for the "needs you" section
  const attentionItems = projects.flatMap((p) =>
    p.agents.filter((a) => a.status === "attention").map((a) => ({ ...a, projectName: p.name, projectId: p.id })),
  );

  const transition = `${MOTION.duration} ${MOTION.ease}`;

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg }}>
      {/* Keyframes for pulse and fadeIn */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

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
              fontSize: TYPE.scale.md,
              fontWeight: TYPE.weight.bold,
              color: COLORS.text,
              letterSpacing: TYPE.tracking.tight,
              fontFamily: TYPE.display,
            }}
          >
            Nochore
          </span>
        </div>
      </div>

      {/* Main content */}
      <div
        style={{
          maxWidth: 800,
          margin: "0 auto",
          padding: "48px 48px 64px",
          animation: "fadeIn 0.4s var(--ease-out-expo) both",
        }}
      >
        {/* Greeting — the emotional anchor */}
        <div style={{ marginBottom: 48 }}>
          <h1
            style={{
              fontSize: TYPE.scale.xl,
              fontWeight: TYPE.weight.bold,
              color: COLORS.text,
              margin: 0,
              letterSpacing: TYPE.tracking.tight,
              fontFamily: TYPE.display,
            }}
          >
            Good morning, Chau Shyang.
          </h1>
          <p
            style={{
              fontSize: TYPE.scale.md,
              color: COLORS.textSecondary,
              marginTop: 8,
              lineHeight: TYPE.leading.normal,
              fontFamily: TYPE.body,
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
                  fontSize: TYPE.scale.xs,
                  color: COLORS.textDim,
                  textTransform: "uppercase",
                  letterSpacing: TYPE.tracking.wide,
                  fontWeight: TYPE.weight.semibold,
                }}
              >
                Needs attention
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {attentionItems.map((item) => {
                return (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onSelectProject(item.projectId)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 16px",
                      borderRadius: RADIUS.sm,
                      background: COLORS.orangeSubtle,
                      cursor: "pointer",
                      transition: `background ${transition}`,
                      border: "none",
                      borderLeft: `1px solid ${COLORS.orangeBorder}`,
                      width: "100%",
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.orangeDim)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.orangeSubtle)}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: TYPE.weight.semibold,
                          color: COLORS.text,
                          marginBottom: 2,
                        }}
                      >
                        {item.name}
                      </div>
                      <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>
                        {item.pendingCount > 0
                          ? `${item.pendingCount} action${item.pendingCount === 1 ? "" : "s"} need approval`
                          : "Needs attention"}
                        <span style={{ color: COLORS.textDim }}> · {item.projectName}</span>
                      </div>
                    </div>
                    <ArrowRight size={16} weight="light" color={COLORS.textDim} />
                  </button>
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
              borderRadius: RADIUS.sm,
              background: COLORS.greenDim,
              border: `1px solid ${COLORS.greenBorder}`,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <CheckCircle size={20} weight="light" color={COLORS.green} />
            <span style={{ fontSize: TYPE.scale.base, color: COLORS.green, fontWeight: TYPE.weight.medium }}>
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
                fontSize: TYPE.scale.xs,
                color: COLORS.textDim,
                textTransform: "uppercase",
                letterSpacing: TYPE.tracking.wide,
                fontWeight: TYPE.weight.semibold,
              }}
            >
              Projects
            </span>
            {!creating && (
              <button
                type="button"
                onClick={() => setCreating(true)}
                style={{
                  background: "none",
                  border: "none",
                  color: COLORS.textSecondary,
                  fontSize: TYPE.scale.sm,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  borderRadius: RADIUS.md,
                  transition: `color ${transition}`,
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
              >
                <Plus size={14} weight="light" />
                New project
              </button>
            )}
          </div>

          {/* Project list — not cards, more editorial */}
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {/* Inline create row */}
            {creating && (
              <div
                style={{
                  padding: "12px 16px",
                  borderRadius: RADIUS.sm,
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.accent}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  transition: `all ${transition}`,
                }}
              >
                <FolderSimplePlus size={20} weight="duotone" color={COLORS.accent} style={{ flexShrink: 0 }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") handleCancel();
                  }}
                  placeholder="Project name..."
                  disabled={submitting}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    outline: "none",
                    color: COLORS.text,
                    fontSize: TYPE.scale.md,
                    fontWeight: TYPE.weight.semibold,
                    fontFamily: TYPE.display,
                    padding: 0,
                  }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                  {submitting ? (
                    <CircleNotch
                      size={16}
                      weight="light"
                      color={COLORS.accent}
                      style={{ animation: "spin 1s linear infinite" }}
                    />
                  ) : (
                    <>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "2px 6px",
                          borderRadius: RADIUS.sm,
                          background: newName.trim() ? COLORS.accentDim : "transparent",
                          color: newName.trim() ? COLORS.accentBright : COLORS.textDim,
                          transition: `all ${transition}`,
                        }}
                      >
                        Enter
                      </span>
                      <button
                        type="button"
                        onClick={handleCancel}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: 4,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        <X size={14} weight="light" color={COLORS.textDim} />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {projects.map((proj) => {
              const totalLessons = proj.agents.reduce((s, a) => s + a.lessonCount, 0);
              const totalRuns = proj.agents.reduce((s, a) => s + a.runCount, 0);

              return (
                <button
                  type="button"
                  key={proj.id}
                  onClick={() => onSelectProject(proj.id)}
                  style={{
                    padding: "16px",
                    borderRadius: RADIUS.sm,
                    background: COLORS.surface,
                    cursor: "pointer",
                    transition: `background ${transition}`,
                    border: "none",
                    width: "100%",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.surface)}
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
                            fontSize: TYPE.scale.md,
                            fontWeight: TYPE.weight.semibold,
                            color: COLORS.text,
                            fontFamily: TYPE.display,
                          }}
                        >
                          {proj.name}
                        </div>
                        <div
                          style={{
                            fontSize: TYPE.scale.sm,
                            color: COLORS.textSecondary,
                            marginTop: 2,
                          }}
                        >
                          {proj.agents.length} agents · {totalLessons} lessons · {totalRuns} runs
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {proj.attentionCount > 0 && <Badge color="orange">{proj.attentionCount}</Badge>}
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
                      const statusDotColor =
                        agent.status === "attention"
                          ? COLORS.orange
                          : agent.status === "error"
                            ? COLORS.red
                            : agent.status === "running"
                              ? COLORS.green
                              : COLORS.textDim;
                      const isRunning = agent.status === "running";
                      return (
                        <div
                          key={agent.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: TYPE.scale.sm,
                          }}
                        >
                          <span
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: RADIUS.pill,
                              background: statusDotColor,
                              flexShrink: 0,
                              opacity: agent.status === "idle" ? 0.5 : 1,
                              ...(isRunning ? { animation: "pulse 3s ease-in-out infinite" } : {}),
                            }}
                          />
                          <span
                            style={{
                              color: agent.status === "attention" ? COLORS.text : COLORS.textSecondary,
                              fontWeight: agent.status === "attention" ? TYPE.weight.medium : TYPE.weight.regular,
                            }}
                          >
                            {agent.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
