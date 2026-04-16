import { Badge } from "~/components/Badge";
import { StatusPill } from "~/components/StatusPill";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { humanize } from "~/lib/text-format";
import type { RunView } from "~/lib/types";

// The "run identity" strip. Status is the hero — it answers "how is this
// run doing?" in one glance, so it earns the hero-size StatusPill.
// Everything else on this row stays quiet by design (gray trigger badge,
// muted timestamp).
export function RunHeader({ run }: { run: RunView }) {
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
      <StatusPill run={run} size="hero" />
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
