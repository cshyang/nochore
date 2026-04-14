import {
  CaretDown,
  CaretRight,
  CheckCircle,
  CircleNotch,
  ListBullets,
  Play,
  TextAlignLeft,
  WarningCircle,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApprovalCard } from "~/components/ApprovalCard";
import { type ChecklistItem, DraftChecklist } from "~/components/agent-workspace-chrome";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { EventTimeline, type TimelineEvent } from "~/components/EventTimeline";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import {
  buildTimelineEvents,
  extractFinding,
  extractToolNames,
  findLatestStopEvent,
  findWorkItemForApproval,
  getActionableApprovals,
} from "~/lib/run-events";
import { workItemStatusColor } from "~/lib/status-format";
import { humanize } from "~/lib/text-format";
import { formatDuration } from "~/lib/time-format";
import type { RunSummaryView, RunView, WorkItemView } from "~/lib/types";

interface RunDetailProps {
  run: RunView | null;
  hasRuns: boolean;
  onRunNow?: () => void;
  checklistItems?: ChecklistItem[];
  onGoLive?: () => void;
  goingLive?: boolean;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onAskChat?: (approval: RunView["approvals"][number]) => void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunHeader({ run }: { run: RunView }) {
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

function WorkItemsSection({ workItems }: { workItems?: WorkItemView[] }) {
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
          }}
        >
          <Badge color={workItemStatusColor(wi.status)}>{humanize(wi.role)}</Badge>
          <span
            style={{
              fontSize: TYPE.scale.sm,
              color: COLORS.textSecondary,
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
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

function NarrativeCard({
  run,
  summary,
  timelineEvents,
}: {
  run: RunView;
  summary: RunSummaryView;
  timelineEvents: TimelineEvent[];
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const finding = extractFinding(run);
  const toolNames = useMemo(() => extractToolNames(run), [run]);
  const relTime = run.startedAt
    ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(
        -Math.round((Date.now() - new Date(run.startedAt).getTime()) / 60_000),
        "minute",
      )
    : "";

  return (
    <div
      style={{
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.sm,
        padding: 24,
      }}
    >
      {/* Run meta line */}
      <div
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          marginBottom: 10,
        }}
      >
        {humanize(run.triggerType ?? "manual")} &middot; {relTime}
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: TYPE.scale.md,
          color: COLORS.text,
          fontWeight: TYPE.weight.semibold,
          lineHeight: TYPE.leading.snug,
          marginBottom: finding ? 12 : 0,
        }}
      >
        {summary.headline}
      </div>

      {/* Finding text (markdown) */}
      {finding && (
        <div className="run-report-md" style={{ marginBottom: toolNames.length > 0 ? 14 : 0 }}>
          <style>{markdownStyles}</style>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{finding}</ReactMarkdown>
        </div>
      )}

      {/* Tool chips */}
      {toolNames.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {toolNames.map((name) => (
            <span
              key={name}
              style={{
                background: COLORS.surfaceHover,
                borderRadius: RADIUS.pill,
                padding: "4px 10px",
                fontSize: TYPE.scale.xs,
                color: COLORS.textSecondary,
              }}
            >
              {humanize(name)}
            </span>
          ))}
        </div>
      )}

      {/* Expandable details */}
      {timelineEvents.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              color: COLORS.textDim,
              fontSize: TYPE.scale.sm,
              cursor: "pointer",
              background: "none",
              border: "none",
              padding: 0,
              fontFamily: TYPE.body,
              transition: `color ${MOTION.duration} ${MOTION.ease}`,
            }}
          >
            {detailsOpen ? <CaretDown size={12} weight="bold" /> : <CaretRight size={12} weight="bold" />}
            View details
          </button>
          {detailsOpen && (
            <div style={{ ...timelineContainerStyle, marginTop: 10 }}>
              <EventTimeline events={timelineEvents} timestampFormat="absolute" />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function RunDetail({
  run,
  hasRuns,
  onRunNow,
  checklistItems,
  onGoLive,
  goingLive,
  onApprove,
  onReject,
  onAskChat,
}: RunDetailProps) {
  const [showEvents, setShowEvents] = useState(false);
  const hasDraftChecklist = checklistItems && checklistItems.length > 0;

  const timelineEvents = useMemo(() => (run ? buildTimelineEvents(run) : []), [run]);

  // ── Empty state: no runs at all ────────────────────────────────────────
  if (!hasRuns || !run) {
    return (
      <div style={{ flex: 1, padding: "24px 0" }}>
        {hasDraftChecklist && onGoLive ? (
          <DraftChecklist items={checklistItems} onGoLive={onGoLive} goingLive={goingLive ?? false} />
        ) : null}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: hasDraftChecklist ? "40px 24px" : "80px 24px",
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: RADIUS.lg,
              background: COLORS.accentDim,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 16,
            }}
          >
            <Play size={20} weight="bold" color={COLORS.accent} />
          </div>
          <div
            style={{
              fontSize: TYPE.scale.md,
              fontWeight: TYPE.weight.semibold,
              color: COLORS.text,
              fontFamily: TYPE.display,
              marginBottom: 6,
            }}
          >
            No runs yet
          </div>
          <div
            style={{
              fontSize: TYPE.scale.base,
              color: COLORS.textSecondary,
              maxWidth: 440,
              lineHeight: TYPE.leading.normal,
              marginBottom: 20,
            }}
          >
            Your agent hasn&apos;t run yet. Click &quot;Run now&quot; to see it in action.
          </div>
          {onRunNow && (
            <Button onClick={onRunNow}>
              <Play size={13} weight="bold" />
              Start first run
            </Button>
          )}
        </div>
      </div>
    );
  }

  const status = (run.status ?? "").toLowerCase();
  const finding = extractFinding(run);
  const actionableApprovals = getActionableApprovals(run);
  const blockingApproval =
    actionableApprovals.find((approval) => approval.workItemId) ?? actionableApprovals[0] ?? null;
  const blockingWorkItem = blockingApproval ? findWorkItemForApproval(run, blockingApproval) : null;
  const stopEvent = findLatestStopEvent(run);
  const approvalArtifacts = (
    <ApprovalArtifacts run={run} onRunNow={onRunNow} onApprove={onApprove} onReject={onReject} onAskChat={onAskChat} />
  );

  // ── Coordinating children ──────────────────────────────────────────────
  if (status === "waiting_for_children") {
    const title = run.hasActionableApprovals ? "Specialist waiting for approval" : "Coordinating specialist work";
    const description = run.hasActionableApprovals
      ? blockingWorkItem
        ? `${humanize(blockingWorkItem.role)} is paused until an approval decision is made.`
        : "A delegated specialist is paused until an approval decision is made."
      : "Specialist work is still in progress.";

    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: "14px 20px",
            background: run.hasActionableApprovals ? COLORS.orangeSubtle : COLORS.accentSubtle,
            border: `1px solid ${run.hasActionableApprovals ? COLORS.orange : COLORS.accentBorder}`,
            borderRadius: RADIUS.sm,
            marginBottom: 16,
          }}
        >
          <CircleNotch
            size={16}
            weight="bold"
            color={run.hasActionableApprovals ? COLORS.orange : COLORS.accent}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              {title}
            </div>
            <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary, lineHeight: TYPE.leading.normal }}>
              {description}
            </div>
          </div>
        </div>
        {timelineEvents.length > 0 && (
          <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((value) => !value)} />
        )}
        {showEvents && (
          <div style={timelineContainerStyle}>
            <EventTimeline events={timelineEvents} timestampFormat="absolute" />
          </div>
        )}
      </div>
    );
  }

  // ── Running / queued ───────────────────────────────────────────────────
  if (status === "running" || status === "queued") {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "80px 24px",
          textAlign: "center",
          flex: 1,
        }}
      >
        <CircleNotch
          size={32}
          weight="bold"
          color={COLORS.accent}
          style={{ animation: "spin 1s linear infinite", marginBottom: 16 }}
        />
        <div
          style={{
            fontSize: TYPE.scale.md,
            fontWeight: TYPE.weight.semibold,
            color: COLORS.text,
            fontFamily: TYPE.display,
            marginBottom: 6,
          }}
        >
          {status === "queued" ? "Run queued..." : "Run in progress..."}
        </div>
        <div style={{ fontSize: TYPE.scale.base, color: COLORS.textSecondary }}>
          Results will appear here when complete.
        </div>
      </div>
    );
  }

  if (status === "waiting_for_approval") {
    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.orangeSubtle,
            border: `1px solid ${COLORS.orange}`,
            borderRadius: RADIUS.sm,
            marginBottom: 16,
          }}
        >
          <WarningCircle size={20} weight="bold" color={COLORS.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              Waiting for approval
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
              }}
            >
              This run is paused until an approval decision is made.
            </div>
          </div>
        </div>
        {timelineEvents.length > 0 && (
          <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((value) => !value)} />
        )}
        {showEvents && (
          <div style={timelineContainerStyle}>
            <EventTimeline events={timelineEvents} timestampFormat="absolute" />
          </div>
        )}
      </div>
    );
  }

  if (status === "stopped") {
    const stopCause = stopEvent?.payload?.cause as string | undefined;
    const stopReason = (stopEvent?.payload?.reason as string | undefined) ?? run.error;
    const stopTitle = stopCause === "approval_expired" ? "Stopped waiting for approval" : "Stopped by human";
    const stopDescription =
      stopReason ??
      (stopCause === "approval_expired"
        ? "This run stopped after the approval window expired."
        : "This run stopped after an approval was declined.");

    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.orangeSubtle,
            border: `1px solid ${COLORS.orange}`,
            borderRadius: RADIUS.sm,
            marginBottom: 16,
          }}
        >
          <WarningCircle size={20} weight="bold" color={COLORS.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              {stopTitle}
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
              }}
            >
              {stopDescription}
            </div>
          </div>
        </div>
        {timelineEvents.length > 0 && (
          <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((value) => !value)} />
        )}
        {showEvents && (
          <div style={timelineContainerStyle}>
            <EventTimeline events={timelineEvents} timestampFormat="absolute" />
          </div>
        )}
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.orangeSubtle,
            border: `1px solid ${COLORS.orange}`,
            borderRadius: RADIUS.sm,
            marginBottom: 16,
          }}
        >
          <WarningCircle size={20} weight="bold" color={COLORS.orange} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              Run cancelled
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
              }}
            >
              {run.error || "This run was cancelled before it finished."}
            </div>
          </div>
        </div>
        {timelineEvents.length > 0 && (
          <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((value) => !value)} />
        )}
        {showEvents && (
          <div style={timelineContainerStyle}>
            <EventTimeline events={timelineEvents} timestampFormat="absolute" />
          </div>
        )}
      </div>
    );
  }

  // ── Narrative view: runs with a summary ────────────────────────────────
  if (run.summary) {
    return (
      <div style={{ flex: 1, padding: "24px 20px", minWidth: 0 }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <NarrativeCard run={run} summary={run.summary} timelineEvents={timelineEvents} />
      </div>
    );
  }

  // ── Failed with no finding ─────────────────────────────────────────────
  if (status === "failed" && !finding) {
    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.redSubtle,
            border: `1px solid ${COLORS.redBorder}`,
            borderRadius: RADIUS.sm,
            marginBottom: 16,
          }}
        >
          <WarningCircle size={20} weight="bold" color={COLORS.red} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.red,
                marginBottom: 4,
              }}
            >
              Run failed
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
              }}
            >
              {run.error || "An unexpected error occurred."}
            </div>
          </div>
        </div>
        {timelineEvents.length > 0 && (
          <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((v) => !v)} />
        )}
        {showEvents && (
          <div style={timelineContainerStyle}>
            <EventTimeline events={timelineEvents} timestampFormat="absolute" />
          </div>
        )}
      </div>
    );
  }

  // ── Completed with no finding ──────────────────────────────────────────
  if (status === "completed" && !finding) {
    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        {approvalArtifacts}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.accentSubtle,
            border: `1px solid ${COLORS.accentBorder}`,
            borderRadius: RADIUS.sm,
            marginBottom: 16,
          }}
        >
          <CheckCircle size={20} weight="bold" color={COLORS.accent} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                fontWeight: TYPE.weight.semibold,
                color: COLORS.text,
                marginBottom: 4,
              }}
            >
              Run completed
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
              }}
            >
              Run completed with no findings to report.
            </div>
          </div>
        </div>
        {timelineEvents.length > 0 && (
          <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((v) => !v)} />
        )}
        {showEvents && (
          <div style={timelineContainerStyle}>
            <EventTimeline events={timelineEvents} timestampFormat="absolute" />
          </div>
        )}
      </div>
    );
  }

  // ── Main report view: finding + event toggle ───────────────────────────
  return (
    <div style={{ flex: 1, padding: "24px 20px", minWidth: 0 }}>
      <RunHeader run={run} />
      <WorkItemsSection workItems={run.workItems} />
      {approvalArtifacts}

      <ViewEventsToggle showEvents={showEvents} onToggle={() => setShowEvents((v) => !v)} hasFinding />

      {showEvents ? (
        <div style={timelineContainerStyle}>
          <EventTimeline events={timelineEvents} timestampFormat="absolute" />
        </div>
      ) : (
        <div className="run-report-md">
          <style>{markdownStyles}</style>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{finding}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}

function ApprovalArtifacts({
  run,
  onRunNow,
  onApprove,
  onReject,
  onAskChat,
}: {
  run: RunView;
  onRunNow?: () => void;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onAskChat?: (approval: RunView["approvals"][number]) => void | Promise<void>;
}) {
  if (run.approvals.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 16 }}>
      {run.approvals.map((approval) => {
        const workItem = findWorkItemForApproval(run, approval);
        const title = workItem ? `${humanize(workItem.role)} approval` : undefined;

        return (
          <ApprovalCard
            key={approval.id}
            approval={approval}
            title={title}
            onApprove={onApprove ? (item) => onApprove(item.id, "Approved from run detail") : undefined}
            onReject={onReject ? (item) => onReject(item.id, "Rejected from run detail") : undefined}
            onAskChat={onAskChat}
            onRerun={approval.status === "expired" && onRunNow ? () => onRunNow() : undefined}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toggle button
// ---------------------------------------------------------------------------

function ViewEventsToggle({
  showEvents,
  onToggle,
  hasFinding = false,
}: {
  showEvents: boolean;
  onToggle: () => void;
  hasFinding?: boolean;
}) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Button variant="ghost" size="sm" onClick={onToggle}>
        {showEvents ? (
          <>
            <TextAlignLeft size={13} weight="bold" />
            {hasFinding ? "View finding" : "Hide events"}
          </>
        ) : (
          <>
            <ListBullets size={13} weight="bold" />
            View events
          </>
        )}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const timelineContainerStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 6,
};

const markdownStyles = `
  .run-report-md {
    color: ${COLORS.text};
    font-family: ${TYPE.body};
    font-size: ${TYPE.scale.base};
    line-height: ${TYPE.leading.normal};
    word-break: break-word;
  }
  .run-report-md h1 {
    font-family: ${TYPE.display};
    font-size: ${TYPE.scale.lg};
    font-weight: ${TYPE.weight.bold};
    margin: 0 0 12px;
    color: ${COLORS.text};
    line-height: ${TYPE.leading.tight};
  }
  .run-report-md h2 {
    font-family: ${TYPE.display};
    font-size: ${TYPE.scale.md};
    font-weight: ${TYPE.weight.semibold};
    margin: 24px 0 8px;
    color: ${COLORS.text};
    line-height: ${TYPE.leading.snug};
  }
  .run-report-md h3 {
    font-family: ${TYPE.display};
    font-size: ${TYPE.scale.base};
    font-weight: ${TYPE.weight.semibold};
    margin: 20px 0 6px;
    color: ${COLORS.text};
  }
  .run-report-md h4 {
    font-size: ${TYPE.scale.sm};
    font-weight: ${TYPE.weight.semibold};
    margin: 16px 0 4px;
    color: ${COLORS.textSecondary};
    text-transform: uppercase;
    letter-spacing: ${TYPE.tracking.wide};
  }
  .run-report-md p {
    margin: 0 0 12px;
    color: ${COLORS.textSecondary};
  }
  .run-report-md ul, .run-report-md ol {
    margin: 0 0 12px;
    padding-left: 20px;
    color: ${COLORS.textSecondary};
  }
  .run-report-md li {
    margin-bottom: 4px;
  }
  .run-report-md strong {
    color: ${COLORS.text};
    font-weight: ${TYPE.weight.semibold};
  }
  .run-report-md a {
    color: ${COLORS.accent};
    text-decoration: none;
  }
  .run-report-md a:hover {
    text-decoration: underline;
  }
  .run-report-md code {
    font-family: ${TYPE.mono};
    font-size: 0.9em;
    background: ${COLORS.bgRaised};
    padding: 2px 6px;
    border-radius: ${RADIUS.sm}px;
    color: ${COLORS.text};
  }
  .run-report-md pre {
    background: ${COLORS.bgRaised};
    border: 1px solid ${COLORS.border};
    border-radius: ${RADIUS.sm}px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 0 0 12px;
  }
  .run-report-md pre code {
    background: none;
    padding: 0;
    font-size: ${TYPE.scale.sm};
  }
  .run-report-md table {
    width: 100%;
    border-collapse: collapse;
    margin: 0 0 12px;
    font-size: ${TYPE.scale.sm};
  }
  .run-report-md th {
    text-align: left;
    padding: 8px 12px;
    border-bottom: 1px solid ${COLORS.borderStrong};
    color: ${COLORS.text};
    font-weight: ${TYPE.weight.semibold};
    font-size: ${TYPE.scale.xs};
    text-transform: uppercase;
    letter-spacing: ${TYPE.tracking.wide};
  }
  .run-report-md td {
    padding: 8px 12px;
    border-bottom: 1px solid ${COLORS.border};
    color: ${COLORS.textSecondary};
  }
  .run-report-md blockquote {
    border-left: 3px solid ${COLORS.accent};
    margin: 0 0 12px;
    padding: 8px 16px;
    color: ${COLORS.textSecondary};
    background: ${COLORS.accentSubtle};
    border-radius: 0 ${RADIUS.sm}px ${RADIUS.sm}px 0;
  }
  .run-report-md hr {
    border: none;
    border-top: 1px solid ${COLORS.border};
    margin: 20px 0;
  }
`;
