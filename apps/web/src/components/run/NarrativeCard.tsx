import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EventTimeline } from "~/components/EventTimeline";
import { markdownStyles, timelineContainerStyle } from "~/components/run/styles";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { extractFinding, extractToolNames } from "~/lib/run-events";
import { humanize } from "~/lib/text-format";
import type { RunSummaryView, RunView, TimelineEvent } from "~/lib/types";

export function NarrativeCard({
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
