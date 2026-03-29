import { ArrowRight, Check, CircleNotch, Lightning, Warning } from "@phosphor-icons/react";
import { useRealtimeRun } from "@trigger.dev/react-hooks";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Badge } from "~/components/Badge";
import { COLORS, RADIUS } from "~/lib/colors";

type LiveEvent = {
  id: string;
  type: string;
  summary: string;
  timestamp: number;
};

type RunMetadata = {
  events?: LiveEvent[];
  status?: "running" | "waiting_for_approval" | "completed" | "failed";
  cycle?: number;
};

interface LiveRunViewProps {
  triggerRunId: string;
  accessToken: string;
  runId: string;
  onComplete?: () => void;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
}

const EVENT_BORDER_COLORS: Record<string, string> = {
  tool_called: COLORS.accent,
  tool_executed: COLORS.accent,
  agent_message: COLORS.textSecondary,
  finding_recorded: COLORS.green,
  sub_run_started: COLORS.accent,
  sub_run_completed: COLORS.green,
  tool_approval_requested: COLORS.orange,
  tool_approval_resolved: COLORS.orange,
  run_completed: COLORS.green,
  run_failed: COLORS.red,
};

const DEFAULT_BORDER_COLOR = COLORS.textDim;

function getBorderColor(type: string): string {
  return EVENT_BORDER_COLORS[type] ?? DEFAULT_BORDER_COLOR;
}

function getBadgeColor(type: string): "blue" | "green" | "yellow" | "red" | "gray" {
  if (type === "tool_called" || type === "tool_executed") return "blue";
  if (type === "finding_recorded" || type === "run_completed" || type === "sub_run_completed") return "green";
  if (type === "sub_run_started") return "blue";
  if (type === "tool_approval_requested" || type === "tool_approval_resolved") return "yellow";
  if (type === "run_failed") return "red";
  if (type === "agent_message") return "gray";
  return "gray";
}

function getEventIcon(type: string) {
  if (type === "tool_called" || type === "tool_executed") return Lightning;
  if (type === "finding_recorded" || type === "run_completed") return Check;
  if (type === "sub_run_started") return CircleNotch;
  if (type === "sub_run_completed") return Check;
  if (type === "run_failed") return Warning;
  if (type.includes("approval")) return ArrowRight;
  return ArrowRight;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  if (diff < 1000) return "just now";
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const pulseKeyframes = `
@keyframes live-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}
`;

export function LiveRunView({ triggerRunId, accessToken, runId, onComplete }: LiveRunViewProps) {
  const { run, error } = useRealtimeRun(triggerRunId, {
    accessToken,
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const completeFiredRef = useRef(false);
  const [, setTick] = useState(0);

  const meta = (run?.metadata ?? {}) as RunMetadata;
  const events = meta.events ?? [];
  const cycle = meta.cycle;

  // Derive status from two sources:
  // 1. Our custom metadata.status (granular: includes "waiting_for_approval")
  // 2. trigger.dev's platform run.status (safety net: fires even if task crashes before our catch block)
  const platformStatus = (run?.status ?? "").toUpperCase();
  const platformDone =
    platformStatus === "COMPLETED" ||
    platformStatus === "FAILED" ||
    platformStatus === "CANCELED" ||
    platformStatus === "SYSTEM_FAILURE";
  const status = platformDone ? (platformStatus === "COMPLETED" ? "completed" : "failed") : (meta.status ?? "running");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if ((status === "completed" || status === "failed") && !completeFiredRef.current) {
      completeFiredRef.current = true;
      const timer = setTimeout(() => onComplete?.(), 1500);
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
  const isFinished = status === "completed" || status === "failed";

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
            {isActive ? "Live" : isFinished ? (status === "completed" ? "Completed" : "Failed") : "Run"}
          </span>
          {cycle != null && isActive && <span style={{ fontSize: 12, color: COLORS.textDim }}>Cycle {cycle + 1}</span>}
        </div>
        <span style={{ fontSize: 12, color: COLORS.textDim, fontFamily: "monospace" }}>{runId.slice(0, 12)}</span>
      </div>

      {isFinished && (
        <div
          style={{
            padding: "10px 14px",
            background: status === "completed" ? COLORS.greenDim : COLORS.redDim,
            borderLeft: `3px solid ${status === "completed" ? COLORS.green : COLORS.red}`,
            borderRadius: RADIUS.sm,
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13,
            fontWeight: 600,
            color: status === "completed" ? COLORS.green : COLORS.red,
            marginBottom: 4,
          }}
        >
          {status === "completed" ? <Check size={14} weight="bold" /> : <Warning size={14} weight="bold" />}
          {status === "completed" ? "Run completed successfully" : "Run failed"}
        </div>
      )}

      <div ref={scrollRef} style={scrollAreaStyle}>
        {events.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: COLORS.textDim, fontSize: 13 }}>
            Waiting for first event...
          </div>
        )}

        {events.map((event) => {
          const Icon = getEventIcon(event.type);

          return (
            <div key={event.id} style={eventCardStyle(event.type)}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
                  <Icon
                    size={14}
                    weight="bold"
                    style={{ color: getBorderColor(event.type), marginTop: 2, flexShrink: 0 }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Badge color={getBadgeColor(event.type)}>{humanizeType(event.type)}</Badge>
                      <span style={{ fontSize: 11, color: COLORS.textDim }}>{formatRelativeTime(event.timestamp)}</span>
                    </div>
                    <p style={eventSummaryStyle}>{event.summary}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
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

function eventCardStyle(type: string): CSSProperties {
  return {
    padding: "10px 14px",
    background: COLORS.surface,
    border: `1px solid ${COLORS.border}`,
    borderLeft: `3px solid ${getBorderColor(type)}`,
    borderRadius: RADIUS.sm,
    transition: "border-color 0.15s ease",
  };
}

const eventSummaryStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 13,
  lineHeight: 1.5,
  color: COLORS.textSecondary,
};
