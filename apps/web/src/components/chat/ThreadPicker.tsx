// apps/web/src/components/chat/ThreadPicker.tsx
import { CaretDown, Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { ConversationThreadSummaryView } from "~/lib/types";

interface ThreadPickerProps {
  threads: ConversationThreadSummaryView[];
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

/**
 * Header dropdown showing the active thread title. Clicking opens a flyout
 * with all threads + a "New thread" action. Replaces the left rail of the
 * previous design.
 */
export function ThreadPicker({ threads, activeThreadId, onSelectThread, onCreateThread }: ThreadPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const active = threads.find((t) => t.id === activeThreadId) ?? threads[0];
  const activeTitle = active?.title ?? "New thread";

  // Click-away to close
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          padding: "4px 10px",
          fontSize: TYPE.scale.sm,
          color: COLORS.text,
          fontWeight: TYPE.weight.medium,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.borderStrong)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
      >
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeTitle}
        </span>
        <CaretDown size={12} color={COLORS.textDim} weight="bold" />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 240,
            maxWidth: 320,
            background: COLORS.cardRaised,
            border: `1px solid ${COLORS.borderStrong}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            borderRadius: RADIUS.lg,
            padding: 4,
            zIndex: 10,
          }}
        >
          {threads.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                onSelectThread(t.id);
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                padding: "8px 10px",
                background: t.id === activeThreadId ? COLORS.accentSurface : "transparent",
                border: "none",
                borderRadius: RADIUS.sm,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (t.id !== activeThreadId) e.currentTarget.style.background = COLORS.surfaceHover;
              }}
              onMouseLeave={(e) => {
                if (t.id !== activeThreadId) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  fontSize: TYPE.scale.sm,
                  color: COLORS.text,
                  fontWeight: TYPE.weight.medium,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 280,
                }}
              >
                {t.title}
              </span>
              <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
                {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleDateString() : "Empty"}
              </span>
            </button>
          ))}
          <div style={{ height: 1, background: COLORS.border, margin: "4px 0" }} />
          <button
            type="button"
            onClick={() => {
              onCreateThread();
              setOpen(false);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderRadius: RADIUS.sm,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: TYPE.scale.sm,
              color: COLORS.accent,
              fontWeight: TYPE.weight.medium,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentSurface)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Plus size={12} weight="bold" />
            <span>New thread</span>
          </button>
        </div>
      )}
    </div>
  );
}
