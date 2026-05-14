import { useState } from "react";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { humanizeToolName } from "~/lib/narrate";
import type { PendingActionView } from "~/lib/types";

interface ChatApprovalCardProps {
  approval: PendingActionView;
  onApprove: (reason: string) => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}

/**
 * Inline approval card rendered as part of an agent message. Two display
 * states: `pending` (full card with buttons) and `resolved` (collapsed
 * chip with decision label + reason).
 */
export function ChatApprovalCard({ approval, onApprove, onReject }: ChatApprovalCardProps) {
  const [decision, setDecision] = useState<"approved" | "skipped" | null>(null);
  const [reason, _setReason] = useState("");

  if (decision !== null) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: decision === "approved" ? COLORS.greenSubtle : COLORS.grayDim,
          border: `1px solid ${decision === "approved" ? COLORS.greenBorder : COLORS.border}`,
          borderRadius: RADIUS.pill,
          padding: `${SPACE[1]}px ${SPACE[3]}px`,
          marginTop: SPACE[2],
          fontSize: TYPE.scale.xs,
          color: decision === "approved" ? COLORS.green : COLORS.textSecondary,
          fontWeight: TYPE.weight.medium,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: decision === "approved" ? COLORS.green : COLORS.textDim,
          }}
        />
        {decision === "approved" ? "Approved" : "Skipped"}
        {reason ? ` · ${reason}` : ""}
      </div>
    );
  }

  return (
    <div
      data-approval-id={approval.id}
      style={{
        background: COLORS.orangeSubtle,
        border: `1px solid ${COLORS.orangeBorder}`,
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[3]}px`,
        marginTop: SPACE[2],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: TYPE.scale.xs,
          color: COLORS.orange,
          fontWeight: TYPE.weight.semibold,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
          marginBottom: SPACE[2],
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: COLORS.orange,
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        Needs your call
      </div>
      <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
        {humanizeToolName(approval.proposal.toolName)}
      </div>
      <div
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textSecondary,
          marginTop: 4,
          marginBottom: SPACE[3],
          lineHeight: TYPE.leading.normal,
        }}
      >
        {approval.proposal.reason}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={async () => {
            await onApprove(reason);
            setDecision("approved");
          }}
          style={{
            background: COLORS.green,
            border: "none",
            borderRadius: RADIUS.md,
            padding: "6px 14px",
            color: COLORS.bg,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.semibold,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={async () => {
            await onReject(reason);
            setDecision("skipped");
          }}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "6px 12px",
            color: COLORS.textSecondary,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
