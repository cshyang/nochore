import { ArrowClockwise, ChatCircleDots, Check, X } from "@phosphor-icons/react";
import { Button } from "~/components/Button";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import { humanizeToolName } from "~/lib/narrate";
import type { PendingActionView } from "~/lib/types";

interface ApprovalCardProps {
  approval: PendingActionView;
  title?: string;
  onApprove?: (approval: PendingActionView) => void | Promise<void>;
  onReject?: (approval: PendingActionView) => void | Promise<void>;
  onAskChat?: (approval: PendingActionView) => void | Promise<void>;
  onRerun?: (approval: PendingActionView) => void | Promise<void>;
}

export function ApprovalCard({ approval, title, onApprove, onReject, onAskChat, onRerun }: ApprovalCardProps) {
  const statusTone =
    approval.status === "approved"
      ? { bg: COLORS.greenDim, border: COLORS.green, text: COLORS.green }
      : approval.status === "rejected" || approval.status === "blocked"
        ? { bg: COLORS.redDim, border: COLORS.red, text: COLORS.red }
        : approval.status === "expired"
          ? { bg: COLORS.orangeSubtle, border: COLORS.orange, text: COLORS.orange }
          : { bg: COLORS.orangeSubtle, border: COLORS.orange, text: COLORS.orange };

  const inputPreview = truncate(JSON.stringify(approval.proposal.toolInput, null, 2), 220);
  const expiresLabel = approval.expiresAt ? new Date(approval.expiresAt).toLocaleString() : null;

  return (
    <div
      style={{
        display: "grid",
        gap: 12,
        padding: "14px 16px",
        borderRadius: RADIUS.sm,
        border: `1px solid ${statusTone.border}`,
        background: statusTone.bg,
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
            {title ?? defaultTitle(approval.status)}
          </div>
          <div style={{ fontSize: TYPE.scale.base, color: COLORS.text }}>
            {humanizeToolName(approval.proposal.toolName)}
          </div>
        </div>
        <div style={{ fontSize: TYPE.scale.xs, color: statusTone.text, fontWeight: TYPE.weight.semibold }}>
          {humanizeStatus(approval.status)}
        </div>
      </div>

      <div style={{ display: "grid", gap: 8 }}>
        <Detail label="Reason" value={approval.proposal.reason} />
        {expiresLabel ? <Detail label="Expires" value={expiresLabel} /> : null}
        {approval.resolvedReason ? <Detail label="Decision" value={approval.resolvedReason} /> : null}
        <Detail label="Input" value={inputPreview} mono />
      </div>

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

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 3 }}>
      <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, textTransform: "uppercase", letterSpacing: 0.8 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: TYPE.scale.sm,
          color: COLORS.textSecondary,
          lineHeight: TYPE.leading.normal,
          fontFamily: mono ? "monospace" : TYPE.body,
          whiteSpace: mono ? "pre-wrap" : "normal",
          wordBreak: "break-word",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function defaultTitle(status: PendingActionView["status"]): string {
  switch (status) {
    case "approved":
      return "Approval completed";
    case "rejected":
    case "blocked":
      return "Approval rejected";
    case "expired":
      return "Approval expired";
    default:
      return "Approval needed";
  }
}

function humanizeStatus(status: PendingActionView["status"]): string {
  if (status === "expired") {
    return "Expired";
  }
  if (status === "pending") {
    return "Waiting";
  }
  if (status === "approved") {
    return "Approved";
  }
  if (status === "blocked") {
    return "Blocked";
  }
  if (status === "rejected") {
    return "Rejected";
  }
  return status;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}
