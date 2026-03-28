import { useState } from "react";
import { COLORS, RADIUS, MOTION, TYPE } from "~/lib/colors";

export interface RailRun {
  id: string;
  status?: string;
  startedAt?: string | number | Date;
  completedAt?: string | number | Date;
  triggerType?: string;
}

interface RunRailProps {
  runs: RailRun[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
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

function formatDate(value: string | number | Date | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDuration(start: string | number | Date | undefined, end: string | number | Date | undefined): string {
  if (!start || !end) return "";
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m`;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function RunRail({ runs, selectedRunId, onSelect }: RunRailProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  if (runs.length === 0) return null;

  return (
    <div
      style={{
        width: 48,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        gap: 4,
        overflowY: "auto",
        maxHeight: "calc(100vh - 260px)",
        scrollbarWidth: "none",
      }}
    >
      <style>{`
        .run-rail::-webkit-scrollbar { display: none; }
        @keyframes railPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(90, 122, 205, 0.4); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(90, 122, 205, 0); }
        }
      `}</style>
      {runs.map((run, index) => {
        const color = statusColor(run.status ?? "queued");
        const isSelected = run.id === selectedRunId;
        const isRunning = run.status === "running";
        const isHovered = run.id === hoveredId;

        return (
          <div
            key={run.id}
            style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}
          >
            <button
              onClick={() => onSelect(run.id)}
              onMouseEnter={() => setHoveredId(run.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{
                width: isSelected ? 14 : 10,
                height: isSelected ? 14 : 10,
                borderRadius: RADIUS.pill,
                background: color,
                border: isSelected ? `2px solid ${COLORS.text}` : "2px solid transparent",
                cursor: "pointer",
                padding: 0,
                transition: `all ${MOTION.duration} ${MOTION.ease}`,
                animation: isRunning ? "railPulse 2s ease-in-out infinite" : "none",
                outline: "none",
              }}
              aria-label={`Run ${index + 1}: ${run.status}`}
            />
            {/* Connector line to next dot */}
            {index < runs.length - 1 && (
              <div
                style={{
                  width: 1,
                  height: 12,
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
                  left: 32,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.sm,
                  padding: "6px 10px",
                  whiteSpace: "nowrap",
                  zIndex: 30,
                  fontSize: TYPE.scale.xs,
                  color: COLORS.textSecondary,
                  lineHeight: 1.5,
                  pointerEvents: "none",
                }}
              >
                <div style={{ color: COLORS.text, fontWeight: TYPE.weight.medium }}>
                  {formatDate(run.startedAt)}
                </div>
                <div>
                  {humanize(run.triggerType ?? "manual")}
                  {run.completedAt ? ` · ${formatDuration(run.startedAt, run.completedAt)}` : ""}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
