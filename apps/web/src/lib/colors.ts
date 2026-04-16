// Nochore Design Tokens (TypeScript)
// Source of truth: design-system.html → global.css (CSS custom properties)
// These TS exports exist for components still using inline styles.
// Prefer var(--token) in CSS when possible.
//
// Fonts: Satoshi (headings) + General Sans (body)
// Icons: Phosphor (light default, regular emphasis, duotone agent identity)
// Grid: 8px base | Radii: 3/6/8/99 (crisp) | Transitions: 0.15s ease
//
// Color philosophy: quiet until important.
// - Orange = needs attention (the only "loud" color)
// - Green = success, running, healthy
// - Red = error/problem
// - Periwinkle = brand/interactive
// - Read (slate blue) = passive tools | Write (warm amber) = active tools
// - Everything else = warm neutral with plum undertone

export const COLORS = {
  // Warm neutral base (plum undertone)
  bg: "#0E0D12",
  bgRaised: "#15141A",
  surface: "#1B1A21",
  surfaceHover: "#222128",
  border: "#2B2935",
  borderStrong: "#3A3845",

  // Brand accent — periwinkle blue
  accent: "#5A7ACD",
  accentBright: "#7090E0",
  accentDim: "rgba(90, 122, 205, 0.14)",
  accentSubtle: "rgba(90, 122, 205, 0.06)",
  accentSurface: "rgba(90, 122, 205, 0.04)",
  accentBorder: "rgba(90, 122, 205, 0.18)",

  // Semantic: present, not shouting
  orange: "#E0905A",
  orangeDim: "rgba(224, 144, 90, 0.12)",
  orangeSubtle: "rgba(224, 144, 90, 0.05)",
  orangeBorder: "rgba(224, 144, 90, 0.22)",
  green: "#6CB48A",
  greenDim: "rgba(108, 180, 138, 0.10)",
  greenSubtle: "rgba(108, 180, 138, 0.05)",
  greenBorder: "rgba(108, 180, 138, 0.20)",
  red: "#D97272",
  redDim: "rgba(217, 114, 114, 0.10)",
  redSubtle: "rgba(217, 114, 114, 0.05)",
  redBorder: "rgba(217, 114, 114, 0.20)",

  // Functional: tool mode colors
  read: "#7CA8C4",
  readDim: "rgba(124, 168, 196, 0.10)",
  write: "#C49B7C",
  writeDim: "rgba(196, 155, 124, 0.10)",

  // Text
  text: "#ECEAF2",
  textSecondary: "#9B97AB",
  textDim: "#8A86A0",

  // Utility
  white: "#FFFFFF",
  black: "#000000",

  // Neutral overlays & scrims
  grayDim: "rgba(110, 106, 122, 0.12)",
  cardOutline: "rgba(107, 103, 128, 0.15)",
  scrimHeavy: "rgba(0, 0, 0, 0.6)",

  // Draft / ghost-hover background
  draftBg: "rgba(224, 144, 90, 0.04)",
} as const;

// Elevation — reusable shadows
export const SHADOW = {
  sm: "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
  md: "0 8px 24px rgba(0,0,0,0.4)",
  xl: "0 24px 80px rgba(0,0,0,0.5)",
} as const;

// Spacing scale (8px grid)
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 24,
  6: 32,
  8: 48,
  10: 64,
  12: 80,
  16: 120,
} as const;

// Border radius scale (crisp direction)
export const RADIUS = {
  sm: 3, // cards, containers, badges
  md: 6, // buttons, inputs
  lg: 8, // modals, overlays
  pill: 99, // pills, avatars
} as const;

// Typography
export const TYPE = {
  display: "'Satoshi', system-ui, sans-serif",
  body: "'General Sans', system-ui, sans-serif",
  mono: "'SF Mono', 'Fira Code', 'Consolas', monospace",
  scale: {
    xs: "0.6875rem", // 11px
    sm: "0.8125rem", // 13px
    base: "0.875rem", // 14px
    md: "1rem", // 16px
    lg: "1.25rem", // 20px
    xl: "1.875rem", // 30px
    "2xl": "2.75rem", // 44px
    "3xl": "3.5rem", // 56px
  },
  leading: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.6,
    loose: 1.75,
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  tracking: {
    tight: "-0.03em",
    normal: "0",
    wide: "0.06em",
  },
} as const;

// Motion
export const MOTION = {
  ease: "cubic-bezier(0.25, 0.1, 0.25, 1)",
  easeOutExpo: "cubic-bezier(0.16, 1, 0.3, 1)",
  easeOutBack: "cubic-bezier(0.34, 1.56, 0.64, 1)",
  duration: "0.15s",
  durationSlow: "0.3s",
} as const;

// Agent signature colors
const AGENT_DEFAULT = { primary: COLORS.accent, dim: COLORS.accentDim };
export const AGENT_COLORS: Record<string, { primary: string; dim: string }> = {};
export function getAgentColor(_agentId: string): { primary: string; dim: string } {
  return AGENT_COLORS[_agentId] ?? AGENT_DEFAULT;
}

export type ColorKey = keyof typeof COLORS;
