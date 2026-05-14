import { ArrowUp } from "@phosphor-icons/react";
import { type RefObject, useEffect, useState } from "react";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";

interface ScrollPastPillProps {
  /** Ref to the scroll container so we can detect scroll position. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The element id of the pending-approval card. Used to scroll into view. */
  approvalElementId?: string;
  /** Number of pending approvals — pluralizes the label. */
  pendingCount: number;
}

/**
 * Sticky pill that surfaces a pending approval when the user has scrolled
 * past it. Click to scroll the approval back into view.
 */
export function ScrollPastPill({ scrollRef, approvalElementId, pendingCount }: ScrollPastPillProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!approvalElementId || pendingCount === 0) {
      setVisible(false);
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) return;
    const targetId = approvalElementId;
    const check = () => {
      const target = document.querySelector(`[data-approval-id="${targetId}"]`);
      if (!target) {
        setVisible(false);
        return;
      }
      const tRect = target.getBoundingClientRect();
      const sRect = scroller.getBoundingClientRect();
      // Approval is "scrolled past" when its bottom is above the scroller's visible top.
      setVisible(tRect.bottom < sRect.top);
    };
    check();
    scroller.addEventListener("scroll", check);
    return () => scroller.removeEventListener("scroll", check);
  }, [scrollRef, approvalElementId, pendingCount]);

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (!approvalElementId) return;
        document
          .querySelector(`[data-approval-id="${approvalElementId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      style={{
        position: "absolute",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: COLORS.orange,
        color: COLORS.bg,
        border: "none",
        borderRadius: RADIUS.pill,
        padding: "6px 14px",
        fontSize: TYPE.scale.xs,
        fontWeight: TYPE.weight.semibold,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        zIndex: 5,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <ArrowUp size={12} weight="bold" />
      {pendingCount} pending approval{pendingCount === 1 ? "" : "s"}
    </button>
  );
}
