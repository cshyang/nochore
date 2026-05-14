import { WarningCircle } from "@phosphor-icons/react";
import { useEffect, useMemo } from "react";
import type { ChecklistItem } from "~/components/agent-workspace-chrome";
import { Button } from "~/components/Button";
import { RunDetail } from "~/components/RunDetail";
import { humanizeWorkItemKind, WorkItemList } from "~/components/WorkItemList";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type { LearnedRuleView, PendingActionView, RunView, WorkItemView } from "~/lib/types";

interface AgentWorkspaceActivityPaneProps {
  runs: RunView[];
  workItems: WorkItemView[];
  selectedWorkItemId: string | null;
  onSelectWorkItem: (workItemId: string) => void;
  activeRunId?: string | null;
  activeWorkItemId?: string | null;
  runError?: string | null;
  onRunNow?: () => void | Promise<void>;
  checklistItems?: ChecklistItem[];
  onGoLive?: () => void;
  goingLive?: boolean;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onAskChat?: (approval: PendingActionView) => void | Promise<void>;
  learnedRuleSuggestions?: LearnedRuleView[];
  onAcceptLearnedRule?: (ruleId: string) => void | Promise<void>;
  onDismissLearnedRule?: (ruleId: string) => void | Promise<void>;
  onSuppressLearnedRule?: (ruleId: string) => void | Promise<void>;
  // Empty-state context propagated down to RunDetail.
  agentName?: string;
  nextRunAt?: number | null;
}

export function AgentWorkspaceActivityPane({
  runs,
  workItems,
  selectedWorkItemId,
  onSelectWorkItem,
  activeWorkItemId,
  runError,
  onRunNow,
  checklistItems,
  onGoLive,
  goingLive,
  onApprove,
  onReject,
  onAskChat,
  learnedRuleSuggestions = [],
  onAcceptLearnedRule,
  onDismissLearnedRule,
  onSuppressLearnedRule,
  agentName,
  nextRunAt,
}: AgentWorkspaceActivityPaneProps) {
  const displayWorkItems = useMemo(() => {
    if (!selectedWorkItemId || workItems.some((workItem) => workItem.id === selectedWorkItemId)) {
      return workItems;
    }

    const placeholder: WorkItemView = {
      id: selectedWorkItemId,
      sessionId: "pending",
      agentId: runs[0]?.agentId ?? "",
      kind: "run",
      status: activeWorkItemId === selectedWorkItemId ? "running" : "queued",
      title: "Pending work",
      createdAt: new Date().toISOString(),
      childWorkItems: [],
    };

    return [placeholder, ...workItems];
  }, [activeWorkItemId, runs, selectedWorkItemId, workItems]);

  const selectedWorkItem =
    displayWorkItems.find((workItem) => workItem.id === selectedWorkItemId) ?? displayWorkItems[0] ?? null;
  const selectedRun = selectedWorkItem?.run ?? null;
  const hasJumpToLive =
    Boolean(activeWorkItemId) &&
    selectedWorkItem?.id !== activeWorkItemId &&
    displayWorkItems.some((workItem) => workItem.id === activeWorkItemId);

  // Arrow-key navigation between runs. Scoped to window because the effect
  // only mounts while the Runs tab is active — switching to Chat/Settings
  // unmounts this component and removes the listener. Inputs/textareas are
  // ignored so arrow keys in the chat composer keep working.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (displayWorkItems.length === 0) return;
      const idx = displayWorkItems.findIndex((workItem) => workItem.id === selectedWorkItemId);
      const current = idx === -1 ? 0 : idx;
      const nextIdx =
        e.key === "ArrowUp" ? Math.max(0, current - 1) : Math.min(displayWorkItems.length - 1, current + 1);
      if (nextIdx !== current) {
        e.preventDefault();
        onSelectWorkItem(displayWorkItems[nextIdx].id);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [displayWorkItems, selectedWorkItemId, onSelectWorkItem]);

  return (
    <div className="aw-panel-enter" style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0 }}>
      {runError ? (
        <div
          style={{
            padding: "10px 14px",
            margin: "0 0 8px 0",
            background: COLORS.redSubtle,
            borderLeft: `3px solid ${COLORS.red}`,
            borderRadius: RADIUS.sm,
            fontSize: TYPE.scale.sm,
            color: COLORS.red,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <WarningCircle size={16} weight="bold" />
          {runError}
        </div>
      ) : null}

      {learnedRuleSuggestions.length > 0 ? (
        <div
          style={{
            padding: "12px 14px",
            margin: "0 0 8px 0",
            background: COLORS.orangeSubtle,
            borderLeft: `3px solid ${COLORS.orange}`,
            borderRadius: RADIUS.sm,
            display: "grid",
            gap: 12,
          }}
        >
          {learnedRuleSuggestions.map((rule) => (
            <div key={rule.id} style={{ display: "grid", gap: 8 }}>
              <div style={{ fontSize: TYPE.scale.sm, color: COLORS.text }}>
                <strong>Autonomy suggestion:</strong> {humanizeRule(rule)}
              </div>
              <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textSecondary }}>
                Based on {rule.evidenceCount} consistent decisions at {(rule.consistencyRate * 100).toFixed(0)}%
                agreement.
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {onAcceptLearnedRule ? (
                  <Button size="sm" onClick={() => void onAcceptLearnedRule(rule.id)}>
                    Accept
                  </Button>
                ) : null}
                {onDismissLearnedRule ? (
                  <Button variant="secondary" size="sm" onClick={() => void onDismissLearnedRule(rule.id)}>
                    Dismiss
                  </Button>
                ) : null}
                {onSuppressLearnedRule ? (
                  <Button variant="ghost" size="sm" onClick={() => void onSuppressLearnedRule(rule.id)}>
                    Never suggest this
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        <WorkItemList
          workItems={displayWorkItems}
          selectedWorkItemId={selectedWorkItem?.id ?? null}
          onSelect={onSelectWorkItem}
          activeWorkItemId={activeWorkItemId}
        />
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflowX: "hidden", overflowY: "auto" }}>
          {hasJumpToLive ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "12px 16px",
                margin: "0 0 12px",
                background: COLORS.accentSubtle,
                border: `1px solid ${COLORS.accentBorder}`,
                borderRadius: RADIUS.sm,
              }}
            >
              <div style={{ fontSize: TYPE.scale.sm, color: COLORS.text }}>
                Newer live work is in progress. Stay here or jump to the current item.
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => activeWorkItemId && onSelectWorkItem(activeWorkItemId)}
              >
                Jump to live work
              </Button>
            </div>
          ) : null}
          {selectedWorkItem ? <WorkItemDiagnostics workItem={selectedWorkItem} /> : null}
          {selectedRun ? (
            <RunDetail
              run={selectedRun}
              hasRuns={displayWorkItems.length > 0}
              onRunNow={onRunNow}
              checklistItems={checklistItems}
              onGoLive={onGoLive}
              goingLive={goingLive}
              onApprove={onApprove}
              onReject={onReject}
              onAskChat={onAskChat}
              priorRuns={runs}
              agentName={agentName}
              nextRunAt={nextRunAt}
            />
          ) : selectedWorkItem ? (
            <WorkItemDetail workItem={selectedWorkItem} />
          ) : (
            <RunDetail
              run={null}
              hasRuns={false}
              onRunNow={onRunNow}
              checklistItems={checklistItems}
              onGoLive={onGoLive}
              goingLive={goingLive}
              onApprove={onApprove}
              onReject={onReject}
              onAskChat={onAskChat}
              priorRuns={runs}
              agentName={agentName}
              nextRunAt={nextRunAt}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function WorkItemDiagnostics({ workItem }: { workItem: WorkItemView }) {
  const session = workItem.session;
  const snapshot = workItem.latestSnapshot;
  const sandbox = workItem.currentSandboxLease;

  if (!session && !snapshot && !sandbox) {
    return null;
  }

  const rows = [
    session ? ["Session", session.id] : null,
    session ? ["Context", session.contextKey] : null,
    session ? ["Session status", session.status] : null,
    session?.activeWorkItemId ? ["Active work", session.activeWorkItemId] : null,
    session?.currentSandboxLeaseId ? ["Sandbox lease", session.currentSandboxLeaseId] : null,
    sandbox ? ["Sandbox", `${sandbox.provider} / ${sandbox.status}`] : null,
    snapshot ? ["Snapshot", snapshot.id] : null,
    snapshot ? ["Snapshot kind", snapshot.kind] : null,
    snapshot?.executor ? ["Executor", snapshot.executor] : null,
    snapshot?.model ? ["Model", snapshot.model] : null,
    snapshot?.provider ? ["Provider", snapshot.provider] : null,
    snapshot ? ["Prompt hash", snapshot.promptHash] : null,
    snapshot?.messageCount != null ? ["Messages", String(snapshot.messageCount)] : null,
    snapshot?.memoryCount != null ? ["Memory refs", String(snapshot.memoryCount)] : null,
    snapshot?.toolBindingCount != null ? ["Tools", String(snapshot.toolBindingCount)] : null,
    snapshot?.policyRuleCount != null ? ["Policy rules", String(snapshot.policyRuleCount)] : null,
  ].filter((row): row is [string, string] => row != null);

  return (
    <div
      style={{
        margin: "0 20px 12px",
        padding: "12px 14px",
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.sm,
        background: COLORS.surface,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: TYPE.scale.xs,
            color: COLORS.textDim,
            textTransform: "uppercase",
            letterSpacing: TYPE.tracking.wide,
            fontWeight: TYPE.weight.semibold,
          }}
        >
          Session context
        </div>
        <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{humanizeWorkItemKind(workItem.kind)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ minWidth: 0 }}>
            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim, marginBottom: 2 }}>{label}</div>
            <div
              style={{
                fontSize: TYPE.scale.xs,
                color: COLORS.textSecondary,
                fontFamily: TYPE.mono,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={value}
            >
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkItemDetail({ workItem }: { workItem: WorkItemView }) {
  return (
    <div style={{ flex: 1, minWidth: 0, padding: "24px 20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
              marginBottom: 6,
            }}
          >
            {humanizeWorkItemKind(workItem.kind)}
          </div>
          <h2 style={{ margin: 0, fontSize: TYPE.scale.lg, fontFamily: TYPE.display, color: COLORS.text }}>
            {workItem.title ?? humanizeWorkItemKind(workItem.kind)}
          </h2>
        </div>
        <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>{workItem.status}</div>
      </div>
      {workItem.error ? (
        <div
          style={{
            padding: 14,
            border: `1px solid ${COLORS.redBorder}`,
            borderRadius: RADIUS.sm,
            background: COLORS.redSubtle,
            color: COLORS.red,
            fontSize: TYPE.scale.sm,
            marginBottom: 16,
          }}
        >
          {workItem.error}
        </div>
      ) : null}
      {workItem.childWorkItems.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              color: COLORS.textDim,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
            }}
          >
            Child work
          </div>
          {workItem.childWorkItems.map((child) => (
            <div
              key={child.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                padding: "10px 12px",
                border: `1px solid ${COLORS.border}`,
                borderRadius: RADIUS.sm,
                background: COLORS.surface,
              }}
            >
              <div style={{ fontSize: TYPE.scale.sm, color: COLORS.text }}>
                {child.title ?? humanizeWorkItemKind(child.kind)}
              </div>
              <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{child.status}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>
          No run timeline is attached to this work item.
        </div>
      )}
    </div>
  );
}

function humanizeRule(rule: LearnedRuleView): string {
  const action =
    rule.learnedDecision === "auto"
      ? "auto-approve"
      : rule.learnedDecision === "blocked"
        ? "block"
        : "require approval for";

  return `${action} ${rule.toolName}`;
}
