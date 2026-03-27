import { COLORS, RADIUS } from "~/lib/colors";

type BadgeColor = "green" | "yellow" | "orange" | "accent" | "red" | "gray" | "blue" | "read" | "write";

const colorMap: Record<BadgeColor, { bg: string; text: string }> = {
  green: { bg: COLORS.greenDim, text: COLORS.green },
  orange: { bg: COLORS.orangeDim, text: COLORS.orange },
  yellow: { bg: COLORS.orangeDim, text: COLORS.orange },
  accent: { bg: COLORS.accentDim, text: COLORS.accentBright },
  red: { bg: COLORS.redDim, text: COLORS.red },
  gray: { bg: COLORS.accentSubtle, text: COLORS.textSecondary },
  blue: { bg: COLORS.accentDim, text: COLORS.accentBright },
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
        display: "inline-block",
        padding: "4px 12px",
        borderRadius: RADIUS.pill,
        fontSize: 11,
        fontWeight: 600,
        background: c.bg,
        color: c.text,
        letterSpacing: 0.3,
      }}
    >
      {children}
    </span>
  );
}
