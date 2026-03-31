import { WarningCircle } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { ActiveRunState } from "~/components/agent-workspace.types";
import type { ChecklistItem } from "~/components/agent-workspace-chrome";
import { Button } from "~/components/Button";
import { LiveRunView } from "~/components/LiveRunView";
import { RunDetail } from "~/components/RunDetail";
import { RunList } from "~/components/RunList";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type { LearnedRuleView, PendingActionView, RunView } from "~/lib/types";

interface AgentWorkspaceActivityPaneProps {
  runs: RunView[];
  selectedRunId: string | null;
  onSelectRun: (runId: string) => void;
  activeRun?: ActiveRunState | null;
  onLiveRunComplete?: () => void;
  runError?: string | null;
  onRunNow?: () => void;
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
  activeRun,
  onLiveRunComplete,
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
  // Synthesize a placeholder for the live run if it hasn't appeared in the
  // fetched runs list yet (loader data is stale until router.invalidate).
  const displayRuns = useMemo(() => {
    if (!activeRun) return runs;
    if (runs.some((r) => r.id === activeRun.runId)) return runs;
    const placeholder: RunView = {
      id: activeRun.runId,
      agentId: runs[0]?.agentId ?? "",
      triggerType: "manual",
      status: "running",
      startedAt: new Date().toISOString(),
      events: [],
      approvals: [],
    };
    return [placeholder, ...runs];
  }, [activeRun, runs]);

  const selectedRun = displayRuns.find((run) => run.id === selectedRunId) ?? displayRuns[0] ?? null;

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
          activeRunId={activeRun?.runId}
        />
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
          {activeRun ? (
            <LiveRunView
              triggerRunId={activeRun.triggerRunId}
              accessToken={activeRun.accessToken}
              runId={activeRun.runId}
              onComplete={onLiveRunComplete}
              onApprove={onApprove}
              onReject={onReject}
              onAskChat={onAskChat}
            />
          ) : (
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
            />
          )}
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
