import { COLORS, RADIUS } from "~/lib/colors";

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
        borderRadius: RADIUS.sharp,
        padding: 20,
        cursor: onClick ? "pointer" : "default",
        transition: "border-color 0.15s ease",
        ...style,
      }}
      onMouseEnter={(e) =>
        onClick && (e.currentTarget.style.borderColor = COLORS.borderLight)
      }
      onMouseLeave={(e) =>
        onClick && (e.currentTarget.style.borderColor = COLORS.border)
      }
    >
      {children}
    </div>
  );
}
