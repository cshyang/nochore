import type { CSSProperties } from "react";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type { RunView } from "~/lib/types";

// Bespoke status anchor — used where a run's lifecycle state is the primary
// signal the user needs to read at a glance (RunHeader, RunList rows).
// Deliberately NOT the shared Badge: this component earns its weight via
// the colored dot, border, and optional pulse — applying it broadly would
// collapse the hierarchy that makes status-carrying moments stand out.
//
// size="hero"    → RunHeader identity strip (13px, semibold, full border)
// size="compact" → list rows, dense surfaces (11px, subtle border)

type StatusPillSize = "hero" | "compact";

interface StatusPillProps {
  run: RunView;
  size?: StatusPillSize;
}

interface Tone {
  label: string;
  bg: string;
  border: string;
  text: string;
  dot: string;
  // Pulse signals an active, in-flight state. Steady dots mean "present
  // and waiting" — different cognitive weight from "nothing happening."
  pulse?: boolean;
  dotShape?: "solid" | "ring";
}

function toneFor(run: RunView): Tone {
  switch (run.status) {
    case "completed":
      return {
        label: "Completed",
        bg: COLORS.greenDim,
        border: COLORS.greenBorder,
        text: COLORS.green,
        dot: COLORS.green,
      };
    case "failed":
      return { label: "Failed", bg: COLORS.redDim, border: COLORS.redBorder, text: COLORS.red, dot: COLORS.red };
    case "stopped":
      return {
        label: "Stopped",
        bg: COLORS.orangeDim,
        border: COLORS.orangeBorder,
        text: COLORS.orange,
        dot: COLORS.orange,
      };
    case "cancelled":
      return {
        label: "Cancelled",
        bg: COLORS.orangeDim,
        border: COLORS.orangeBorder,
        text: COLORS.orange,
        dot: COLORS.orange,
        dotShape: "ring",
      };
    case "waiting_for_approval":
      return {
        label: "Waiting",
        bg: COLORS.orangeDim,
        border: COLORS.orangeBorder,
        text: COLORS.orange,
        dot: COLORS.orange,
        pulse: true,
      };
    case "waiting_for_tasks":
      return run.hasActionableApprovals
        ? {
            label: "Needs input",
            bg: COLORS.orangeDim,
            border: COLORS.orangeBorder,
            text: COLORS.orange,
            dot: COLORS.orange,
            pulse: true,
          }
        : {
            label: "Coordinating",
            bg: COLORS.accentDim,
            border: COLORS.accentBorder,
            text: COLORS.accentBright,
            dot: COLORS.accent,
            pulse: true,
          };
    case "queued":
      return {
        label: "Queued",
        bg: COLORS.grayDim,
        border: COLORS.border,
        text: COLORS.textSecondary,
        dot: COLORS.textSecondary,
        dotShape: "ring",
      };
    default:
      return {
        label: "Running",
        bg: COLORS.accentDim,
        border: COLORS.accentBorder,
        text: COLORS.accentBright,
        dot: COLORS.accent,
        pulse: true,
      };
  }
}

const SIZE_STYLES: Record<
  StatusPillSize,
  { padding: string; fontSize: string; weight: number; gap: number; dot: number }
> = {
  hero: { padding: "5px 12px", fontSize: TYPE.scale.sm, weight: TYPE.weight.semibold, gap: 8, dot: 7 },
  compact: { padding: "2px 8px", fontSize: TYPE.scale.xs, weight: TYPE.weight.medium, gap: 6, dot: 6 },
};

export function StatusPill({ run, size = "hero" }: StatusPillProps) {
  const tone = toneFor(run);
  const s = SIZE_STYLES[size];
  const dotStyle: CSSProperties = {
    width: s.dot,
    height: s.dot,
    borderRadius: "50%",
    flexShrink: 0,
    ...(tone.dotShape === "ring"
      ? { background: "transparent", boxShadow: `inset 0 0 0 1.5px ${tone.dot}` }
      : { background: tone.dot }),
    ...(tone.pulse ? { animation: "pulse 1.8s ease-in-out infinite" } : {}),
  };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: s.gap,
        padding: s.padding,
        borderRadius: RADIUS.pill,
        fontSize: s.fontSize,
        fontWeight: s.weight,
        lineHeight: 1.3,
        letterSpacing: "0.005em",
        background: tone.bg,
        color: tone.text,
        border: `1px solid ${tone.border}`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={dotStyle} aria-hidden="true" />
      {tone.label}
    </span>
  );
}
