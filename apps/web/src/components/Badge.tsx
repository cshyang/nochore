import { COLORS, RADIUS } from "~/lib/colors";

type BadgeColor = "green" | "yellow" | "accent" | "red" | "gray" | "blue";

const colorMap: Record<BadgeColor, { bg: string; text: string }> = {
  green: { bg: COLORS.greenDim, text: COLORS.green },
  yellow: { bg: COLORS.yellowDim, text: COLORS.yellow },
  accent: { bg: COLORS.accentDim, text: COLORS.accentLight },
  red: { bg: COLORS.redDim, text: COLORS.red },
  gray: { bg: COLORS.grayDim, text: COLORS.textSecondary },
  blue: { bg: COLORS.blueDim, text: COLORS.blue },
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
        borderRadius: 99,
        fontSize: 12,
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
