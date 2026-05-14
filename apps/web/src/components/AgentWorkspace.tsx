import { Play, Stop } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AgentChatPane } from "~/components/agent-chat-pane";
import type { AgentWorkspaceProps, WorkspaceTab } from "~/components/agent-workspace.types";
import { AgentWorkspaceActivityPane } from "~/components/agent-workspace-activity";
import {
  AgentWorkspaceHeader,
  type ChecklistItem,
  FirstRunPrompt,
  listProviderNames,
  WorkspaceTabs,
} from "~/components/agent-workspace-chrome";
import { AgentWorkspaceSettingsPanel } from "~/components/agent-workspace-settings";
import { Button } from "~/components/Button";
import { MemoryDossier } from "~/components/MemoryDossier";
import { COLORS, MOTION, TYPE } from "~/lib/colors";
import { humanize } from "~/lib/text-format";
import type { PendingActionView } from "~/lib/types";

export function AgentWorkspace(props: AgentWorkspaceProps) {
  const {
    agent,
    project,
    onBack,
    onDeleteAgent,
    onRunNow,
    onUpdateAgent,
    onRunTriggered,
    onConnect,
    onDisconnect,
    onListGoogleAdsAccounts,
    onSetConnectionConfig,
    onSetAgentConnectionBinding,
    requiredProviders = [],
    activeRunId,
    activeWorkItemId,
    onCancelRun,
    onCancelWorkItem,
    cancelling,
    runError,
    onApprove,
    onReject,
    onAcceptLearnedRule,
    onDismissLearnedRule,
    onSuppressLearnedRule,
    onRevokeLearnedRule,
    providerLogos = {},
  } = props;

  const availableSkills = props.availableSkills ?? props.skills ?? [];
  const projectConnections = props.projectConnections ?? [];
  const policyToolCatalog = props.policyToolCatalog ?? [];
  const runs = props.runs ?? [];
  const workItems = props.workItems ?? [];
  const conversation = props.conversation;
  const conversationThreads = props.conversationThreads ?? [];
  const activeThreadId = props.activeThreadId ?? conversation?.threadId;
  const draftThreadOpen = props.draftThreadOpen ?? false;
  const isDraft = props.isDraft ?? agent.lifecycleStatus === "draft";

  const [tab, setTab] = useState<WorkspaceTab>(props.initialTab ?? "chat");
  const chatRunCompleteRef = useRef<(() => void) | null>(null);
  const previousAgentIdRef = useRef(agent.id);
  const notifiedChatRunRef = useRef<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedWorkItemId, setSelectedWorkItemId] = useState<string | null>(
    props.initialWorkItemId ?? resolveWorkItemIdForRun(workItems, props.initialRunId) ?? props.initialRunId ?? null,
  );
  const [goingLive, setGoingLive] = useState(false);
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);
  const [chatApprovalContext, setChatApprovalContext] = useState<PendingActionView | null>(null);
  const [chatTriggeredRunId, setChatTriggeredRunId] = useState<string | null>(null);

  // User-initiated activity selection: update local state AND propagate to the
  // route so the URL's ?workItemId= stays in sync.
  const onSelectRunProp = props.onSelectRun;
  const onSelectWorkItemProp = props.onSelectWorkItem;
  const onTabChangeProp = props.onTabChange;
  const selectWorkItem = useCallback(
    (workItemId: string | null) => {
      setSelectedWorkItemId(workItemId);
      const runId = workItemId ? (workItems.find((workItem) => workItem.id === workItemId)?.runId ?? null) : null;
      if (onSelectWorkItemProp) {
        onSelectWorkItemProp(workItemId, runId);
      } else {
        onSelectRunProp?.(runId);
      }
    },
    [onSelectRunProp, onSelectWorkItemProp, workItems],
  );
  const selectRun = useCallback(
    (runId: string | null) => {
      const workItemId = resolveWorkItemIdForRun(workItems, runId);
      if (workItemId) {
        selectWorkItem(workItemId);
        return;
      }
      setSelectedWorkItemId(runId);
      onSelectRunProp?.(runId);
    },
    [onSelectRunProp, selectWorkItem, workItems],
  );
  const changeTab = useCallback(
    (nextTab: WorkspaceTab) => {
      setTab(nextTab);
      onTabChangeProp?.(nextTab);
    },
    [onTabChangeProp],
  );

  useEffect(() => {
    if (!selectedWorkItemId && workItems.length > 0) {
      selectWorkItem(workItems[0].id);
    }
  }, [selectedWorkItemId, selectWorkItem, workItems]);

  useEffect(() => {
    if (previousAgentIdRef.current !== agent.id) {
      previousAgentIdRef.current = agent.id;
      setTab(props.initialTab ?? "chat");
      setSelectedWorkItemId(
        props.initialWorkItemId ?? resolveWorkItemIdForRun(workItems, props.initialRunId) ?? props.initialRunId ?? null,
      );
      setChatApprovalContext(resolvePendingApproval(runs, props.initialPendingActionId));
      setChatTriggeredRunId(null);
      notifiedChatRunRef.current = null;
    }
  }, [
    agent.id,
    props.initialPendingActionId,
    props.initialRunId,
    props.initialTab,
    props.initialWorkItemId,
    runs,
    workItems,
  ]);

  useEffect(() => {
    if (!props.initialWorkItemId && !props.initialRunId) {
      return;
    }
    setSelectedWorkItemId(
      props.initialWorkItemId ?? resolveWorkItemIdForRun(workItems, props.initialRunId) ?? props.initialRunId ?? null,
    );
  }, [props.initialRunId, props.initialWorkItemId, workItems]);

  useEffect(() => {
    if (!props.initialPendingActionId) return;
    const approval = resolvePendingApproval(runs, props.initialPendingActionId);
    if (approval) {
      setChatApprovalContext(approval);
    }
  }, [props.initialPendingActionId, runs]);

  useEffect(() => {
    if (!props.initialTab) return;
    setTab(props.initialTab);
  }, [props.initialTab]);

  useEffect(() => {
    if (!chatApprovalContext) return;
    const latest = resolvePendingApproval(runs, chatApprovalContext.id);
    if (!latest || latest.status !== "pending") {
      setChatApprovalContext(null);
      return;
    }
    setChatApprovalContext(latest);
  }, [runs, chatApprovalContext]);

  useEffect(() => {
    if (tab !== "chat" || !chatTriggeredRunId || !chatRunCompleteRef.current) {
      return;
    }

    const run = runs.find((item) => item.id === chatTriggeredRunId);
    if (!run) {
      return;
    }

    const isTerminal =
      run.status === "completed" || run.status === "failed" || run.status === "cancelled" || run.status === "stopped";

    if (!isTerminal || notifiedChatRunRef.current === run.id) {
      return;
    }

    notifiedChatRunRef.current = run.id;
    chatRunCompleteRef.current();
    setChatTriggeredRunId(null);
  }, [chatTriggeredRunId, runs, tab]);

  const mergedRequiredProviders = useMemo(() => {
    const providers = new Map<string, { provider: string; reason: string; logo?: string }>();

    for (const requirement of agent.requiredProviders ?? agent.toolConfig?.requiredProviders ?? []) {
      providers.set(requirement.provider, requirement);
    }
    for (const requirement of requiredProviders) {
      providers.set(requirement.provider, requirement);
    }

    return [...providers.values()];
  }, [agent.requiredProviders, agent.toolConfig?.requiredProviders, requiredProviders]);

  const activeConnections = projectConnections.filter((connection) => connection.status === "active");

  const handleSave = async (updates: Partial<Parameters<NonNullable<AgentWorkspaceProps["onUpdateAgent"]>>[0]>) => {
    await onUpdateAgent?.(updates);
  };

  const activeProviderSet = new Set(activeConnections.map((connection) => connection.provider));
  const missingProviders = mergedRequiredProviders.filter((provider) => !activeProviderSet.has(provider.provider));

  const hasName = !!agent.name && agent.name !== "Untitled Agent";
  const hasInstructions = agent.instructions.trim().length > 20;
  const hasToolsConnected = mergedRequiredProviders.length === 0 || missingProviders.length === 0;
  const hasSchedule = !!agent.schedule && agent.schedule !== "manual";

  const checklistItems: ChecklistItem[] = isDraft
    ? [
        {
          label: "Name your agent",
          done: hasName,
          hint: "Give it a memorable name",
          action: !hasName ? { label: "Edit", onClick: () => changeTab("settings") } : undefined,
        },
        {
          label: "Write instructions",
          done: hasInstructions,
          hint: "Tell it what to monitor and optimize",
          action: !hasInstructions ? { label: "Edit", onClick: () => changeTab("settings") } : undefined,
        },
        {
          label: "Connect required tools",
          done: hasToolsConnected,
          hint:
            missingProviders.length > 0
              ? `${missingProviders.map((provider) => humanize(provider.provider)).join(", ")} not connected`
              : undefined,
          action: !hasToolsConnected ? { label: "Connect", onClick: () => changeTab("settings") } : undefined,
        },
        {
          label: "Set a run schedule",
          done: hasSchedule,
          hint: "Or keep manual if you prefer",
          action: !hasSchedule ? { label: "Set", onClick: () => changeTab("settings") } : undefined,
        },
      ]
    : [];

  const handleGoLive = async () => {
    if (!onUpdateAgent) return;
    setGoingLive(true);
    try {
      await onUpdateAgent({ status: "live" });
    } finally {
      setGoingLive(false);
    }
  };

  const isFirstRun = runs.length === 0;

  const handleRunNowWithConfirm = async () => {
    if (isFirstRun && !showFirstRunPrompt) {
      setShowFirstRunPrompt(true);
      return;
    }

    setShowFirstRunPrompt(false);
    const result = await onRunNow?.();
    if (result?.workItemId) {
      selectWorkItem(result.workItemId);
    } else if (result?.runId) {
      selectRun(result.runId);
    }
  };

  const wrappedOnRunNow = onRunNow ? handleRunNowWithConfirm : undefined;
  const viewportHeight = "calc(100dvh - 64px)";

  const handleAskChat = useCallback(
    (approval: PendingActionView) => {
      selectRun(approval.runId);
      setChatApprovalContext(approval);
      changeTab("chat");
    },
    [changeTab, selectRun],
  );

  return (
    <div style={{ position: "relative", height: viewportHeight, minHeight: 0 }}>
      <style>{`
        .aw-shell { color: ${COLORS.text}; font-family: ${TYPE.body}; }
        @keyframes awFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .aw-panel-enter { animation: awFadeIn 0.4s ${MOTION.easeOutExpo} both; }
      `}</style>

      <div
        className="aw-shell"
        style={{
          background: `radial-gradient(circle at top left, rgba(255,255,255,0.05), transparent 32%), linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bg} 100%)`,
          padding: "8px clamp(20px, 3vw, 40px) 16px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          minHeight: 0,
          overflow: "hidden",
        }}
      >
        <AgentWorkspaceHeader
          project={project}
          agent={agent}
          isDraft={isDraft}
          runAction={
            (activeWorkItemId || activeRunId) && (onCancelWorkItem || onCancelRun) ? (
              <Button
                variant="secondary"
                onClick={onCancelWorkItem ?? onCancelRun}
                disabled={cancelling}
                style={{ borderColor: COLORS.red, color: COLORS.red }}
              >
                <Stop size={13} weight="bold" />
                {cancelling ? "Cancelling..." : "Cancel work"}
              </Button>
            ) : wrappedOnRunNow ? (
              <Button variant="secondary" onClick={wrappedOnRunNow}>
                <Play size={13} weight="bold" />
                Background run
              </Button>
            ) : undefined
          }
          moreOpen={moreOpen}
          onToggleMore={() => setMoreOpen((value) => !value)}
          onCloseMore={() => setMoreOpen(false)}
          onBack={onBack}
          onDeleteAgent={onDeleteAgent}
        />

        <WorkspaceTabs
          tab={tab}
          onChange={changeTab}
          activeConnections={activeConnections.length}
          requiredProviders={mergedRequiredProviders.length}
        />

        {showFirstRunPrompt ? (
          <FirstRunPrompt
            providerNames={listProviderNames(mergedRequiredProviders)}
            onCancel={() => setShowFirstRunPrompt(false)}
            onStartRun={() => {
              setShowFirstRunPrompt(false);
              void (async () => {
                const result = await onRunNow?.();
                if (result?.workItemId) {
                  selectWorkItem(result.workItemId);
                } else if (result?.runId) {
                  selectRun(result.runId);
                }
              })();
            }}
          />
        ) : null}

        {tab === "runs" ? (
          <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AgentWorkspaceActivityPane
              runs={runs}
              workItems={workItems}
              selectedWorkItemId={selectedWorkItemId}
              onSelectWorkItem={selectWorkItem}
              activeRunId={activeRunId}
              activeWorkItemId={activeWorkItemId}
              runError={runError}
              onRunNow={wrappedOnRunNow}
              checklistItems={checklistItems}
              onGoLive={() => void handleGoLive()}
              goingLive={goingLive}
              onApprove={onApprove}
              onReject={onReject}
              onAskChat={handleAskChat}
              learnedRuleSuggestions={agent.learnedRuleSuggestions}
              onAcceptLearnedRule={onAcceptLearnedRule}
              onDismissLearnedRule={onDismissLearnedRule}
              onSuppressLearnedRule={onSuppressLearnedRule}
              agentName={agent.name}
              nextRunAt={agent.nextRunAt}
            />
          </div>
        ) : null}

        {tab === "settings" ? (
          <div className="aw-panel-enter" style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            <AgentWorkspaceSettingsPanel
              agent={agent}
              skills={availableSkills}
              connections={projectConnections}
              policyToolCatalog={policyToolCatalog}
              learnedRuleSuggestions={agent.learnedRuleSuggestions}
              learnedRules={agent.learnedRules}
              onUpdateAgent={handleSave}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onListGoogleAdsAccounts={onListGoogleAdsAccounts}
              onSetConnectionConfig={onSetConnectionConfig}
              onSetAgentConnectionBinding={onSetAgentConnectionBinding}
              onAcceptLearnedRule={onAcceptLearnedRule}
              onDismissLearnedRule={onDismissLearnedRule}
              onSuppressLearnedRule={onSuppressLearnedRule}
              onRevokeLearnedRule={onRevokeLearnedRule}
              providerLogos={providerLogos}
            />
          </div>
        ) : null}

        {tab === "chat" ? (
          <div className="aw-panel-enter" style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
            <AgentChatPane
              key={activeThreadId ?? agent.id}
              agent={agent}
              projectId={project.id}
              runs={runs}
              conversation={conversation}
              threads={conversationThreads}
              activeThreadId={activeThreadId}
              draftThreadOpen={draftThreadOpen}
              onSelectThread={props.onSelectThread}
              onCreateThread={props.onCreateThread}
              onDeleteThread={props.onDeleteThread}
              onThreadCreated={props.onThreadCreated}
              onRunTriggered={(runId, triggerRunId, workItemId) => {
                if (workItemId) {
                  selectWorkItem(workItemId);
                } else {
                  selectRun(runId);
                }
                setChatTriggeredRunId(runId);
                notifiedChatRunRef.current = null;
                onRunTriggered?.(runId, triggerRunId, workItemId);
              }}
              registerRunCompleteHandler={(handler) => {
                chatRunCompleteRef.current = handler;
              }}
              pendingApproval={chatApprovalContext}
              onApprove={onApprove}
              onReject={onReject}
              onClearPendingApproval={() => setChatApprovalContext(null)}
            />
          </div>
        ) : null}

        {tab === "learned" ? (
          <div className="aw-panel-enter" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 0 24px" }}>
            <MemoryDossier conversation={conversation} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function resolvePendingApproval(
  runs: AgentWorkspaceProps["runs"],
  approvalId?: string | null,
): PendingActionView | null {
  if (!approvalId || !runs) {
    return null;
  }

  for (const run of runs) {
    const approval = run.approvals.find((item) => item.id === approvalId);
    if (approval) {
      return approval;
    }
  }

  return null;
}

function resolveWorkItemIdForRun(
  workItems: NonNullable<AgentWorkspaceProps["workItems"]>,
  runId?: string | null,
): string | null {
  if (!runId) {
    return null;
  }
  return workItems.find((workItem) => workItem.runId === runId)?.id ?? null;
}
