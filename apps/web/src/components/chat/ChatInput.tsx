// apps/web/src/components/chat/ChatInput.tsx
import { ArrowUp } from "@phosphor-icons/react";
import type { KeyboardEvent, RefObject } from "react";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  /** Visual size: `default` for bottom-anchored, `hero` for empty-state centered. */
  variant?: "default" | "hero";
  placeholder?: string;
}

/**
 * Multi-line text input + send button. Send via Cmd/Ctrl+Enter (handled by
 * the caller via onKeyDown) or clicking the send circle. Disabled while a
 * stream is in flight.
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  inputRef,
  isLoading,
  variant = "default",
  placeholder = "Brief or ask anything…",
}: ChatInputProps) {
  const isHero = variant === "hero";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{
        display: "flex",
        gap: SPACE[2],
        alignItems: "flex-end",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: isHero ? 14 : RADIUS.lg,
        padding: isHero ? `${SPACE[3]}px ${SPACE[3]}px` : `${SPACE[2]}px ${SPACE[2]}px`,
        transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
      }}
      onFocusCapture={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
      onBlurCapture={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={isHero ? 2 : 1}
        disabled={isLoading}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          padding: 6,
          fontSize: isHero ? TYPE.scale.base : TYPE.scale.sm,
          color: COLORS.text,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
          lineHeight: TYPE.leading.normal,
          minHeight: 24,
        }}
      />
      <button
        type="submit"
        disabled={isLoading || value.trim().length === 0}
        aria-label="Send"
        style={{
          width: isHero ? 32 : 26,
          height: isHero ? 32 : 26,
          borderRadius: 99,
          background: value.trim().length > 0 && !isLoading ? COLORS.accent : COLORS.surfaceHover,
          color: COLORS.white,
          border: "none",
          cursor: value.trim().length > 0 && !isLoading ? "pointer" : "default",
          display: "grid",
          placeItems: "center",
          transition: `background ${MOTION.duration} ${MOTION.ease}`,
        }}
      >
        <ArrowUp size={isHero ? 14 : 12} weight="bold" />
      </button>
    </form>
  );
}
