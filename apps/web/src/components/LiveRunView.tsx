import { Check, CircleNotch, Warning } from "@phosphor-icons/react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { ApprovalCard } from "~/components/ApprovalCard";
import { EventTimeline } from "~/components/EventTimeline";
import { deriveLiveRunStatus, derivePendingApproval } from "~/components/run-lifecycle";
import { COLORS, RADIUS } from "~/lib/colors";
import type { PendingActionView } from "~/lib/types";

type LiveEvent = {
  id: string;
  type: string;
  summary: string;
  timestamp: number;
  payload?: Record<string, unknown>;
};

type RunMetadata = {
  events?: LiveEvent[];
  status?: "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled";
  cycle?: number;
};

interface LiveRunViewProps {
  triggerRunId: string;
  accessToken: string;
  runId: string;
  persistedApprovals?: PendingActionView[];
  onComplete?: (status: "completed" | "failed" | "cancelled") => void | Promise<void>;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onAskChat?: (approval: PendingActionView) => void | Promise<void>;
}

const pulseKeyframes = `
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
`;

export function LiveRunView({
  triggerRunId,
  accessToken,
  runId,
  persistedApprovals = [],
  onComplete,
  onApprove,
  onReject,
  onAskChat,
}: LiveRunViewProps) {
  const { run, error } = useRealtimeRun(triggerRunId, {
    accessToken,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const completeFiredRef = useRef(false);
  const [, setTick] = useState(0);

  const meta = (run?.metadata ?? {}) as RunMetadata;
  const events = meta.events ?? [];
  const cycle = meta.cycle;

  const platformStatus = run?.status;
  const status = deriveLiveRunStatus(platformStatus, meta.status);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if ((status === "completed" || status === "failed" || status === "cancelled") && !completeFiredRef.current) {
      completeFiredRef.current = true;
      const timer = setTimeout(() => void onComplete?.(status), 1500);
      return () => clearTimeout(timer);
    }
  }, [status, onComplete]);

  useEffect(() => {
    if (status !== "running" && status !== "waiting_for_approval") return;
    const interval = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(interval);
  }, [status]);

  if (error) {
    return (
      <div style={containerStyle}>
        <div style={errorBannerStyle}>
          <Warning size={16} weight="bold" />
          <span>Failed to connect to run stream: {error.message}</span>
        </div>
      </div>
    );
  }

  if (!run) {
    return (
      <div style={containerStyle}>
        <div style={connectingStyle}>
          <CircleNotch size={18} weight="bold" style={{ animation: "live-pulse 1s ease-in-out infinite" }} />
          <span>Connecting to run...</span>
          <style>{pulseKeyframes}</style>
        </div>
      </div>
    );
  }

  const isActive = status === "running" || status === "waiting_for_approval";
  const isFinished = status === "completed" || status === "failed" || status === "cancelled";
  const pendingApproval = isActive ? derivePendingApproval(runId, events, persistedApprovals) : null;
  const finishTone =
    status === "completed"
      ? { background: COLORS.greenDim, border: COLORS.green, text: COLORS.green, label: "Run completed successfully" }
      : status === "cancelled"
        ? { background: COLORS.orangeSubtle, border: COLORS.orange, text: COLORS.orange, label: "Run cancelled" }
        : { background: COLORS.redDim, border: COLORS.red, text: COLORS.red, label: "Run failed" };

  return (
    <div style={containerStyle}>
      <style>{pulseKeyframes}</style>

      <div style={headerStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {isActive && (
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: COLORS.accent,
                animation: "live-pulse 1.5s ease-in-out infinite",
                flexShrink: 0,
              }}
            />
          )}
          <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.text }}>
            {isActive
              ? "Live"
              : isFinished
                ? status === "completed"
                  ? "Completed"
                  : status === "cancelled"
                    ? "Cancelled"
                    : "Failed"
                : "Run"}
          </span>
          {cycle != null && isActive && <span style={{ fontSize: 12, color: COLORS.textDim }}>Cycle {cycle + 1}</span>}
        </div>
        <span style={{ fontSize: 12, color: COLORS.textDim, fontFamily: "monospace" }}>{runId.slice(0, 12)}</span>
      </div>

      {isFinished && (
        <div
          style={{
            padding: "10px 14px",
            background: finishTone.background,
            borderLeft: `3px solid ${finishTone.border}`,
            borderRadius: RADIUS.sm,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: finishTone.text,
            marginBottom: 4,
          }}
        >
          {status === "completed" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="bold" />}
          {finishTone.label}
        </div>
      )}

      {pendingApproval ? (
        <div style={{ padding: "12px 12px 0" }}>
          <ApprovalCard
            approval={pendingApproval}
            onApprove={onApprove ? (approval) => onApprove(approval.id, "Approved from live run") : undefined}
            onReject={onReject ? (approval) => onReject(approval.id, "Rejected from live run") : undefined}
            onAskChat={onAskChat}
          />
        </div>
      ) : null}

      <div ref={scrollRef} style={scrollAreaStyle}>
        <EventTimeline events={events} timestampFormat="relative" emptyMessage="Waiting for first event..." />
      </div>
    </div>
  );
}

const containerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  background: COLORS.bg,
  border: `1px solid ${COLORS.border}`,
  borderRadius: RADIUS.sm,
  overflow: "hidden",
  height: "100%",
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderBottom: `1px solid ${COLORS.border}`,
  background: COLORS.surface,
  flexShrink: 0,
};

const scrollAreaStyle: CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const connectingStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  padding: 40,
  color: COLORS.textSecondary,
  fontSize: 14,
};

const errorBannerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "14px 16px",
  color: COLORS.red,
  fontSize: 13,
};
