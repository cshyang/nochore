import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { Badge } from "~/components/Badge";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { workItemStatusColor } from "~/lib/status-format";
import { humanize } from "~/lib/text-format";
import { formatDuration } from "~/lib/time-format";
import type { WorkItemView } from "~/lib/types";

const RESULT_CLIP_THRESHOLD = 400;

export function WorkItemsSection({ workItems }: { workItems?: WorkItemView[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resultExpanded, setResultExpanded] = useState<Set<string>>(new Set());

  if (!workItems || workItems.length === 0) return null;

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
        Work Items
      </div>
      {workItems.map((wi) => {
        const isOpen = expanded.has(wi.id);
        const isResultOpen = resultExpanded.has(wi.id);
        const bodyId = `work-item-body-${wi.id}`;
        const duration = wi.startedAt && wi.completedAt ? formatDuration(wi.startedAt, wi.completedAt) : undefined;
        const totalTokens = (wi.inputTokens ?? 0) + (wi.outputTokens ?? 0);
        const errorColor = wi.status === "stopped" ? COLORS.orange : COLORS.red;
        const showClip = (wi.result?.length ?? 0) > RESULT_CLIP_THRESHOLD && !isResultOpen;
        const visibleResult = showClip ? `${wi.result!.slice(0, RESULT_CLIP_THRESHOLD)}…` : wi.result;

        return (
          <div
            key={wi.id}
            style={{
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.sm,
              overflow: "hidden",
            }}
          >
            <button
              type="button"
              onClick={() => toggle(wi.id)}
              aria-expanded={isOpen}
              aria-controls={bodyId}
              style={{
                display: "flex",
                alignItems: "center",
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
                  transition: `transform ${MOTION.duration} ${MOTION.ease}`,
                }}
              >
                {isOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
              </span>
              <Badge color={workItemStatusColor(wi.status)}>{humanize(wi.role)}</Badge>
              <span
                style={{
                  fontSize: TYPE.scale.sm,
                  color: COLORS.textSecondary,
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {wi.title}
              </span>
              {duration && <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{duration}</span>}
              {wi.error && !isOpen && (
                <span style={{ fontSize: TYPE.scale.xs, color: errorColor }}>
                  {wi.status === "stopped" ? "Stopped" : "Error"}
                </span>
              )}
            </button>

            {isOpen && (
              <div
                id={bodyId}
                style={{
                  padding: "4px 14px 14px 36px",
                  display: "grid",
                  gap: 10,
                  borderTop: `1px solid ${COLORS.border}`,
                }}
              >
                <div
                  style={{
                    fontSize: TYPE.scale.sm,
                    color: COLORS.textSecondary,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    lineHeight: TYPE.leading.normal,
                    paddingTop: 10,
                  }}
                >
                  {wi.title}
                </div>

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
                  <span>{humanize(wi.status)}</span>
                </div>

                {wi.error && (
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
                      {wi.status === "stopped" ? "Stopped" : "Error"}
                    </div>
                    <div
                      style={{
                        fontSize: TYPE.scale.sm,
                        color: COLORS.textSecondary,
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                      }}
                    >
                      {wi.error}
                    </div>
                  </div>
                )}

                {wi.result && (
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
                    {wi.result.length > RESULT_CLIP_THRESHOLD && (
                      <button
                        type="button"
                        onClick={() => toggleResult(wi.id)}
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
