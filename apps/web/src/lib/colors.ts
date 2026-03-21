// Nochore Design Tokens
// Source of truth: .impeccable.md
// Grid: 8px base | Border radius: 2/6/8/99 (crisp) | Transitions: 0.15s ease
// Typography: Satoshi (headings) + General Sans (body)
// Icons: Phosphor (light default, regular emphasis, duotone agent identity)
//
// Color philosophy: quiet until important.
// - Orange = needs attention (the only "loud" color)
// - Red = error/problem
// - Purple = brand/interactive
// - Everything else = neutral slate

export const COLORS = {
  // Warm neutral base (plum undertone, not cold blue)
  bg: "#100F14",
  surface: "#1A1820",
  surfaceHover: "#23202A",
  border: "#2A2630",
  borderLight: "#352F3D",

  // Brand accent — reserved for system/brand only
  accent: "#6C5CE7",
  accentLight: "#8B7CF7",
  accentDim: "rgba(108, 92, 231, 0.15)",
  accentSubtle: "rgba(108, 92, 231, 0.06)",

  // Neutral status — slate-blue for "all good", "running", "active", "handled"
  green: "#7B8A9E",
  greenDim: "rgba(123, 138, 158, 0.12)",

  // Attention: cosmic orange — the ONE color that says "look here"
  yellow: "#D47A3A",
  yellowDim: "rgba(212, 122, 58, 0.10)",
  yellowSubtle: "rgba(212, 122, 58, 0.04)",

  // Error: soft rose — problems, waste, failures
  red: "#E07070",
  redDim: "rgba(224, 112, 112, 0.10)",
  redSubtle: "rgba(224, 112, 112, 0.04)",

  blue: "#7B8A9E",
  blueDim: "rgba(123, 138, 158, 0.12)",

  // Text
  text: "#E8E9ED",
  textSecondary: "#8B8D98",
  textDim: "#838591",

  // Utility
  grayDim: "rgba(139, 141, 152, 0.15)",
  white: "#FFFFFF",
  black: "#000000",
} as const;

// Agent signature colors — all neutral slate now.
// Agents don't need individual colors when the UI is this quiet.
// Their identity comes from their name and position, not decoration.
const SLATE = { primary: "#7B8A9E", dim: "rgba(123, 138, 158, 0.10)" };

export const AGENT_COLORS: Record<string, { primary: string; dim: string }> = {
  "ad-guardian": SLATE,
  "content-sched": SLATE,
  "lead-qual": SLATE,
  "meta-optimizer": SLATE,
  "funnel-monitor": SLATE,
  "invoice-tracker": SLATE,
  "competitor-mon": SLATE,
};

// Fallback for unknown agents
export function getAgentColor(agentId: string): { primary: string; dim: string } {
  return AGENT_COLORS[agentId] ?? SLATE;
}

// Border radius scale (crisp direction)
export const RADIUS = {
  sharp: 2,    // cards, containers
  button: 6,   // buttons, inputs
  modal: 8,    // modals, overlays
  pill: 99,    // badges, pills, avatars
} as const;

export type ColorKey = keyof typeof COLORS;
