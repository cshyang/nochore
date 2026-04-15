import { CheckCircle, CircleNotch, Play, WarningCircle } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApprovalCard } from "~/components/ApprovalCard";
import { type ChecklistItem, DraftChecklist } from "~/components/agent-workspace-chrome";
import { Badge } from "~/components/Badge";
import { Button } from "~/components/Button";
import { EventTimeline } from "~/components/EventTimeline";
import { NarrativeCard } from "~/components/run/NarrativeCard";
import { RunHeader } from "~/components/run/RunHeader";
import { RunOutOfRangeNote, RunStatsStrip } from "~/components/run/RunStatsStrip";
import { markdownStyles, timelineContainerStyle } from "~/components/run/styles";
import { ViewEventsToggle } from "~/components/run/ViewEventsToggle";
import { WorkItemsSection } from "~/components/run/WorkItemsSection";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import {
  buildTimelineEvents,
  extractFinding,
  findLatestStopEvent,
  findWorkItemForApproval,
  getActionableApprovals,
} from "~/lib/run-events";
import { isOutOfRange, summarizeRun } from "~/lib/run-stats";
import { humanize } from "~/lib/text-format";
import type { RunView } from "~/lib/types";

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
  // Full run history for this agent; used as baseline for out-of-range stats.
  // isOutOfRange filters internally (excludes non-completed + target).
  priorRuns?: RunView[];
  // Empty-state context: shown only when no runs exist yet.
  agentName?: string;
  nextRunAt?: number | null;
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
  priorRuns,
  agentName,
  nextRunAt,
}: RunDetailProps) {
  const [showEvents, setShowEvents] = useState(false);
  const hasDraftChecklist = checklistItems && checklistItems.length > 0;

  const timelineEvents = useMemo(() => (run ? buildTimelineEvents(run) : []), [run]);
  const stats = useMemo(() => (run ? summarizeRun(run) : null), [run]);
  const outOfRange = useMemo(
    () => (run ? isOutOfRange(run, priorRuns ?? [], "tokens") : undefined),
    [run, priorRuns],
  );

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
            {agentName ? `${agentName} hasn't run yet` : "No runs yet"}
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
            {nextRunAt
              ? `Next scheduled run: ${formatScheduledTime(nextRunAt)}.`
              : "Nothing has happened here yet — kick off a first run to see the agent work."}
          </div>
          {onRunNow && (
            <Button onClick={onRunNow}>
              <Play size={13} weight="bold" />
              {nextRunAt ? "Or run now" : "Start first run"}
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
  const pendingApprovalArtifacts = (
    <PendingApprovalArtifacts
      run={run}
      onRunNow={onRunNow}
      onApprove={onApprove}
      onReject={onReject}
      onAskChat={onAskChat}
    />
  );
  const resolvedApprovalArtifacts = <ResolvedApprovalArtifacts run={run} />;

  // ── Coordinating children ──────────────────────────────────────────────
  if (status === "waiting_for_children") {
    const title = run.hasActionableApprovals ? "Specialist waiting for approval" : "Coordinating specialist work";
    const description = run.hasActionableApprovals
      ? blockingWorkItem
        ? `${humanize(blockingWorkItem.role)} is paused until an approval decision is made.`
        : "A delegated specialist is paused until an approval decision is made."
      : "Specialist work is still in progress.";

    return (
      <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
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
        {resolvedApprovalArtifacts}
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
      <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
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
        {resolvedApprovalArtifacts}
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
      <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
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
        {resolvedApprovalArtifacts}
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
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
        {resolvedApprovalArtifacts}
      </div>
    );
  }

  // ── Narrative view: runs with a summary ────────────────────────────────
  if (run.summary) {
    return (
      <div style={{ flex: 1, padding: "24px 20px", minWidth: 0 }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
        <NarrativeCard run={run} summary={run.summary} timelineEvents={timelineEvents} />
        {resolvedApprovalArtifacts}
      </div>
    );
  }

  // ── Failed with no finding ─────────────────────────────────────────────
  if (status === "failed" && !finding) {
    return (
      <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
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
        {resolvedApprovalArtifacts}
      </div>
    );
  }

  // ── Completed with no finding ──────────────────────────────────────────
  if (status === "completed" && !finding) {
    return (
      <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
        <RunHeader run={run} />
        {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
        <RunOutOfRangeNote outOfRange={outOfRange} />
        <WorkItemsSection workItems={run.workItems} />
        {pendingApprovalArtifacts}
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
              All clean
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
              }}
            >
              Nothing to act on — the agent checked its workspace and didn&apos;t find anything worth changing.
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
        {resolvedApprovalArtifacts}
      </div>
    );
  }

  // ── Main report view: finding + event toggle ───────────────────────────
  return (
    <div style={{ flex: 1, padding: "24px 20px", minWidth: 0 }}>
      <RunHeader run={run} />
      {stats ? <RunStatsStrip stats={stats} outOfRange={outOfRange} /> : null}
      <RunOutOfRangeNote outOfRange={outOfRange} />
      <WorkItemsSection workItems={run.workItems} />
      {pendingApprovalArtifacts}

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
      {resolvedApprovalArtifacts}
    </div>
  );
}

// Pending + expired approvals demand attention — render prominently above
// narrative/status card with full action affordances.
function PendingApprovalArtifacts({
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
  const actionable = run.approvals.filter((a) => a.status === "pending" || a.status === "expired");
  if (actionable.length === 0) return null;

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 16 }}>
      {actionable.map((approval) => {
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

// Resolved approvals are receipts — collapsed by default, single-line rows
// when expanded. Tucked at the bottom so they don't compete with the finding.
function ResolvedApprovalArtifacts({ run }: { run: RunView }) {
  const resolved = run.approvals.filter(
    (a) => a.status === "approved" || a.status === "rejected" || a.status === "blocked",
  );
  if (resolved.length === 0) return null;

  return (
    <details style={{ marginTop: 20 }}>
      <summary
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          cursor: "pointer",
          letterSpacing: TYPE.tracking.wide,
          textTransform: "uppercase",
          fontWeight: TYPE.weight.semibold,
          userSelect: "none",
          padding: "4px 0",
        }}
      >
        Completed actions ({resolved.length})
      </summary>
      <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
        {resolved.map((approval) => {
          const workItem = findWorkItemForApproval(run, approval);
          const title = workItem ? `${humanize(workItem.role)} approval` : undefined;
          return <ApprovalCard key={approval.id} approval={approval} title={title} />;
        })}
      </div>
    </details>
  );
}

// Human-friendly scheduled-run label. Uses the browser locale so we don't
// ship a lookup table for day names.
function formatScheduledTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const runDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysOut = Math.round((runDay.getTime() - today.getTime()) / 86_400_000);

  const time = date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (daysOut === 0) return `today at ${time}`;
  if (daysOut === 1) return `tomorrow at ${time}`;
  if (daysOut > 1 && daysOut < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: "long" })} at ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { month: "short", day: "numeric" })} at ${time}`;
}
