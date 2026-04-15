import { Badge } from "~/components/Badge";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { humanize } from "~/lib/text-format";
import type { RunView } from "~/lib/types";

// Purpose: the "run identity" strip. Answers "which run am I looking at?"
// — status, when it started, and how it was triggered. Everything else
// (tokens, cost, duration, tool calls, subagents) lives in RunStatsStrip
// immediately below, so this stays minimal by design.
export function RunHeader({ run }: { run: RunView }) {
  const statusBadge =
    run.status === "completed" ? (
      <Badge color="green">Completed</Badge>
    ) : run.status === "failed" ? (
      <Badge color="red">Failed</Badge>
    ) : run.status === "stopped" ? (
      <Badge color="yellow">Stopped</Badge>
    ) : run.status === "cancelled" ? (
      <Badge color="yellow">Cancelled</Badge>
    ) : run.status === "waiting_for_approval" ? (
      <Badge color="yellow">Waiting</Badge>
    ) : run.status === "waiting_for_children" ? (
      <Badge color={run.hasActionableApprovals ? "yellow" : "blue"}>
        {run.hasActionableApprovals ? "Needs input" : "Coordinating"}
      </Badge>
    ) : run.status === "queued" ? (
      <Badge color="gray">Queued</Badge>
    ) : (
      <Badge color="blue">Running</Badge>
    );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        padding: "12px 16px",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.sm,
        marginBottom: 12,
        minWidth: 0,
      }}
    >
      {statusBadge}
      <span style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>{formatStartedAt(run.startedAt)}</span>
      <span style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim, opacity: 0.5 }}>{"\u00b7"}</span>
      <Badge color="gray">{humanize(run.triggerType ?? "manual")}</Badge>
    </div>
  );
}

// Humanized "started at" — today shows only the time; older runs include
// the date so the user can locate historical runs without clicking into
// the row. Locale-aware for free via toLocale* helpers.
function formatStartedAt(startedAt: string): string {
  const start = new Date(startedAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const runDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const time = start.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (runDay.getTime() === today.getTime()) return time;
  const dayDelta = Math.round((today.getTime() - runDay.getTime()) / 86_400_000);
  if (dayDelta === 1) return `Yesterday at ${time}`;
  return `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
}
