import { COLORS } from "~/lib/colors";

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
        borderRadius: 99,
        overflow: "hidden",
        ...style,
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${value}%`,
          background: color,
          borderRadius: 99,
          transition: "width 0.15s ease",
        }}
      />
    </div>
  );
}
