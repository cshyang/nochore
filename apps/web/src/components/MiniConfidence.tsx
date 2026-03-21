import { COLORS } from "~/lib/colors";

export function MiniConfidence({ value }: { value: number }) {
  const color =
    value >= 80
      ? COLORS.green
      : value >= 60
        ? COLORS.yellow
        : COLORS.textSecondary;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <div
        style={{
          width: 40,
          height: 4,
          background: COLORS.surfaceHover,
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${value}%`,
            background: color,
            borderRadius: 99,
          }}
        />
      </div>
      <span style={{ color: COLORS.textDim }}>{value}%</span>
    </div>
  );
}
