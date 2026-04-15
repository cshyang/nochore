import { CaretDown, CaretRight } from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { EventTimeline } from "~/components/EventTimeline";
import { markdownStyles, timelineContainerStyle } from "~/components/run/styles";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { getProviderName } from "~/lib/provider-metadata";
import { extractFinding, extractToolCallSummaries, type ToolCallSummary } from "~/lib/run-events";
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
  const toolCalls = useMemo(() => extractToolCallSummaries(run), [run]);
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
        <div className="run-report-md" style={{ marginBottom: toolCalls.length > 0 ? 14 : 0 }}>
          <style>{markdownStyles}</style>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{finding}</ReactMarkdown>
        </div>
      )}

      {/* Tool chips */}
      {toolCalls.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {toolCalls.map((call) => (
            <ToolCallChip key={call.toolName} call={call} />
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

const PROVIDER_DOT_HUES: Record<string, number> = {
  googleads: 18,
  slack: 280,
  linear: 250,
  notion: 0,
  gmail: 5,
  hubspot: 14,
  shopify: 130,
  meta: 220,
  ga4: 35,
  searchconsole: 200,
};

function providerHue(provider: string): number {
  if (PROVIDER_DOT_HUES[provider] !== undefined) return PROVIDER_DOT_HUES[provider];
  let hash = 0;
  for (let i = 0; i < provider.length; i++) hash = (hash * 31 + provider.charCodeAt(i)) >>> 0;
  return hash % 360;
}

function ToolCallChip({ call }: { call: ToolCallSummary }) {
  const providerLabel = call.provider ? getProviderName(call.provider) : null;
  const action = call.provider ? humanize(call.toolName.slice(call.provider.length + 1)) : humanize(call.toolName);
  const dotColor = call.provider ? `hsl(${providerHue(call.provider)} 60% 55%)` : COLORS.textDim;
  const title = providerLabel
    ? `${providerLabel} · ${action}${call.wasGated ? " · required approval" : ""}`
    : call.toolName;

  return (
    <span
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: COLORS.surfaceHover,
        borderRadius: RADIUS.pill,
        padding: "4px 10px",
        fontSize: TYPE.scale.xs,
        color: COLORS.textSecondary,
        border: call.wasGated ? `1px dashed ${COLORS.orange}` : `1px solid transparent`,
      }}
    >
      <span
        aria-hidden
        style={{ width: 6, height: 6, borderRadius: 999, background: dotColor, display: "inline-block" }}
      />
      {action}
    </span>
  );
}
