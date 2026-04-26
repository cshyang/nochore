import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "~/components/Badge";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { taskStatusColor } from "~/lib/status-format";
import { humanize } from "~/lib/text-format";
import { formatDuration } from "~/lib/time-format";
import type { AgentTaskView } from "~/lib/types";

const RESULT_CLIP_THRESHOLD = 400;

export function TasksSection({ tasks }: { tasks?: AgentTaskView[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resultExpanded, setResultExpanded] = useState<Set<string>>(new Set());

  if (!tasks || tasks.length === 0) return null;

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleResult = (id: string) => {
    setResultExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div style={{ display: "grid", gap: 6, marginBottom: 16 }}>
      <div
        style={{
          fontSize: TYPE.scale.xs,
          fontWeight: TYPE.weight.semibold,
          color: COLORS.textDim,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
          marginBottom: 2,
        }}
      >
        Tasks
      </div>
      {tasks.map((task) => {
        const isOpen = expanded.has(task.id);
        const isResultOpen = resultExpanded.has(task.id);
        const bodyId = `agent-task-body-${task.id}`;
        const duration =
          task.startedAt && task.completedAt ? formatDuration(task.startedAt, task.completedAt) : undefined;
        const totalTokens = (task.inputTokens ?? 0) + (task.outputTokens ?? 0);
        const errorColor = task.status === "stopped" ? COLORS.orange : COLORS.red;
        const showClip = (task.result?.length ?? 0) > RESULT_CLIP_THRESHOLD && !isResultOpen;
        const visibleResult = showClip ? `${task.result!.slice(0, RESULT_CLIP_THRESHOLD)}…` : task.result;

        return (
          <div
            key={task.id}
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => toggle(task.id)}
              aria-expanded={isOpen}
              aria-controls={bodyId}
              style={{
                display: "flex",
                alignItems: isOpen ? "flex-start" : "center",
                gap: 10,
                padding: "10px 14px",
                width: "100%",
                background: "transparent",
                border: "none",
                color: "inherit",
                font: "inherit",
                textAlign: "left",
                cursor: "pointer",
                minWidth: 0,
                transition: `background ${MOTION.duration} ${MOTION.ease}`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = COLORS.surfaceHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              }}
            >
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  color: COLORS.textDim,
                  marginTop: isOpen ? 4 : 0,
                  transition: `transform ${MOTION.duration} ${MOTION.ease}`,
                }}
              >
                {isOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </span>
              <span style={{ marginTop: isOpen ? 1 : 0 }}>
                <Badge color={taskStatusColor(task.status)}>{humanize(task.role)}</Badge>
              </span>
              <span
                style={{
                  fontSize: TYPE.scale.sm,
                  color: COLORS.textSecondary,
                  flex: 1,
                  minWidth: 0,
                  overflow: isOpen ? "visible" : "hidden",
                  textOverflow: isOpen ? "clip" : "ellipsis",
                  whiteSpace: isOpen ? "pre-wrap" : "nowrap",
                  wordBreak: isOpen ? "break-word" : "normal",
                  lineHeight: isOpen ? TYPE.leading.normal : undefined,
                }}
              >
                {task.title}
              </span>
              {!isOpen && duration && (
                <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{duration}</span>
              )}
              {!isOpen && task.error && (
                <span style={{ fontSize: TYPE.scale.xs, color: errorColor }}>
                  {task.status === "stopped" ? "Stopped" : "Error"}
                </span>
              )}
            </button>

            {isOpen && (
              <div
                id={bodyId}
                style={{
                  padding: "12px 14px 14px 36px",
                  display: "grid",
                  gap: 10,
                  borderTop: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    fontSize: TYPE.scale.xs,
                    color: COLORS.textDim,
                  }}
                >
                  {totalTokens > 0 && <span>{totalTokens.toLocaleString()} tokens</span>}
                  {duration && <span>{duration}</span>}
                  <span>{humanize(task.status)}</span>
                </div>

                {task.error && (
                  <div style={{ display: "grid", gap: 4 }}>
                    <div
                      style={{
                        fontSize: TYPE.scale.xs,
                        fontWeight: TYPE.weight.semibold,
                        color: errorColor,
                        textTransform: "uppercase",
                        letterSpacing: TYPE.tracking.wide,
                      }}
                    >
                      {task.status === "stopped" ? "Stopped" : "Error"}
                    </div>
                    <div
                      style={{
                        fontSize: TYPE.scale.sm,
                        color: COLORS.textSecondary,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {task.error}
                    </div>
                  </div>
                )}

                {task.result && (
                  <div style={{ display: "grid", gap: 4 }}>
                    <div
                      style={{
                        fontSize: TYPE.scale.xs,
                        fontWeight: TYPE.weight.semibold,
                        color: COLORS.textDim,
                        textTransform: "uppercase",
                        letterSpacing: TYPE.tracking.wide,
                      }}
                    >
                      Output
                    </div>
                    <div
                      style={{
                        fontSize: TYPE.scale.sm,
                        color: COLORS.textSecondary,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        lineHeight: TYPE.leading.normal,
                      }}
                    >
                      {visibleResult}
                    </div>
                    {task.result.length > RESULT_CLIP_THRESHOLD && (
                      <button
                        type="button"
                        onClick={() => toggleResult(task.id)}
                        style={{
                          alignSelf: "start",
                          background: "transparent",
                          border: "none",
                          padding: 0,
                          color: COLORS.accent,
                          fontSize: TYPE.scale.xs,
                          cursor: "pointer",
                        }}
                      >
                        {isResultOpen ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
