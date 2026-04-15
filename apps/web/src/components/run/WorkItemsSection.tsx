import { Badge } from "~/components/Badge";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { workItemStatusColor } from "~/lib/status-format";
import { humanize } from "~/lib/text-format";
import { formatDuration } from "~/lib/time-format";
import type { WorkItemView } from "~/lib/types";

export function WorkItemsSection({ workItems }: { workItems?: WorkItemView[] }) {
  if (!workItems || workItems.length === 0) return null;

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: TYPE.scale.xs,
          fontWeight: TYPE.weight.semibold,
          color: COLORS.textDim,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
          marginBottom: 2,
        }}
      >
        Work Items
      </div>
      {workItems.map((wi) => (
        <div
          key={wi.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.sm,
            // Without minWidth: 0 the row's min-content width is the sum of its
            // children's min-content widths — which for a long unbreakable
            // title defeats the inner ellipsis and pushes the pane wider.
            minWidth: 0,
          }}
        >
          <Badge color={workItemStatusColor(wi.status)}>{humanize(wi.role)}</Badge>
          <span
            style={{
              fontSize: TYPE.scale.sm,
              color: COLORS.textSecondary,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              // Hover/title gives the full text to curious readers.
            }}
            title={wi.title}
          >
            {wi.title}
          </span>
          {wi.startedAt && wi.completedAt && (
            <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
              {formatDuration(wi.startedAt, wi.completedAt)}
            </span>
          )}
          {wi.error && (
            <span
              style={{ fontSize: TYPE.scale.xs, color: wi.status === "stopped" ? COLORS.orange : COLORS.red }}
              title={wi.error}
            >
              {wi.status === "stopped" ? "Stopped" : "Error"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
