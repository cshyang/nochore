import { COLORS, RADIUS, MOTION } from "~/lib/colors";

type ButtonVariant = "primary" | "secondary" | "ghost" | "success";
type ButtonSize = "sm" | "md" | "lg";

const base: React.CSSProperties = {
  border: "none",
  borderRadius: RADIUS.md,
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: "inherit",
  transition: `all ${MOTION.duration} ${MOTION.ease}`,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const sizes: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "8px 12px", fontSize: 13 },
  md: { padding: "12px 24px", fontSize: 14 },
  lg: { padding: "12px 32px", fontSize: 15 },
};

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: COLORS.accent, color: COLORS.white },
  secondary: {
    background: COLORS.surfaceHover,
    color: COLORS.text,
    border: `1px solid ${COLORS.border}`,
  },
  ghost: { background: "transparent", color: COLORS.textSecondary },
  success: { background: COLORS.green, color: COLORS.black },
};

const hoverStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: COLORS.accentBright },
  secondary: { background: COLORS.surfaceHover },
  ghost: { color: COLORS.text },
  success: { opacity: 0.9 },
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  onClick,
  style,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button
      onClick={onClick}
      style={{ ...base, ...sizes[size], ...variants[variant], ...style }}
      onMouseEnter={(e) => {
        const hover = hoverStyles[variant];
        if (hover.background) e.currentTarget.style.background = hover.background as string;
        if (hover.color) e.currentTarget.style.color = hover.color as string;
        if (hover.opacity !== undefined) e.currentTarget.style.opacity = String(hover.opacity);
      }}
      onMouseLeave={(e) => {
        const base = variants[variant];
        e.currentTarget.style.background = (base.background as string) ?? "";
        e.currentTarget.style.color = (base.color as string) ?? "";
        e.currentTarget.style.opacity = "1";
        // Re-apply any style overrides from props
        if (style?.background) e.currentTarget.style.background = style.background as string;
        if (style?.color) e.currentTarget.style.color = style.color as string;
      }}
    >
      {children}
    </button>
  );
}
