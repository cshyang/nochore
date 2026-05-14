import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useState } from "react";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { formatDuration, formatTime } from "~/lib/time-format";
import type { WorkItemView } from "~/lib/types";

interface WorkItemListProps {
  workItems: WorkItemView[];
  selectedWorkItemId: string | null;
  onSelect: (workItemId: string) => void;
  activeWorkItemId?: string | null;
}

interface DateGroup {
  label: string;
  workItems: WorkItemView[];
}

function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const runDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (runDay.getTime() === today.getTime()) return "Today";
  if (runDay.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function groupWorkItemsByDate(workItems: WorkItemView[]): DateGroup[] {
  const groups: DateGroup[] = [];
  let currentLabel: string | null = null;
  let currentGroup: WorkItemView[] = [];

  for (const workItem of workItems) {
    const label = getDateGroup(workItem.startedAt ?? workItem.createdAt);
    if (label !== currentLabel) {
      if (currentLabel !== null && currentGroup.length > 0) {
        groups.push({ label: currentLabel, workItems: currentGroup });
      }
      currentLabel = label;
      currentGroup = [workItem];
    } else {
      currentGroup.push(workItem);
    }
  }

  if (currentLabel !== null && currentGroup.length > 0) {
    groups.push({ label: currentLabel, workItems: currentGroup });
  }

  return groups;
}

function statusColor(workItem: WorkItemView): string {
  switch (workItem.status) {
    case "completed":
      return COLORS.green;
    case "failed":
      return COLORS.red;
    case "stopped":
    case "cancelled":
      return COLORS.orange;
    case "waiting_for_approval":
    case "waiting_for_input":
      return COLORS.orange;
    case "queued":
    case "running":
    case "waiting_for_tasks":
      return COLORS.accent;
  }
}

function workItemTitle(workItem: WorkItemView): string {
  return workItem.title ?? humanizeWorkItemKind(workItem.kind);
}

export function humanizeWorkItemKind(kind: WorkItemView["kind"]): string {
  switch (kind) {
    case "chat_turn":
      return "Chat turn";
    case "run":
      return "Run";
    case "delegated_task":
      return "Delegated task";
    case "scheduled_check":
      return "Scheduled check";
    case "external_event":
      return "External event";
  }
}

function CollapsedRail({
  workItems,
  selectedWorkItemId,
  activeWorkItemId,
  onSelect,
  onExpand,
}: WorkItemListProps & { onExpand: () => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div
      style={{
        width: 48,
        flexShrink: 0,
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        overflowY: "auto",
        scrollbarWidth: "none",
      }}
    >
      <style>{`
        @keyframes workItemRailPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(90, 122, 205, 0.4); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(90, 122, 205, 0); }
        }
      `}</style>
      <button
        type="button"
        onClick={onExpand}
        style={{
          width: 28,
          height: 28,
          borderRadius: RADIUS.md,
          border: "none",
          background: "transparent",
          color: COLORS.textDim,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 6,
          marginBottom: 8,
          flexShrink: 0,
        }}
        aria-label="Expand activity list"
      >
        <CaretRight size={14} weight="bold" />
      </button>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "0 0 8px" }}>
        {workItems.map((workItem, index) => {
          const color = statusColor(workItem);
          const isSelected = workItem.id === selectedWorkItemId;
          const isRunning = workItem.status === "running" || workItem.id === activeWorkItemId;
          const isHovered = workItem.id === hoveredId;

          return (
            <div
              key={workItem.id}
              style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}
            >
              <button
                type="button"
                onClick={() => onSelect(workItem.id)}
                onMouseEnter={() => setHoveredId(workItem.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{
                  width: isSelected ? 12 : 8,
                  height: isSelected ? 12 : 8,
                  borderRadius: RADIUS.pill,
                  background: color,
                  border: isSelected ? `2px solid ${COLORS.text}` : "2px solid transparent",
                  cursor: "pointer",
                  padding: 0,
                  transition: `all ${MOTION.duration} ${MOTION.ease}`,
                  animation: isRunning ? "workItemRailPulse 2s ease-in-out infinite" : "none",
                  outline: "none",
                }}
                aria-label={`Activity ${index + 1}: ${workItem.status}`}
              />
              {index < workItems.length - 1 && (
                <div style={{ width: 1, height: 10, background: COLORS.border, flexShrink: 0 }} />
              )}
              {isHovered && (
                <div
                  style={{
                    position: "absolute",
                    left: 30,
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.sm,
                    padding: "5px 10px",
                    whiteSpace: "nowrap",
                    zIndex: 30,
                    fontSize: TYPE.scale.xs,
                    color: COLORS.text,
                    pointerEvents: "none",
                    fontWeight: TYPE.weight.medium,
                    fontFamily: TYPE.body,
                  }}
                >
                  {workItemTitle(workItem)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpandedList({
  workItems,
  selectedWorkItemId,
  activeWorkItemId,
  onSelect,
  onCollapse,
}: WorkItemListProps & { onCollapse: () => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groups = groupWorkItemsByDate(workItems);

  return (
    <div
      style={{
        width: 280,
        flexShrink: 0,
        background: COLORS.bg,
        borderRight: `1px solid ${COLORS.border}`,
        overflowY: "auto",
        scrollbarWidth: "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <style>{`
        @keyframes workItemRailPulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(90, 122, 205, 0.4); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(90, 122, 205, 0); }
        }
      `}</style>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "8px 12px 4px 16px",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: TYPE.scale.xs,
            textTransform: "uppercase",
            letterSpacing: TYPE.tracking.wide,
            color: COLORS.textDim,
            fontWeight: TYPE.weight.semibold,
            fontFamily: TYPE.body,
          }}
        >
          Activity
        </span>
        <button
          type="button"
          onClick={onCollapse}
          style={{
            width: 24,
            height: 24,
            borderRadius: RADIUS.sm,
            border: "none",
            background: "transparent",
            color: COLORS.textDim,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          aria-label="Collapse activity list"
        >
          <CaretLeft size={13} weight="bold" />
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "none" }}>
        {groups.map((group) => (
          <div key={group.label}>
            <div
              style={{
                fontSize: TYPE.scale.xs,
                textTransform: "uppercase",
                letterSpacing: TYPE.tracking.wide,
                color: COLORS.textDim,
                padding: "10px 16px 4px",
                fontWeight: TYPE.weight.semibold,
                fontFamily: TYPE.body,
              }}
            >
              {group.label}
            </div>
            {group.workItems.map((workItem) => {
              const isSelected = workItem.id === selectedWorkItemId;
              const isHovered = workItem.id === hoveredId;
              const duration = formatDuration(workItem.startedAt ?? workItem.createdAt, workItem.completedAt);
              const metaLine = [humanizeWorkItemKind(workItem.kind), duration].filter(Boolean).join(" \u00b7 ");

              return (
                <button
                  key={workItem.id}
                  type="button"
                  onClick={() => onSelect(workItem.id)}
                  onMouseEnter={() => setHoveredId(workItem.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    width: "100%",
                    padding: "8px 16px",
                    cursor: "pointer",
                    borderRadius: RADIUS.sm,
                    border: "none",
                    borderLeft: isSelected ? `2px solid ${COLORS.accent}` : "2px solid transparent",
                    background: isSelected ? COLORS.accentDim : isHovered ? COLORS.surfaceHover : "transparent",
                    transition: `background ${MOTION.duration} ${MOTION.ease}`,
                    outline: "none",
                    textAlign: "left",
                    fontFamily: TYPE.body,
                  }}
                >
                  <div
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: RADIUS.pill,
                      background: statusColor(workItem),
                      marginTop: 6,
                      flexShrink: 0,
                      animation:
                        workItem.status === "running" || workItem.id === activeWorkItemId
                          ? "workItemRailPulse 2s ease-in-out infinite"
                          : "none",
                    }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: TYPE.scale.sm,
                          color: COLORS.text,
                          fontWeight: TYPE.weight.medium,
                          lineHeight: TYPE.leading.snug,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          minWidth: 0,
                        }}
                      >
                        {workItemTitle(workItem)}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: TYPE.scale.xs,
                        color: COLORS.textDim,
                        lineHeight: TYPE.leading.snug,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {formatTime(workItem.startedAt ?? workItem.createdAt)} {"\u00b7"} {metaLine}
                    </div>
                    {workItem.run?.summary?.headline && (
                      <div
                        style={{
                          fontSize: TYPE.scale.xs,
                          color: COLORS.textDim,
                          lineHeight: TYPE.leading.snug,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          marginTop: 1,
                        }}
                      >
                        {workItem.run.summary.headline}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WorkItemList({ workItems, selectedWorkItemId, onSelect, activeWorkItemId }: WorkItemListProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (workItems.length === 0) return null;

  if (collapsed) {
    return (
      <CollapsedRail
        workItems={workItems}
        selectedWorkItemId={selectedWorkItemId}
        activeWorkItemId={activeWorkItemId}
        onSelect={onSelect}
        onExpand={() => setCollapsed(false)}
      />
    );
  }

  return (
    <ExpandedList
      workItems={workItems}
      selectedWorkItemId={selectedWorkItemId}
      activeWorkItemId={activeWorkItemId}
      onSelect={onSelect}
      onCollapse={() => setCollapsed(true)}
    />
  );
}
