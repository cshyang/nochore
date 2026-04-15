import { ArrowClockwise, CaretRight, ChatCircleDots, Check, X } from "@phosphor-icons/react";
import { useState } from "react";
import { Button } from "~/components/Button";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { humanizeToolName } from "~/lib/narrate";
import { formatTime } from "~/lib/time-format";
import type { PendingActionView } from "~/lib/types";

interface ApprovalCardProps {
  approval: PendingActionView;
  title?: string;
  onApprove?: (approval: PendingActionView) => void | Promise<void>;
  onReject?: (approval: PendingActionView) => void | Promise<void>;
  onAskChat?: (approval: PendingActionView) => void | Promise<void>;
  onRerun?: (approval: PendingActionView) => void | Promise<void>;
}

// Dispatcher: pending/expired get the full action-first card; everything
// resolved collapses to a single-line row (click to expand details).
export function ApprovalCard(props: ApprovalCardProps) {
  const isActionable = props.approval.status === "pending" || props.approval.status === "expired";
  return isActionable ? <PendingApprovalCard {...props} /> : <ResolvedApprovalRow {...props} />;
}

// ---------------------------------------------------------------------------
// Pending / expired — action-first card with humanized input + raw disclosure
// ---------------------------------------------------------------------------

function PendingApprovalCard({ approval, title, onApprove, onReject, onAskChat, onRerun }: ApprovalCardProps) {
  const tone =
    approval.status === "expired"
      ? { border: COLORS.orangeBorder, accent: COLORS.orange, tint: COLORS.orangeSubtle }
      : { border: COLORS.orange, accent: COLORS.orange, tint: COLORS.orangeSubtle };
  const toolName = humanizeToolName(approval.proposal.toolName);
  const inputSummary = summarizeToolInput(approval.proposal.toolInput);
  const expiresLabel = approval.expiresAt ? new Date(approval.expiresAt).toLocaleString() : null;

  return (
    <div
      style={{
        display: "grid",
        gap: 10,
        padding: "14px 16px",
        borderRadius: RADIUS.sm,
        border: `1px solid ${tone.border}`,
        background: tone.tint,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
            {title ?? (approval.status === "expired" ? "Approval expired" : "Approval needed")}
          </div>
          <div
            style={{
              fontSize: TYPE.scale.base,
              color: COLORS.text,
              overflowWrap: "anywhere",
            }}
          >
            {toolName}
          </div>
        </div>
        <div
          style={{
            fontSize: TYPE.scale.xs,
            color: tone.accent,
            fontWeight: TYPE.weight.semibold,
            flexShrink: 0,
          }}
        >
          {approval.status === "expired" ? "Expired" : "Waiting"}
        </div>
      </div>

      <Field label="Reason" value={approval.proposal.reason} />
      <Field label="Arguments" value={inputSummary} />
      {expiresLabel ? <Field label="Expires" value={expiresLabel} /> : null}

      <RawInputDisclosure input={approval.proposal.toolInput} />

      {approval.status === "pending" ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {onApprove ? (
            <Button size="sm" onClick={() => void onApprove(approval)}>
              <Check size={14} weight="bold" />
              Approve
            </Button>
          ) : null}
          {onReject ? (
            <Button variant="secondary" size="sm" onClick={() => void onReject(approval)}>
              <X size={14} weight="bold" />
              Reject
            </Button>
          ) : null}
          {onAskChat ? (
            <Button variant="ghost" size="sm" onClick={() => void onAskChat(approval)}>
              <ChatCircleDots size={14} weight="bold" />
              Ask Chat
            </Button>
          ) : null}
        </div>
      ) : approval.status === "expired" && onRerun ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Button variant="secondary" size="sm" onClick={() => void onRerun(approval)}>
            <ArrowClockwise size={14} weight="bold" />
            Run again
          </Button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resolved — single-line row, click to expand
// ---------------------------------------------------------------------------

function ResolvedApprovalRow({ approval, title }: ApprovalCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = resolvedTone(approval.status);
  const toolName = humanizeToolName(approval.proposal.toolName);
  const resolvedLabel = formatResolvedTimestamp(approval);

  return (
    <div
      style={{
        borderRadius: RADIUS.sm,
        borderLeft: `2px solid ${tone.accent}`,
        background: COLORS.surface,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: TYPE.body,
          color: COLORS.text,
          outline: "none",
        }}
        aria-expanded={expanded}
      >
        <CaretRight
          size={12}
          weight="bold"
          color={COLORS.textDim}
          style={{
            transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
            transition: `transform ${MOTION.duration} ${MOTION.ease}`,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: TYPE.scale.xs,
            color: tone.accent,
            fontWeight: TYPE.weight.semibold,
            letterSpacing: TYPE.tracking.wide,
            textTransform: "uppercase",
            flexShrink: 0,
          }}
        >
          {tone.label}
        </span>
        <span
          style={{
            fontSize: TYPE.scale.sm,
            color: COLORS.text,
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title ?? toolName}
        </span>
        {resolvedLabel ? (
          <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, flexShrink: 0 }}>{resolvedLabel}</span>
        ) : null}
      </button>
      {expanded ? (
        <div
          style={{
            padding: "4px 16px 12px 32px",
            display: "grid",
            gap: 8,
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <Field label="Tool" value={toolName} />
          <Field label="Reason" value={approval.proposal.reason} />
          {approval.resolvedReason ? <Field label="Decision" value={approval.resolvedReason} /> : null}
          <RawInputDisclosure input={approval.proposal.toolInput} />
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "grid", gap: 3, minWidth: 0 }}>
      <div
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: TYPE.scale.sm,
          color: COLORS.textSecondary,
          lineHeight: TYPE.leading.normal,
          overflowWrap: "anywhere",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// Raw tool input lives behind <details>. The scroll container uses
// whiteSpace: pre + overflow-x: auto so long unbroken strings (URLs, IDs)
// don't blow out the parent flex layout — x-overflow is contained here,
// not propagated to ancestors.
function RawInputDisclosure({ input }: { input: Record<string, unknown> }) {
  const serialized = JSON.stringify(input, null, 2);
  return (
    <details style={{ minWidth: 0 }}>
      <summary
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          cursor: "pointer",
          listStyle: "none",
          userSelect: "none",
        }}
      >
        View raw input
      </summary>
      <pre
        style={{
          marginTop: 8,
          padding: "8px 10px",
          background: COLORS.bgRaised,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.sm,
          fontFamily: TYPE.mono,
          fontSize: TYPE.scale.xs,
          lineHeight: TYPE.leading.snug,
          color: COLORS.textSecondary,
          whiteSpace: "pre",
          overflowX: "auto",
          overflowY: "auto",
          maxHeight: 220,
          margin: "8px 0 0 0",
        }}
      >
        {serialized}
      </pre>
    </details>
  );
}

function resolvedTone(status: PendingActionView["status"]): { accent: string; label: string } {
  switch (status) {
    case "approved":
      return { accent: COLORS.green, label: "Approved" };
    case "rejected":
      return { accent: COLORS.red, label: "Rejected" };
    case "blocked":
      return { accent: COLORS.red, label: "Blocked" };
    default:
      return { accent: COLORS.textDim, label: status };
  }
}

function formatResolvedTimestamp(approval: PendingActionView): string | null {
  const ts = approval.resolvedAt ?? approval.createdAt;
  if (!ts) return null;
  return formatTime(ts);
}

// Honest summary of tool arguments — no pretend semantic knowledge.
// 0 args → "No arguments"; 1 scalar arg → "key: value"; arrays → count;
// everything else → argument count. Raw is always available behind the
// <details> disclosure.
function summarizeToolInput(input: Record<string, unknown>): string {
  const entries = Object.entries(input ?? {});
  if (entries.length === 0) return "No arguments";

  if (entries.length === 1) {
    const [k, v] = entries[0];
    const label = humanizeKey(k);
    if (v === null || v === undefined) return `${label}: —`;
    if (typeof v === "string") {
      if (v.length === 0) return `${label}: (empty)`;
      return `${label}: ${truncateMidWord(v, 80)}`;
    }
    if (typeof v === "number" || typeof v === "boolean") {
      return `${label}: ${String(v)}`;
    }
    if (Array.isArray(v)) {
      return `${label} (${v.length} item${v.length === 1 ? "" : "s"})`;
    }
    return `${label} (object)`;
  }

  const keys = entries.map(([k]) => humanizeKey(k));
  if (entries.length <= 3) return keys.join(", ");
  return `${entries.length} arguments (${keys.slice(0, 3).join(", ")}, …)`;
}

function humanizeKey(key: string): string {
  // camelCase → "Camel Case", snake_case → "Snake Case"
  const spaced = key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

// Cut at the last whitespace/delimiter before maxLength so we don't land
// mid-token like "customerI…". Falls back to hard cut if there's no good seam.
function truncateMidWord(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const slice = text.slice(0, maxLength);
  const lastSeam = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf(","), slice.lastIndexOf("/"));
  const cutAt = lastSeam > maxLength * 0.5 ? lastSeam : maxLength - 1;
  return `${text.slice(0, cutAt)}…`;
}
