// apps/web/src/components/chat/RunCard.tsx
import { Link } from "@tanstack/react-router";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";
import type { RunFindingSeverityView, RunFindingView, RunTrailView } from "~/lib/types";

interface RunCardProps {
  runId: string;
  agentId: string;
  projectId: string;
  /** One-line summary the agent emitted for this run. */
  headline: string;
  /** Structured findings parsed from the agent's report. */
  findings?: RunFindingView[];
  /** Overall severity for the headline tile. */
  overallSeverity?: RunFindingSeverityView;
  /** Tool calls + event counts for the trail footer. */
  trail?: RunTrailView;
  /** Run duration in milliseconds. */
  durationMs?: number;
  /** ISO timestamp of completion. */
  completedAt?: string;
  /** Optional title; falls back to "Run completed". */
  title?: string;
}

const SEVERITY_STYLE: Record<RunFindingSeverityView, { dot: string; chip: string; label: string }> = {
  critical: { dot: COLORS.red, chip: COLORS.redDim, label: "Critical" },
  warning: { dot: COLORS.orange, chip: COLORS.orangeDim, label: "Watch" },
  watch: { dot: COLORS.orange, chip: COLORS.orangeDim, label: "Watch" },
  winner: { dot: COLORS.green, chip: COLORS.greenDim, label: "Winner" },
  success: { dot: COLORS.green, chip: COLORS.greenDim, label: "Healthy" },
  info: { dot: COLORS.textDim, chip: COLORS.grayDim, label: "Info" },
};

export function RunCard({
  runId,
  agentId,
  projectId,
  headline,
  findings = [],
  overallSeverity,
  trail,
  durationMs,
  completedAt,
  title,
}: RunCardProps) {
  const heroSeverity: RunFindingSeverityView = overallSeverity ?? findings[0]?.severity ?? "success";
  const heroDotColor = SEVERITY_STYLE[heroSeverity].dot;
  const visibleFindings = findings.slice(0, 4);
  const overflowCount = Math.max(0, findings.length - visibleFindings.length);
  const durationText = durationMs ? formatDuration(durationMs) : null;
  const timeText = completedAt ? formatRelativeTime(completedAt) : null;
  const toolCallCount = trail?.toolCalls?.length ?? 0;
  const eventCount = trail?.eventCount ?? 0;

  return (
    <div
      style={{
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        marginTop: SPACE[2],
        display: "flex",
        flexDirection: "column",
        gap: SPACE[2],
      }}
    >
      {/* Header: status pill + meta */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE[2] }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: heroDotColor }} />
          <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
            {title ?? "Run completed"}
          </span>
        </div>
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          {[durationText, timeText].filter(Boolean).join(" · ")}
        </span>
      </div>

      {/* Hero headline */}
      <div
        style={{
          fontSize: TYPE.scale.sm,
          color: COLORS.text,
          fontWeight: TYPE.weight.medium,
          lineHeight: TYPE.leading.snug,
        }}
      >
        {headline}
      </div>

      {/* Findings list */}
      {visibleFindings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {visibleFindings.map((finding) => {
            const style = SEVERITY_STYLE[finding.severity];
            return (
              <div
                key={`${finding.severity}:${finding.title}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACE[2],
                  padding: `${SPACE[2]}px ${SPACE[3]}px`,
                  background: COLORS.bg,
                  borderRadius: RADIUS.md,
                  borderLeft: `2px solid ${style.dot}`,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: TYPE.weight.semibold,
                    color: style.dot,
                    textTransform: "uppercase",
                    letterSpacing: TYPE.tracking.wide,
                    minWidth: 56,
                  }}
                >
                  {style.label}
                </span>
                <span
                  style={{
                    fontSize: TYPE.scale.sm,
                    color: COLORS.text,
                    lineHeight: TYPE.leading.snug,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  {finding.title}
                </span>
              </div>
            );
          })}
          {overflowCount > 0 ? (
            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, paddingLeft: SPACE[3] }}>
              +{overflowCount} more in full report
            </div>
          ) : null}
        </div>
      )}

      {/* Trail footer + full-report link */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: SPACE[2],
          marginTop: SPACE[1],
        }}
      >
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          {[toolCallCount > 0 ? `${toolCallCount} tool calls` : null, eventCount > 0 ? `${eventCount} events` : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <Link
          to="/$projectId/agents/$agentId"
          params={{ projectId, agentId }}
          search={{ tab: "runs", runId }}
          style={{
            fontSize: TYPE.scale.xs,
            color: COLORS.accent,
            fontWeight: TYPE.weight.medium,
            textDecoration: "none",
          }}
        >
          Open full report →
        </Link>
      </div>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
