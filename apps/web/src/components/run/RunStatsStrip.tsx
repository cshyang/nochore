import { COLORS, TYPE } from "~/lib/colors";
import { formatCost, formatTokens, type OutOfRangeResult, type RunStats } from "~/lib/run-stats";

interface RunStatsStripProps {
  stats: RunStats;
  outOfRange?: OutOfRangeResult;
}

type FlaggedMetric = "tokens" | "cost" | "duration";

// Single muted line of run facts. Zero-valued segments disappear so a simple
// run doesn't read as "N/A N/A N/A". When outOfRange flags a metric, that
// segment gets an amber underline + tooltip — the actual explanatory
// sentence lives in RunOutOfRangeNote below.
export function RunStatsStrip({ stats, outOfRange }: RunStatsStripProps) {
  const segments: Segment[] = [];

  if (stats.totalTokens > 0) {
    segments.push({
      key: "tokens",
      label: formatTokens(stats.totalTokens),
      flagged: isFlagged(outOfRange, "tokens"),
      tooltip: tooltipFor(outOfRange, "tokens"),
    });
  }

  if (stats.costEstimate > 0 || stats.totalTokens > 0) {
    segments.push({
      key: "cost",
      label: formatCost(stats.costEstimate),
      flagged: isFlagged(outOfRange, "cost"),
      tooltip: tooltipFor(outOfRange, "cost"),
    });
  }

  if (stats.durationMs > 0) {
    segments.push({ key: "duration", label: formatDurationMs(stats.durationMs) });
  }

  if (stats.turns > 0) {
    segments.push({ key: "turns", label: `${stats.turns} turn${stats.turns === 1 ? "" : "s"}` });
  }

  if (stats.toolCalls > 0 && stats.toolCalls !== stats.turns) {
    segments.push({
      key: "tools",
      label: `${stats.toolCalls} tool call${stats.toolCalls === 1 ? "" : "s"}`,
    });
  }

  if (stats.tasks > 0) {
    segments.push({
      key: "tasks",
      label: `${stats.tasks} task${stats.tasks === 1 ? "" : "s"}`,
    });
  }

  if (segments.length === 0) return null;

  return (
    <div
      style={{
        fontSize: TYPE.scale.xs,
        color: COLORS.textDim,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: 6,
        rowGap: 2,
        marginTop: 8,
        marginBottom: 8,
      }}
    >
      {segments.map((seg, i) => (
        <span key={seg.key} style={{ display: "inline-flex", alignItems: "baseline", gap: 6 }}>
          {i > 0 ? <span style={{ color: COLORS.textDim, opacity: 0.5 }}>·</span> : null}
          <span
            title={seg.tooltip}
            style={{
              color: seg.flagged ? COLORS.orange : COLORS.textSecondary,
              textDecorationLine: seg.flagged ? "underline" : "none",
              textDecorationColor: seg.flagged ? COLORS.orange : undefined,
              textUnderlineOffset: 3,
              cursor: seg.tooltip ? "help" : "default",
            }}
          >
            {seg.label}
          </span>
        </span>
      ))}
    </div>
  );
}

interface RunOutOfRangeNoteProps {
  outOfRange?: OutOfRangeResult;
}

// One-line explanation that appears right under the stats strip when a
// metric is flagged. Kept tight — no panels, no icons, no banner.
export function RunOutOfRangeNote({ outOfRange }: RunOutOfRangeNoteProps) {
  if (!outOfRange?.flagged) return null;
  const ratio = outOfRange.ratio;
  const ratioLabel = ratio >= 10 ? `${Math.round(ratio)}×` : `${ratio.toFixed(1)}×`;
  return (
    <div
      style={{
        fontSize: TYPE.scale.xs,
        color: COLORS.textSecondary,
        marginBottom: 12,
        lineHeight: TYPE.leading.normal,
      }}
    >
      This run used <span style={{ color: COLORS.orange }}>{ratioLabel} the usual tokens</span> — typically{" "}
      {formatTokens(Math.round(outOfRange.typicalMedian))}, this run {outOfRange.observed.toLocaleString()}.
    </div>
  );
}

interface Segment {
  key: string;
  label: string;
  flagged?: boolean;
  tooltip?: string;
}

function isFlagged(outOfRange: OutOfRangeResult | undefined, metric: FlaggedMetric): boolean {
  if (!outOfRange?.flagged) return false;
  // Baseline is tokens-only for now; extend when we flag more metrics.
  return metric === "tokens" || metric === "cost";
}

function tooltipFor(outOfRange: OutOfRangeResult | undefined, metric: FlaggedMetric): string | undefined {
  if (!isFlagged(outOfRange, metric) || !outOfRange) return undefined;
  return `Typical: ~${Math.round(outOfRange.typicalMedian).toLocaleString()}. This run: ${outOfRange.observed.toLocaleString()}. Baseline from ${outOfRange.priorCount} prior runs.`;
}

function formatDurationMs(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  if (minutes < 60) {
    return remSeconds > 0 ? `${minutes}m ${remSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`;
}
