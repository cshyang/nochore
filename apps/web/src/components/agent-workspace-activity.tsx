import { WarningCircle } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { ChecklistItem } from "~/components/agent-workspace-chrome";
import { Button } from "~/components/Button";
import { RunDetail } from "~/components/RunDetail";
import { RunList } from "~/components/RunList";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type { LearnedRuleView, PendingActionView, RunView } from "~/lib/types";

interface AgentWorkspaceActivityPaneProps {
  runs: RunView[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  activeRunId?: string | null;
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
}

export function AgentWorkspaceActivityPane({
  runs,
  selectedRunId,
  onSelectRun,
  activeRunId,
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
}: AgentWorkspaceActivityPaneProps) {
  const displayRuns = useMemo(() => {
    if (!selectedRunId || runs.some((run) => run.id === selectedRunId)) {
      return runs;
    }

    const placeholder: RunView = {
      id: selectedRunId,
      agentId: runs[0]?.agentId ?? "",
      triggerType: "manual",
      status: activeRunId === selectedRunId ? "running" : "queued",
      hasActionableApprovals: false,
      startedAt: new Date().toISOString(),
      events: [],
      approvals: [],
      workItems: [],
    };

    return [placeholder, ...runs];
  }, [activeRunId, runs, selectedRunId]);

  const selectedRun = displayRuns.find((run) => run.id === selectedRunId) ?? displayRuns[0] ?? null;
  const hasJumpToLive = Boolean(activeRunId) && selectedRun?.id !== activeRunId && displayRuns.some((run) => run.id === activeRunId);

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
        <RunList
          runs={displayRuns}
          selectedRunId={selectedRun?.id ?? null}
          onSelect={onSelectRun}
          activeRunId={activeRunId}
        />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
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
                A newer live run is in progress. Stay here or jump to the current run.
              </div>
              <Button size="sm" variant="secondary" onClick={() => activeRunId && onSelectRun(activeRunId)}>
                Jump to live run
              </Button>
            </div>
          ) : null}
          <RunDetail
            run={selectedRun}
            hasRuns={displayRuns.length > 0}
            onRunNow={onRunNow}
            checklistItems={checklistItems}
            onGoLive={onGoLive}
            goingLive={goingLive}
            onApprove={onApprove}
            onReject={onReject}
            onAskChat={onAskChat}
            priorRuns={displayRuns}
          />
        </div>
      </div>
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
