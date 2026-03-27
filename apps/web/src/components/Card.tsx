import { COLORS, RADIUS, MOTION } from "~/lib/colors";

export function Card({
  children,
  style,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
        ...style,
      }}
      onMouseEnter={(e) =>
        onClick && (e.currentTarget.style.borderColor = COLORS.borderStrong)
      }
      onMouseLeave={(e) =>
        onClick && (e.currentTarget.style.borderColor = COLORS.border)
      }
    >
      {children}
    </div>
  );
}
