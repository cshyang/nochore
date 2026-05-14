// apps/web/src/components/chat/ChatHeader.tsx

import { ThreadPicker } from "~/components/chat/ThreadPicker";
import { COLORS, SPACE, TYPE } from "~/lib/colors";
import type { AgentView, ConversationThreadSummaryView } from "~/lib/types";

export type ChatStatus = "idle" | "running" | "needs-you";

interface ChatHeaderProps {
  agent: AgentView;
  threads: ConversationThreadSummaryView[];
  activeThreadId?: string;
  status: ChatStatus;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

const STATUS_COPY: Record<ChatStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Idle", color: COLORS.textDim, pulse: false },
  running: { label: "Running", color: COLORS.green, pulse: true },
  "needs-you": { label: "Needs you", color: COLORS.orange, pulse: true },
};

export function ChatHeader({
  agent,
  threads,
  activeThreadId,
  status,
  onSelectThread,
  onCreateThread,
}: ChatHeaderProps) {
  const s = STATUS_COPY[status];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACE[3],
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <span
        style={{
          fontSize: TYPE.scale.md,
          fontWeight: TYPE.weight.semibold,
          fontFamily: TYPE.display,
          color: COLORS.text,
          letterSpacing: TYPE.tracking.tight,
        }}
      >
        {agent.name}
      </span>
      <ThreadPicker
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        onCreateThread={onCreateThread}
      />
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: s.color,
            ...(s.pulse ? { animation: "pulse 2s ease-in-out infinite" } : {}),
          }}
        />
        <span style={{ fontSize: TYPE.scale.xs, color: s.color, fontWeight: TYPE.weight.medium }}>{s.label}</span>
      </div>
    </div>
  );
}
