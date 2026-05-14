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
        // Raised surface with hairline top-edge highlight — luminance + inset shadow,
        // no drop shadow. See AgentCard for the same recipe. Style overrides via the
        // `style` prop still win (e.g., the needs-attention card tints to orangeSubtle).
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.border}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        transition: `background ${MOTION.duration} ${MOTION.ease}, border-color ${MOTION.duration} ${MOTION.ease}`,
        textAlign: onClick ? "left" : undefined,
        width: onClick ? "100%" : undefined,
        display: onClick ? "block" : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (onClick) {
          e.currentTarget.style.background = COLORS.cardRaisedHover;
          e.currentTarget.style.borderColor = COLORS.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (onClick) {
          e.currentTarget.style.background = COLORS.cardRaised;
          e.currentTarget.style.borderColor = COLORS.border;
        }
      }}
    >
      {children}
    </Component>
  );
}
