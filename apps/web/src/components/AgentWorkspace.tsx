import { BookOpen, Play, Stop } from "@phosphor-icons/react";
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
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
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
    requiredProviders = [],
    activeRunId,
    onCancelRun,
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
  const conversation = props.conversation;
  const isDraft = props.isDraft ?? agent.lifecycleStatus === "draft";

  const [tab, setTab] = useState<WorkspaceTab>(props.initialTab ?? "runs");
  const chatRunCompleteRef = useRef<(() => void) | null>(null);
  const previousAgentIdRef = useRef(agent.id);
  const notifiedChatRunRef = useRef<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(props.initialRunId ?? null);
  const [goingLive, setGoingLive] = useState(false);
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);
  const [chatApprovalContext, setChatApprovalContext] = useState<PendingActionView | null>(null);
  const [chatTriggeredRunId, setChatTriggeredRunId] = useState<string | null>(null);

  // User-initiated run selection: update local state AND propagate to the
  // route so the URL's ?runId= stays in sync (reloadable, shareable, back/forward).
  // Do NOT use this from effects that sync state *from* props.initialRunId —
  // that would round-trip and write the URL over itself.
  const onSelectRunProp = props.onSelectRun;
  const selectRun = useCallback(
    (runId: string | null) => {
      setSelectedRunId(runId);
      onSelectRunProp?.(runId);
    },
    [onSelectRunProp],
  );

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) {
      selectRun(runs[0].id);
    }
  }, [runs, selectedRunId, selectRun]);

  useEffect(() => {
    if (previousAgentIdRef.current !== agent.id) {
      previousAgentIdRef.current = agent.id;
      setTab(props.initialTab ?? "runs");
      setSelectedRunId(props.initialRunId ?? null);
      setChatApprovalContext(resolvePendingApproval(runs, props.initialPendingActionId));
      setChatTriggeredRunId(null);
      notifiedChatRunRef.current = null;
    }
  }, [agent.id, props.initialPendingActionId, props.initialRunId, props.initialTab, runs]);

  useEffect(() => {
    if (!props.initialRunId) {
      return;
    }
    setSelectedRunId(props.initialRunId);
  }, [props.initialRunId]);

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
          action: !hasName ? { label: "Edit", onClick: () => setTab("settings") } : undefined,
        },
        {
          label: "Write instructions",
          done: hasInstructions,
          hint: "Tell it what to monitor and optimize",
          action: !hasInstructions ? { label: "Edit", onClick: () => setTab("settings") } : undefined,
        },
        {
          label: "Connect required tools",
          done: hasToolsConnected,
          hint:
            missingProviders.length > 0
              ? `${missingProviders.map((provider) => humanize(provider.provider)).join(", ")} not connected`
              : undefined,
          action: !hasToolsConnected ? { label: "Connect", onClick: () => setTab("settings") } : undefined,
        },
        {
          label: "Set a run schedule",
          done: hasSchedule,
          hint: "Or keep manual if you prefer",
          action: !hasSchedule ? { label: "Set", onClick: () => setTab("settings") } : undefined,
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
    if (result?.runId) {
      selectRun(result.runId);
    }
  };

  const wrappedOnRunNow = onRunNow ? handleRunNowWithConfirm : undefined;
  const viewportHeight = "calc(100dvh - 64px)";

  const handleAskChat = useCallback(
    (approval: PendingActionView) => {
      selectRun(approval.runId);
      setChatApprovalContext(approval);
      setTab("chat");
    },
    [selectRun],
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
            activeRunId && onCancelRun ? (
              <Button
                variant="secondary"
                onClick={onCancelRun}
                disabled={cancelling}
                style={{ borderColor: COLORS.red, color: COLORS.red }}
              >
                <Stop size={13} weight="bold" />
                {cancelling ? "Cancelling..." : "Cancel run"}
              </Button>
            ) : wrappedOnRunNow ? (
              <Button onClick={wrappedOnRunNow}>
                <Play size={13} weight="bold" />
                Run now
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
          onChange={setTab}
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
                if (result?.runId) {
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
              selectedRunId={selectedRunId}
              onSelectRun={selectRun}
              activeRunId={activeRunId}
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
              key={conversation?.threadId ?? agent.id}
              agent={agent}
              projectId={project.id}
              runs={runs}
              conversation={conversation}
              onRunTriggered={(runId, triggerRunId) => {
                selectRun(runId);
                setChatTriggeredRunId(runId);
                notifiedChatRunRef.current = null;
                onRunTriggered?.(runId, triggerRunId);
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
          <div className="aw-panel-enter" style={{ ...memoryPanelStyle, flex: 1, minHeight: 0, overflowY: "auto" }}>
            <div style={memoryHeaderStyle}>
              <div style={placeholderIconStyle}>
                <BookOpen size={20} weight="bold" color={COLORS.accent} />
              </div>
              <div>
                <div style={placeholderTitleStyle}>Memory dossier</div>
                <div style={memorySubtitleStyle}>
                  Relationship summary, distilled run learnings, and context the agent can carry forward.
                </div>
              </div>
            </div>

            {conversation?.checkpointSummary ? (
              <section style={memorySectionStyle}>
                <div style={memorySectionLabelStyle}>Relationship summary</div>
                <div style={memoryCardStyle}>
                  <div style={memoryMetaStyle}>
                    Covers {conversation.checkpointMessageCount} earlier
                    {conversation.checkpointMessageCount === 1 ? " message" : " messages"}
                  </div>
                  <div style={memoryBodyStyle}>{conversation.checkpointSummary}</div>
                </div>
              </section>
            ) : null}

            <section style={memorySectionStyle}>
              <div style={memorySectionLabelStyle}>Durable memory</div>
              {conversation?.lessons.length ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {conversation.lessons.map((lesson) => (
                    <div key={lesson.id} style={memoryCardStyle}>
                      <div style={memoryMetaStyle}>
                        {lesson.scope} · {lesson.confidence} confidence
                      </div>
                      <div style={memoryBodyStyle}>{lesson.content}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={placeholderBodyStyle}>
                  No durable memory yet. As this agent completes runs and learns stable preferences, corrections, or
                  decisions, they will show up here and feed future chat context.
                </div>
              )}
            </section>
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

const placeholderPanelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  alignItems: "center",
  justifyContent: "center",
  padding: "80px 24px",
  textAlign: "center" as const,
};

const placeholderIconStyle = {
  width: 48,
  height: 48,
  borderRadius: RADIUS.lg,
  background: COLORS.accentDim,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: 16,
};

const placeholderTitleStyle = {
  fontSize: TYPE.scale.md,
  fontWeight: TYPE.weight.semibold,
  color: COLORS.text,
  fontFamily: TYPE.display,
  marginBottom: 6,
};

const placeholderBodyStyle = {
  fontSize: TYPE.scale.base,
  color: COLORS.textSecondary,
  maxWidth: 440,
  lineHeight: TYPE.leading.normal,
  marginBottom: 24,
};

const memoryPanelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 24,
  padding: "8px 0 24px",
  width: "100%",
  maxWidth: 760,
};

const memoryHeaderStyle = {
  display: "flex",
  alignItems: "center",
  gap: 14,
};

const memorySubtitleStyle = {
  fontSize: TYPE.scale.sm,
  color: COLORS.textSecondary,
  lineHeight: TYPE.leading.normal,
  maxWidth: 560,
};

const memorySectionStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
};

const memorySectionLabelStyle = {
  fontSize: TYPE.scale.xs,
  letterSpacing: 0.8,
  textTransform: "uppercase" as const,
  color: COLORS.textDim,
};

const memoryCardStyle = {
  borderRadius: RADIUS.lg,
  border: `1px solid ${COLORS.border}`,
  background: COLORS.surface,
  padding: 16,
};

const memoryMetaStyle = {
  fontSize: TYPE.scale.xs,
  color: COLORS.textDim,
  marginBottom: 8,
};

const memoryBodyStyle = {
  fontSize: TYPE.scale.base,
  color: COLORS.textSecondary,
  lineHeight: TYPE.leading.normal,
  whiteSpace: "pre-wrap" as const,
};
