import { COLORS, RADIUS } from "~/lib/colors";

type ButtonVariant = "primary" | "secondary" | "ghost" | "success";
type ButtonSize = "sm" | "md" | "lg";

const base: React.CSSProperties = {
  border: "none",
  borderRadius: RADIUS.button,
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: "inherit",
  transition: "all 0.15s ease",
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
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.85")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </button>
  );
}
