import { Badge } from "~/components/Badge";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { humanize } from "~/lib/text-format";
import { formatDuration } from "~/lib/time-format";
import type { RunView } from "~/lib/types";

export function RunHeader({ run }: { run: RunView }) {
  const duration = formatDuration(run.startedAt, run.completedAt);
  const toolCount = run.events.filter((e) => e.type === "tool_called").length;
  const findingCount = run.events.filter((e) => e.type === "finding_recorded").length;

  const statusBadge =
    run.status === "completed" ? (
      <Badge color="green">Completed</Badge>
    ) : run.status === "failed" ? (
      <Badge color="red">Failed</Badge>
    ) : run.status === "stopped" ? (
      <Badge color="yellow">Stopped</Badge>
    ) : run.status === "cancelled" ? (
      <Badge color="yellow">Cancelled</Badge>
    ) : run.status === "waiting_for_approval" ? (
      <Badge color="yellow">Waiting</Badge>
    ) : run.status === "waiting_for_children" ? (
      <Badge color={run.hasActionableApprovals ? "yellow" : "blue"}>
        {run.hasActionableApprovals ? "Needs input" : "Coordinating"}
      </Badge>
    ) : run.status === "queued" ? (
      <Badge color="gray">Queued</Badge>
    ) : (
      <Badge color="blue">Running</Badge>
    );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 10,
        padding: "14px 20px",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.sm,
        marginBottom: 16,
      }}
    >
      {statusBadge}
      {duration && <span style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>{duration}</span>}
      <span style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim }}>{"\u00b7"}</span>
      <Badge color="gray">{humanize(run.triggerType ?? "manual")}</Badge>

      <span
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          marginLeft: "auto",
        }}
      >
        {toolCount > 0 && `${toolCount} tool call${toolCount === 1 ? "" : "s"}`}
        {toolCount > 0 && findingCount > 0 && " \u00b7 "}
        {findingCount > 0 && `${findingCount} finding${findingCount === 1 ? "" : "s"}`}
      </span>
    </div>
  );
}
