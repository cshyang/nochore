import { WarningCircle } from "@phosphor-icons/react";
import { useMemo } from "react";
import type { ActiveRunState } from "~/components/agent-workspace.types";
import type { ChecklistItem } from "~/components/agent-workspace-chrome";
import { LiveRunView } from "~/components/LiveRunView";
import { RunDetail } from "~/components/RunDetail";
import { RunList } from "~/components/RunList";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type { RunView } from "~/lib/types";

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
    };
    return [placeholder, ...runs];
  }, [activeRun, runs]);

  const selectedRun =
    displayRuns.find((run) => run.id === selectedRunId) ?? displayRuns[0] ?? null;

  return (
    <div
      className="aw-panel-enter"
      style={{ display: "flex", flexDirection: "column", gap: 0, flex: 1, minHeight: 0 }}
    >
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
            />
          ) : (
            <RunDetail
              run={selectedRun}
              hasRuns={displayRuns.length > 0}
              onRunNow={onRunNow}
              checklistItems={checklistItems}
              onGoLive={onGoLive}
              goingLive={goingLive}
            />
          )}
        </div>
      </div>
    </div>
  );
}
