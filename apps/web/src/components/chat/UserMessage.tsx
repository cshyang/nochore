// apps/web/src/components/chat/UserMessage.tsx
import type { ReactNode } from "react";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";

interface UserMessageProps {
  /** Plain text body. Children allowed for future rich content (mentions, etc.). */
  children: ReactNode;
}

/**
 * Right-aligned bubble for user-authored messages. Periwinkle background,
 * white text, max-width 65% of the column so the asymmetry against the
 * full-width agent message reads clearly.
 */
export function UserMessage({ children }: UserMessageProps) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          background: COLORS.accent,
          color: COLORS.white,
          borderRadius: RADIUS.lg,
          padding: `${SPACE[2]}px ${SPACE[3]}px`,
          fontSize: TYPE.scale.sm,
          lineHeight: TYPE.leading.snug,
          maxWidth: "65%",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}
