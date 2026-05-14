// apps/web/src/components/chat/RunCard.tsx
import { Link } from "@tanstack/react-router";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";

interface RunCardFinding {
  /** Short, single-line summary. */
  text: string;
}

interface RunCardProps {
  runId: string;
  agentId: string;
  projectId: string;
  /** One-line summary the agent emitted for this run. */
  headline: string;
  /** Top 3 findings — list is truncated to 3 max. */
  findings: RunCardFinding[];
  /** Run duration in milliseconds. */
  durationMs?: number;
  /** ISO timestamp of completion. */
  completedAt?: string;
  /** Optional title; falls back to "Run completed". */
  title?: string;
}

export function RunCard({
  runId,
  agentId,
  projectId,
  headline,
  findings,
  durationMs,
  completedAt,
  title,
}: RunCardProps) {
  const top = findings.slice(0, 3);
  const durationText = durationMs ? formatDuration(durationMs) : null;
  const timeText = completedAt ? formatRelativeTime(completedAt) : null;
  return (
    <div
      style={{
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        marginTop: SPACE[2],
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE[2] }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: COLORS.green }} />
          <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
            {title ?? "Run completed"}
          </span>
        </div>
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          {[durationText, timeText].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div
        style={{ fontSize: TYPE.scale.sm, color: COLORS.text, lineHeight: TYPE.leading.normal, marginTop: SPACE[2] }}
      >
        {headline}
      </div>
      {top.length > 0 && (
        <div
          style={{
            background: COLORS.bg,
            borderRadius: RADIUS.md,
            padding: `${SPACE[2]}px ${SPACE[3]}px`,
            marginTop: SPACE[2],
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {top.map((f, i) => (
            <div
              key={f.text}
              style={{
                display: "flex",
                gap: 8,
                fontSize: TYPE.scale.xs,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.snug,
              }}
            >
              <span style={{ color: COLORS.accent, fontWeight: TYPE.weight.semibold, minWidth: 14 }}>{i + 1}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      )}
      <Link
        to="/$projectId/agents/$agentId"
        params={{ projectId, agentId }}
        search={{ tab: "runs", runId }}
        style={{
          display: "inline-block",
          marginTop: SPACE[2],
          fontSize: TYPE.scale.xs,
          color: COLORS.accent,
          fontWeight: TYPE.weight.medium,
          textDecoration: "none",
        }}
      >
        Open full report →
      </Link>
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
