import { COLORS, MOTION, RADIUS } from "~/lib/colors";

export function ProgressBar({
  value,
  color = COLORS.accent,
  style,
}: {
  value: number;
  color?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        height: 8,
        background: COLORS.surfaceHover,
        borderRadius: RADIUS.pill,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: RADIUS.pill,
          transition: `width ${MOTION.duration} ${MOTION.ease}`,
        }}
      />
    </div>
  );
}
