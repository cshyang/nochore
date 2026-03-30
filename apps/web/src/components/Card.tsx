import { COLORS, MOTION, RADIUS } from "~/lib/colors";

export function Card({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  const Component = onClick ? "button" : "div";

  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
        textAlign: onClick ? "left" : undefined,
        width: onClick ? "100%" : undefined,
        display: onClick ? "block" : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) e.currentTarget.style.borderColor = COLORS.borderStrong;
      }}
      onMouseLeave={(e) => {
        if (onClick) e.currentTarget.style.borderColor = COLORS.border;
      }}
    >
      {children}
    </Component>
  );
}
