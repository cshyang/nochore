/**
 * Shared settings components — used by both agent settings page and blueprint setup.
 *
 * Visual pattern (from Linear):
 *   SectionHeading — uppercase label above the card
 *   SettingsCard — grouped container with internal dividers
 *   SettingsRow — icon + title + description + value + optional expand
 */

import { useState } from "react";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { getProviderMetadata } from "~/lib/provider-metadata";

// ---------------------------------------------------------------------------
// Shared style tokens
// ---------------------------------------------------------------------------

export const fieldStyle = {
  width: "100%",
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.lg,
  background: COLORS.bg,
  color: COLORS.text,
  padding: "12px 14px",
  fontSize: TYPE.scale.base,
  lineHeight: TYPE.leading.normal,
  outline: "none",
  fontFamily: TYPE.body,
  transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
} as const;

export function smallActionStyle(color: string) {
  return {
    fontFamily: TYPE.body,
    padding: "4px 10px",
    borderRadius: RADIUS.pill,
    border: `1px solid ${COLORS.border}`,
    background: "transparent",
    color,
    fontSize: TYPE.scale.xs,
    transition: `all ${MOTION.duration} ${MOTION.ease}`,
  };
}

// ---------------------------------------------------------------------------
// SmallAction — pill button with hover feedback (border + background lift)
// ---------------------------------------------------------------------------

export function SmallAction({
  color,
  onClick,
  children,
  type = "button",
  disabled,
}: {
  color: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
}) {
  const base = smallActionStyle(color);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...base,
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = COLORS.surfaceHover;
        e.currentTarget.style.borderColor = color;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.borderColor = COLORS.border;
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toggle — minimal pill switch
// ---------------------------------------------------------------------------

export function Toggle({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        width: 36,
        height: 20,
        border: "none",
        borderRadius: RADIUS.pill,
        background: checked ? COLORS.accent : COLORS.borderStrong,
        position: "relative",
        cursor: "pointer",
        transition: `background ${MOTION.duration} ${MOTION.ease}`,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: RADIUS.pill,
          background: COLORS.white,
          transition: `left ${MOTION.duration} ${MOTION.ease}`,
        }}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ProviderIcon — logo img with emoji fallback from provider metadata
// ---------------------------------------------------------------------------

export function ProviderIcon({
  provider,
  logos,
  size = 20,
}: {
  provider: string;
  logos: Record<string, string>;
  size?: number;
}) {
  const logoUrl = logos[provider];
  if (logoUrl) {
    return <img src={logoUrl} alt="" style={{ width: size, height: size, borderRadius: 4, flexShrink: 0 }} />;
  }
  const meta = getProviderMetadata(provider);
  return <span style={{ fontSize: size, flexShrink: 0 }}>{meta.icon}</span>;
}

// ---------------------------------------------------------------------------
// SectionHeading — group label that sits ABOVE the card
// ---------------------------------------------------------------------------

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: COLORS.textDim,
        textTransform: "uppercase",
        letterSpacing: TYPE.tracking.wide,
        marginTop: 24,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsCard — card container that groups related rows
// ---------------------------------------------------------------------------

export function SettingsCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: COLORS.surface,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SettingsRow — icon + title/description + value + expandable children
// ---------------------------------------------------------------------------

export function SettingsRow({
  icon,
  title,
  description,
  value,
  trailing,
  children,
  defaultExpanded,
  isLast,
  onClick,
  iconColor,
}: {
  icon: string;
  title: string;
  description?: string;
  value?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
  defaultExpanded?: boolean;
  isLast?: boolean;
  onClick?: () => void;
  iconColor?: string;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const isExpandable = !!children;
  const isClickable = isExpandable || !!onClick;

  return (
    <div
      style={{
        borderBottom: isLast ? "none" : `1px solid ${COLORS.border}`,
      }}
    >
      {/* Header row — always visible */}
      <button
        type="button"
        onClick={() => {
          if (onClick) onClick();
          else if (isExpandable) setExpanded(!expanded);
        }}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 16px",
          cursor: isClickable ? "pointer" : "default",
          transition: `background ${MOTION.duration} ${MOTION.ease}`,
          background: "none",
          border: "none",
          width: "100%",
          textAlign: "left",
          fontFamily: "inherit",
        }}
        onMouseEnter={(e) => {
          if (isClickable) e.currentTarget.style.background = COLORS.surfaceHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {/* Icon */}
        <span
          style={{
            fontSize: 15,
            width: 32,
            height: 32,
            borderRadius: RADIUS.lg,
            background: COLORS.accentDim,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: iconColor ?? COLORS.accent,
          }}
        >
          {icon}
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500, color: COLORS.text }}>{title}</div>
          {description && (
            <div
              style={{
                fontSize: 13,
                color: COLORS.textDim,
                marginTop: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {description}
            </div>
          )}
        </div>

        {/* Value */}
        {value && <span style={{ fontSize: 13, color: COLORS.textSecondary, flexShrink: 0 }}>{value}</span>}

        {/* Trailing element (e.g., toggle) — always visible, stops click propagation */}
        {trailing && (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            style={{
              flexShrink: 0,
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
            }}
          >
            {trailing}
          </button>
        )}

        {/* Chevron */}
        {isExpandable && (
          <span
            style={{
              fontSize: 14,
              color: COLORS.textDim,
              transition: `transform ${MOTION.duration} ${MOTION.ease}`,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          >
            ›
          </span>
        )}
      </button>

      {/* Expanded content */}
      {isExpandable && expanded && (
        <div
          style={{
            padding: "0 16px 16px 62px", // 16px + 32px icon + 14px gap = 62px indent
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
