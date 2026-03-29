import { CheckCircle, CircleNotch, Play, WarningCircle } from "@phosphor-icons/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ChecklistItem, DraftChecklist } from "~/components/agent-workspace-chrome";
import { Button } from "~/components/Button";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";

export interface ReportRun {
  id: string;
  status?: string;
  startedAt?: string | number | Date;
  completedAt?: string | number | Date;
  error?: string | null;
  triggerType?: string;
  events?: Array<{
    id: string;
    type: string;
    timestamp: string;
    payload: Record<string, unknown>;
  }>;
  result?: {
    headline?: string;
    details?: string[];
    eventsLogged?: number;
    proposals?: Array<{
      id?: string;
      action?: string;
      reason?: string;
      confidence?: number;
    }>;
    steps?: Array<{ step?: string }>;
  };
}

interface RunReportProps {
  run: ReportRun | null;
  hasRuns: boolean;
  onRunNow?: () => void;
  checklistItems?: ChecklistItem[];
  onGoLive?: () => void;
  goingLive?: boolean;
}

function extractFinding(run: ReportRun): string | null {
  const events = run.events;
  if (!events) return null;
  const finding = events.find((e) => e.type === "finding_recorded");
  return (finding?.payload?.text as string) ?? null;
}

function formatDuration(start: string | number | Date | undefined, end: string | number | Date | undefined): string {
  if (!start || !end) return "";
  const startMs = start instanceof Date ? start.getTime() : new Date(start).getTime();
  const endMs = end instanceof Date ? end.getTime() : new Date(end).getTime();
  const seconds = Math.round((endMs - startMs) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function humanize(value: string): string {
  return value
    .replace(/_/g, " ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());
}

export function RunReport({ run, hasRuns, onRunNow, checklistItems, onGoLive, goingLive }: RunReportProps) {
  const hasDraftChecklist = checklistItems && checklistItems.length > 0;

  // Empty state: no runs at all
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
            Your agent hasn't run yet. Click "Run now" to see it in action.
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

  // Running state
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

  // Failed state with no finding
  if (status === "failed" && !finding) {
    return (
      <div style={{ flex: 1, padding: "24px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.redSubtle,
            border: `1px solid ${COLORS.redBorder}`,
            borderRadius: RADIUS.sm,
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
            <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary, lineHeight: TYPE.leading.normal }}>
              {run.error || "Run completed with no findings."}
            </div>
          </div>
        </div>
        <RunMeta run={run} />
      </div>
    );
  }

  // Completed with no finding
  if (!finding) {
    return (
      <div style={{ flex: 1, padding: "24px 0" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
            padding: 20,
            background: COLORS.accentSubtle,
            border: `1px solid ${COLORS.accentBorder}`,
            borderRadius: RADIUS.sm,
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
            <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary, lineHeight: TYPE.leading.normal }}>
              Run completed with no findings.
            </div>
          </div>
        </div>
        <RunMeta run={run} />
      </div>
    );
  }

  // Main report view — finding as markdown
  return (
    <div style={{ flex: 1, padding: "24px 0", minWidth: 0 }}>
      <div className="run-report-md">
        <style>{markdownStyles}</style>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{finding}</ReactMarkdown>
      </div>
      <RunMeta run={run} />
    </div>
  );
}

function RunMeta({ run }: { run: ReportRun }) {
  const duration = formatDuration(run.startedAt, run.completedAt);
  const toolCount = run.events?.filter((e) => e.type === "tool_called").length ?? 0;

  if (!duration && !toolCount) return null;

  return (
    <div
      style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: `1px solid ${COLORS.border}`,
        display: "flex",
        gap: 20,
        flexWrap: "wrap",
        fontSize: TYPE.scale.xs,
        color: COLORS.textDim,
      }}
    >
      {duration && <span>Duration: {duration}</span>}
      {toolCount > 0 && (
        <span>
          {toolCount} tool call{toolCount === 1 ? "" : "s"}
        </span>
      )}
      {run.triggerType && <span>Trigger: {humanize(run.triggerType)}</span>}
    </div>
  );
}

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
