import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { RunView } from "~/lib/types";

interface RunListProps {
  runs: RunView[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
  activeRunId?: string | null;
}

interface DateGroup {
  label: string;
  runs: RunView[];
}

function statusColor(status: string): string {
  switch (status) {
    case "completed":
      return COLORS.green;
    case "failed":
      return COLORS.red;
    case "waiting_for_approval":
      return COLORS.orange;
    case "running":
      return COLORS.accent;
    case "queued":
      return COLORS.textDim;
    default:
      return COLORS.textDim;
  }
}

function formatDuration(
  start: string | undefined,
  end: string | undefined,
): string {
  if (!start || !end) return "";
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(status: string): string {
  if (status === "waiting_for_approval") return "waiting";
  return status;
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const runDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );

  if (runDay.getTime() === today.getTime()) return "Today";
  if (runDay.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupRunsByDate(runs: RunView[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentLabel: string | null = null;
  let currentGroup: RunView[] = [];

  for (const run of runs) {
    const label = getDateGroup(run.startedAt);
    if (label !== currentLabel) {
      if (currentLabel !== null && currentGroup.length > 0) {
        groups.push({ label: currentLabel, runs: currentGroup });
      }
      currentLabel = label;
      currentGroup = [run];
    } else {
      currentGroup.push(run);
    }
  }

  if (currentLabel !== null && currentGroup.length > 0) {
    groups.push({ label: currentLabel, runs: currentGroup });
  }

  return groups;
}

// ---------------------------------------------------------------------------
// Collapsed rail — just dots with hover tooltip
// ---------------------------------------------------------------------------

function CollapsedRail({
  runs,
  selectedRunId,
  activeRunId,
  onSelect,
  onExpand,
}: {
  runs: RunView[];
  selectedRunId: string | null;
  activeRunId?: string | null;
  onSelect: (runId: string) => void;
  onExpand: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      style={{
        width: 48,
        flexShrink: 0,
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowY: "auto",
        scrollbarWidth: "none",
      }}
    >
      <style>{`
        .run-list-collapsed::-webkit-scrollbar { display: none; }
        @keyframes railPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(90, 122, 205, 0.4); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(90, 122, 205, 0); }
        }
      `}</style>

      {/* Expand button */}
      <button
        type="button"
        onClick={onExpand}
        style={{
          width: 28,
          height: 28,
          borderRadius: RADIUS.md,
          border: "none",
          background: "transparent",
          color: COLORS.textDim,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 6,
          marginBottom: 8,
          flexShrink: 0,
        }}
        aria-label="Expand run list"
      >
        <CaretRight size={14} weight="bold" />
      </button>

      {/* Dot rail */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          padding: "0 0 8px",
        }}
      >
        {runs.map((run, index) => {
          const color = statusColor(run.status);
          const isSelected = run.id === selectedRunId;
          const isRunning =
            run.status === "running" || run.id === activeRunId;
          const isHovered = run.id === hoveredId;

          return (
            <div
              key={run.id}
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              <button
                type="button"
                onClick={() => onSelect(run.id)}
                onMouseEnter={() => setHoveredId(run.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  width: isSelected ? 12 : 8,
                  height: isSelected ? 12 : 8,
                  borderRadius: RADIUS.pill,
                  background: color,
                  border: isSelected
                    ? `2px solid ${COLORS.text}`
                    : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                  transition: `all ${MOTION.duration} ${MOTION.ease}`,
                  animation: isRunning
                    ? "railPulse 2s ease-in-out infinite"
                    : "none",
                  outline: "none",
                }}
                aria-label={`Run ${index + 1}: ${run.status}`}
              />
              {index < runs.length - 1 && (
                <div
                  style={{
                    width: 1,
                    height: 10,
                    background: COLORS.border,
                    flexShrink: 0,
                  }}
                />
              )}
              {/* Tooltip */}
              {isHovered && (
                <div
                  style={{
                    position: "absolute",
                    left: 30,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                    zIndex: 30,
                    fontSize: TYPE.scale.xs,
                    color: COLORS.text,
                    pointerEvents: "none",
                    fontWeight: TYPE.weight.medium,
                    fontFamily: TYPE.body,
                  }}
                >
                  {formatTime(run.startedAt)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded list — date-grouped rows
// ---------------------------------------------------------------------------

function ExpandedList({
  runs,
  selectedRunId,
  activeRunId,
  onSelect,
  onCollapse,
}: {
  runs: RunView[];
  selectedRunId: string | null;
  activeRunId?: string | null;
  onSelect: (runId: string) => void;
  onCollapse: () => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groups = groupRunsByDate(runs);

  return (
    <div
      style={{
        width: 260,
        flexShrink: 0,
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        overflowY: "auto",
        scrollbarWidth: "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        .run-list-expanded::-webkit-scrollbar { display: none; }
        @keyframes railPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(90, 122, 205, 0.4); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(90, 122, 205, 0); }
        }
      `}</style>

      {/* Collapse button */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px 4px 16px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: TYPE.scale.xs,
            textTransform: "uppercase",
            letterSpacing: TYPE.tracking.wide,
            color: COLORS.textDim,
            fontWeight: TYPE.weight.semibold,
            fontFamily: TYPE.body,
          }}
        >
          Runs
        </span>
        <button
          type="button"
          onClick={onCollapse}
          style={{
            width: 24,
            height: 24,
            borderRadius: RADIUS.sm,
            border: "none",
            background: "transparent",
            color: COLORS.textDim,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Collapse run list"
        >
          <CaretLeft size={13} weight="bold" />
        </button>
      </div>

      {/* Run groups */}
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: TYPE.scale.xs,
                textTransform: "uppercase",
                letterSpacing: TYPE.tracking.wide,
                color: COLORS.textDim,
                padding: "10px 16px 4px",
                fontWeight: TYPE.weight.semibold,
                fontFamily: TYPE.body,
              }}
            >
              {group.label}
            </div>
            {group.runs.map((run) => {
              const isSelected = run.id === selectedRunId;
              const isHovered = run.id === hoveredId;
              const isRunning =
                run.status === "running" || run.id === activeRunId;
              const color = statusColor(run.status);

              const duration = formatDuration(run.startedAt, run.completedAt);
              const trigger = run.triggerType ?? "manual";
              const label = statusLabel(run.status);

              const bottomParts = [label, trigger];
              if (duration) bottomParts.push(duration);
              const bottomLine = bottomParts.join(" \u00b7 ");

              return (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => onSelect(run.id)}
                  onMouseEnter={() => setHoveredId(run.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "7px 16px",
                    cursor: "pointer",
                    borderRadius: RADIUS.sm,
                    border: "none",
                    borderLeft: isSelected
                      ? `2px solid ${COLORS.accent}`
                      : "2px solid transparent",
                    background: isSelected
                      ? COLORS.accentDim
                      : isHovered
                        ? COLORS.surfaceHover
                        : "transparent",
                    transition: `background ${MOTION.duration} ${MOTION.ease}`,
                    outline: "none",
                    textAlign: "left",
                    fontFamily: TYPE.body,
                  }}
                >
                  {/* Status dot */}
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: RADIUS.pill,
                      background: color,
                      flexShrink: 0,
                      animation: isRunning
                        ? "railPulse 2s ease-in-out infinite"
                        : "none",
                    }}
                  />

                  {/* Main content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: TYPE.scale.sm,
                        color: COLORS.text,
                        fontWeight: TYPE.weight.medium,
                        lineHeight: TYPE.leading.snug,
                      }}
                    >
                      {formatTime(run.startedAt)}
                    </div>
                    <div
                      style={{
                        fontSize: TYPE.scale.xs,
                        color: COLORS.textDim,
                        lineHeight: TYPE.leading.snug,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {bottomLine}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RunList({
  runs,
  selectedRunId,
  onSelect,
  activeRunId,
}: RunListProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (runs.length === 0) return null;

  if (collapsed) {
    return (
      <CollapsedRail
        runs={runs}
        selectedRunId={selectedRunId}
        activeRunId={activeRunId}
        onSelect={onSelect}
        onExpand={() => setCollapsed(false)}
      />
    );
  }

  return (
    <ExpandedList
      runs={runs}
      selectedRunId={selectedRunId}
      activeRunId={activeRunId}
      onSelect={onSelect}
      onCollapse={() => setCollapsed(true)}
    />
  );
}
