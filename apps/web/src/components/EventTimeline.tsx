import { ArrowRight, Check, CircleNotch, Lightning, Warning } from "@phosphor-icons/react";
import type { CSSProperties } from "react";
import { Badge } from "~/components/Badge";
import { COLORS, RADIUS } from "~/lib/colors";

// --- Types ---

export interface TimelineEvent {
  id: string;
  type: string;
  summary: string;
  timestamp: number; // epoch ms
}

export interface EventTimelineProps {
  events: TimelineEvent[];
  timestampFormat: "relative" | "absolute";
  emptyMessage?: string;
}

// --- Constants & helpers ---

const EVENT_BORDER_COLORS: Record<string, string> = {
  tool_called: COLORS.accent,
  tool_executed: COLORS.accent,
  agent_message: COLORS.textSecondary,
  finding_recorded: COLORS.green,
  sub_run_started: COLORS.accent,
  sub_run_completed: COLORS.green,
  tool_approval_requested: COLORS.orange,
  tool_approval_resolved: COLORS.orange,
  tool_approval_expired: COLORS.orange,
  policy_rule_suggested: COLORS.orange,
  policy_rule_accepted: COLORS.green,
  run_completed: COLORS.green,
  run_failed: COLORS.red,
};

const DEFAULT_BORDER_COLOR = COLORS.textDim;

export function getBorderColor(type: string): string {
  return EVENT_BORDER_COLORS[type] ?? DEFAULT_BORDER_COLOR;
}

export function getBadgeColor(type: string): "blue" | "green" | "yellow" | "red" | "gray" {
  if (type === "tool_called" || type === "tool_executed") return "blue";
  if (type === "finding_recorded" || type === "run_completed" || type === "sub_run_completed") return "green";
  if (type === "sub_run_started") return "blue";
  if (type === "tool_approval_requested" || type === "tool_approval_resolved" || type === "tool_approval_expired") {
    return "yellow";
  }
  if (type === "policy_rule_suggested") return "yellow";
  if (type === "policy_rule_accepted") return "green";
  if (type === "run_failed") return "red";
  if (type === "agent_message") return "gray";
  return "gray";
}

export function getEventIcon(type: string) {
  if (type === "tool_called" || type === "tool_executed") return Lightning;
  if (type === "finding_recorded" || type === "run_completed") return Check;
  if (type === "sub_run_started") return CircleNotch;
  if (type === "sub_run_completed") return Check;
  if (type === "run_failed") return Warning;
  if (type === "policy_rule_suggested") return ArrowRight;
  if (type === "policy_rule_accepted") return Check;
  if (type.includes("approval")) return ArrowRight;
  return ArrowRight;
}

export function humanizeType(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatRelativeTime(timestamp: number): string {
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

export function formatAbsoluteTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// --- Styles ---

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

// --- Component ---

export function EventTimeline({ events, timestampFormat, emptyMessage }: EventTimelineProps) {
  const formatTimestamp = timestampFormat === "relative" ? formatRelativeTime : formatAbsoluteTime;

  if (events.length === 0 && emptyMessage) {
    return <div style={{ padding: 20, textAlign: "center", color: COLORS.textDim, fontSize: 13 }}>{emptyMessage}</div>;
  }

  return (
    <>
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
                    <span style={{ fontSize: 11, color: COLORS.textDim }}>{formatTimestamp(event.timestamp)}</span>
                  </div>
                  <p style={eventSummaryStyle}>{event.summary}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
