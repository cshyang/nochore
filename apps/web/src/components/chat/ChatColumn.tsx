import type { ReactNode, RefObject } from "react";
import { SPACE } from "~/lib/colors";

interface ChatColumnProps {
  /** Children render inside the centered max-width container. */
  children: ReactNode;
  /** Scrollable region ref — `useAgentChatFlow` provides this. */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Max width of message content. Defaults to 560px (closed-panel state). */
  contentMaxWidth?: number;
}

/**
 * Flex layout wrapper for the chat conversation. Fills available horizontal
 * space (between page edge and the right island); internal max-width caps
 * message content so reading width stays readable. Scrollable; the parent
 * connects scrollRef to autoscroll behavior via useAgentChatFlow.
 */
export function ChatColumn({ children, scrollRef, contentMaxWidth = 560 }: ChatColumnProps) {
  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        minWidth: 0,
        overflowY: "auto",
        overflowX: "hidden",
        display: "flex",
        flexDirection: "column",
        padding: `${SPACE[4]}px 0 ${SPACE[3]}px`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: contentMaxWidth,
          minWidth: 0,
          margin: "0 auto",
          padding: `0 ${SPACE[4]}px`,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[3],
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
