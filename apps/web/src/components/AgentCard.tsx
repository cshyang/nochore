import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { AgentView } from "~/lib/types";

const transition = `${MOTION.duration} ${MOTION.ease}`;

interface AgentCardProps {
  agent: AgentView;
  onClick: () => void;
}

export function AgentCard({ agent, onClick }: AgentCardProps) {
  const isRunning = agent.status === "running";
  const isDraft = agent.lifecycleStatus === "draft";
  const hasRuns = agent.runCount > 0;

  const statusDotColor =
    agent.status === "attention"
      ? COLORS.orange
      : agent.status === "error"
        ? COLORS.red
        : isRunning
          ? COLORS.green
          : COLORS.textDim;

  // Build the last-result line
  let lastResultLine: string | null = null;
  if (hasRuns && (agent.lastRunHeadline || agent.lastRunRelative)) {
    const parts: string[] = [];
    if (agent.lastRunHeadline) parts.push(agent.lastRunHeadline);
    if (agent.lastRunRelative) parts.push(agent.lastRunRelative);
    lastResultLine = parts.join(" \u00b7 ");
  }

  // Empty state: no runs yet
  const connectedProviders = agent.connections
    .filter((c) => c.status === "active" || !c.status)
    .map((c) => c.provider);

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.sm,
        padding: 16,
        cursor: "pointer",
        transition: `border-color ${transition}`,
        textAlign: "left",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        fontFamily: "inherit",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderStrong;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
      }}
    >
      {/* Row 1: Status dot + name + draft badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: statusDotColor,
            opacity: agent.status === "idle" ? 0.5 : 1,
            flexShrink: 0,
            ...(isRunning ? { animation: "pulse 3s ease-in-out infinite" } : {}),
          }}
        />
        <span
          style={{
            fontSize: TYPE.scale.base,
            fontWeight: TYPE.weight.semibold,
            color: COLORS.text,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {agent.name}
        </span>
        {isDraft && (
          <span
            style={{
              fontSize: TYPE.scale.xs,
              fontWeight: TYPE.weight.medium,
              background: "rgba(107,103,128,0.15)",
              color: COLORS.textSecondary,
              padding: "2px 8px",
              borderRadius: RADIUS.sm,
              flexShrink: 0,
            }}
          >
            Draft
          </span>
        )}
      </div>

      {/* Row 2: Outcome sentence (description) */}
      {agent.description && (
        <div
          style={{
            fontSize: TYPE.scale.sm,
            color: COLORS.textSecondary,
            lineHeight: 1.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {agent.description}
        </div>
      )}

      {/* Row 2b: Metric sparkline (when data exists) */}
      {agent.metricSparkline && agent.metricSparkline.length > 1 && (
        <MetricSparklineRow
          primaryMetric={agent.primaryMetric}
          sparkline={agent.metricSparkline}
          currentValue={agent.metricCurrentValue}
          unit={agent.metricUnit}
        />
      )}

      {/* Row 3: Last result or empty state */}
      {hasRuns ? (
        <>
          {lastResultLine && (
            <div
              style={{
                fontSize: TYPE.scale.xs,
                color: COLORS.textDim,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {lastResultLine}
              {agent.metricTrendLabel && (
                <span
                  style={{
                    marginLeft: 6,
                    color: agent.metricTrendLabel.startsWith("\u2193") ? COLORS.green : COLORS.orange,
                  }}
                >
                  {agent.metricTrendLabel}
                </span>
              )}
            </div>
          )}
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
            Ready to run
            {connectedProviders.length > 0 && ` \u00b7 ${connectedProviders.join(", ")}`}
          </div>
          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, opacity: 0.7 }}>
            First run will establish baseline metrics
          </div>
        </div>
      )}

      {/* Row 4: Pending approvals */}
      {agent.pendingCount > 0 && (
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.orange }}>
          {"\uD83D\uDFE1"} {agent.pendingCount} pending approval{agent.pendingCount === 1 ? "" : "s"}
        </div>
      )}

      {/* Row 5: Open CTA */}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          Open {"\u2192"}
        </span>
      </div>
    </button>
  );
}

function MetricSparklineRow({
  primaryMetric,
  sparkline,
  currentValue,
  unit,
}: {
  primaryMetric?: string;
  sparkline: Array<{ timestamp: number; value: number }>;
  currentValue?: number;
  unit?: string;
}) {
  const metricLabel = primaryMetric ? primaryMetric.split("|")[0] ?? "" : "";
  const values = sparkline.map((p) => p.value);
  const daySpan = Math.round(
    (sparkline[sparkline.length - 1]!.timestamp - sparkline[0]!.timestamp) / (24 * 60 * 60 * 1000),
  );

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {metricLabel && (
        <span
          style={{
            fontSize: TYPE.scale.xs,
            color: COLORS.textSecondary,
            flexShrink: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: 80,
          }}
        >
          {metricLabel}
        </span>
      )}
      {currentValue !== undefined && (
        <span
          style={{
            fontSize: TYPE.scale.md,
            fontWeight: TYPE.weight.semibold,
            color: COLORS.text,
            flexShrink: 0,
          }}
        >
          {unit && !unit.startsWith("%") ? `${unit}` : ""}
          {formatMetricValue(currentValue)}
          {unit === "%" ? "%" : ""}
        </span>
      )}
      <Sparkline values={values} width={120} height={24} />
      {daySpan > 0 && (
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, flexShrink: 0 }}>
          ({daySpan}d)
        </span>
      )}
    </div>
  );
}

function Sparkline({
  values,
  width,
  height,
}: {
  values: number[];
  width: number;
  height: number;
}) {
  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const padding = 2;
  const plotHeight = height - padding * 2;
  const stepX = (width - padding * 2) / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = padding + i * stepX;
      const y = padding + plotHeight - ((v - min) / range) * plotHeight;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke={COLORS.accent}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function formatMetricValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
