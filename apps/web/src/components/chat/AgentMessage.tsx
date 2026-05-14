// apps/web/src/components/chat/AgentMessage.tsx
import type { ReactNode } from "react";
import { COLORS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";

interface AgentMessageProps {
  /** Message body — markdown-rendered prose, RunCard, ApprovalCard, etc. */
  children: ReactNode;
  /** ISO timestamp of when the message was authored. Optional. */
  timestamp?: string;
}

/**
 * Full-column-width container for agent-authored messages. No background,
 * no bubble — just text on the page. A small meta line (green dot +
 * "Agent · {relative time}") sits above the content.
 */
export function AgentMessage({ children, timestamp }: AgentMessageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE[1] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: COLORS.green }} />
        <span>Agent{timestamp ? ` · ${formatRelativeTime(timestamp)}` : ""}</span>
      </div>
      <div
        style={{
          color: COLORS.text,
          fontSize: TYPE.scale.sm,
          lineHeight: TYPE.leading.normal,
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
