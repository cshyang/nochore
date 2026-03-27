import { COLORS, RADIUS } from "~/lib/colors";

type BadgeColor = "green" | "yellow" | "orange" | "accent" | "red" | "gray" | "blue" | "read" | "write";

const colorMap: Record<BadgeColor, { bg: string; text: string }> = {
  green: { bg: COLORS.greenDim, text: COLORS.green },
  orange: { bg: COLORS.orangeDim, text: COLORS.orange },
  yellow: { bg: COLORS.orangeDim, text: COLORS.orange },
  accent: { bg: COLORS.accentDim, text: COLORS.accent },
  red: { bg: COLORS.redDim, text: COLORS.red },
  gray: { bg: "rgba(110, 106, 122, 0.12)", text: COLORS.textSecondary },
  blue: { bg: COLORS.accentDim, text: COLORS.accent },
  read: { bg: COLORS.readDim, text: COLORS.read },
  write: { bg: COLORS.writeDim, text: COLORS.write },
};

export function Badge({
  color = "gray",
  children,
}: {
  color?: BadgeColor;
  children: React.ReactNode;
}) {
  const c = colorMap[color] || colorMap.gray;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "3px 10px",
        borderRadius: RADIUS.pill,
        fontSize: 11,
        fontWeight: 500,
        lineHeight: 1.4,
        background: c.bg,
        color: c.text,
      }}
    >
      {children}
    </span>
  );
}
