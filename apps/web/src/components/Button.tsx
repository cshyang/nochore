import { COLORS, MOTION, RADIUS } from "~/lib/colors";

type ButtonVariant = "primary" | "secondary" | "ghost" | "success";
type ButtonSize = "sm" | "md" | "lg";

const base: React.CSSProperties = {
  border: "none",
  borderRadius: RADIUS.md,
  cursor: "pointer",
  fontWeight: 500,
  fontFamily: "inherit",
  lineHeight: 1,
  whiteSpace: "nowrap",
  transition: `all ${MOTION.duration} ${MOTION.ease}`,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
};

const sizes: Record<ButtonSize, React.CSSProperties> = {
  sm: { padding: "6px 12px", fontSize: 11 },
  md: { padding: "10px 22px", fontSize: 13 },
  lg: { padding: "10px 32px", fontSize: 14 },
};

const variants: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    background: COLORS.accent,
    color: COLORS.white,
    boxShadow: "0 1px 2px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)",
  },
  secondary: {
    background: "transparent",
    color: COLORS.text,
    border: `1px solid ${COLORS.borderStrong}`,
  },
  ghost: { background: "transparent", color: COLORS.textSecondary },
  success: { background: COLORS.green, color: COLORS.black },
};

const hoverStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: { background: COLORS.accentBright },
  secondary: { borderColor: COLORS.textDim },
  ghost: { color: COLORS.text, background: COLORS.surfaceHover },
  success: { opacity: 0.9 },
};

export function Button({
  variant = "primary",
  size = "md",
  children,
  onClick,
  style,
  disabled,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}) {
  const disabledStyle: React.CSSProperties = disabled
    ? { opacity: 0.5, cursor: "not-allowed", pointerEvents: "none" }
    : {};

  return (
    <button
      type="button"
      className="btn"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{ ...base, ...sizes[size], ...variants[variant], ...disabledStyle, ...style }}
      onMouseEnter={(e) => {
        if (disabled) return;
        const hover = hoverStyles[variant];
        if (hover.background) e.currentTarget.style.background = hover.background as string;
        if (hover.color) e.currentTarget.style.color = hover.color as string;
        if (hover.borderColor) e.currentTarget.style.borderColor = hover.borderColor as string;
        if (hover.opacity !== undefined) e.currentTarget.style.opacity = String(hover.opacity);
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        const v = variants[variant];
        e.currentTarget.style.background = (v.background as string) ?? "";
        e.currentTarget.style.color = (v.color as string) ?? "";
        e.currentTarget.style.opacity = "1";
        if (variant === "secondary") e.currentTarget.style.borderColor = COLORS.borderStrong;
        if (variant === "ghost") e.currentTarget.style.background = "transparent";
        if (style?.background) e.currentTarget.style.background = style.background as string;
        if (style?.color) e.currentTarget.style.color = style.color as string;
      }}
    >
      {children}
    </button>
  );
}
