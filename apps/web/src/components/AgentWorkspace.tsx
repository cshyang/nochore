import { BookOpen, Play } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentWorkspaceProps, WorkspaceTab } from "~/components/agent-workspace.types";
import { AgentWorkspaceActivityPane } from "~/components/agent-workspace-activity";
import { AgentChatPane } from "~/components/agent-chat-pane";
import {
  AgentWorkspaceHeader,
  type ChecklistItem,
  FirstRunPrompt,
  humanize,
  listProviderNames,
  WorkspaceTabs,
} from "~/components/agent-workspace-chrome";
import { AgentWorkspaceSettingsPanel } from "~/components/agent-workspace-settings";
import { Button } from "~/components/Button";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";

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
    activeRun,
    onLiveRunComplete,
    runError,
    onApprove,
    onReject,
    providerLogos = {},
  } = props;

  const availableSkills = props.availableSkills ?? props.skills ?? [];
  const projectConnections = props.projectConnections ?? [];
  const runs = props.runs ?? [];
  const isDraft = props.isDraft ?? agent.lifecycleStatus === "draft";

  const [tab, setTab] = useState<WorkspaceTab>("activity");
  const chatRunCompleteRef = useRef<(() => void) | null>(null);

  // B+ auto-follow-up: when a chat-triggered run completes, notify the chat
  const handleLiveRunCompleteWithChat = useCallback(() => {
    onLiveRunComplete?.();
    if (tab === "chat" && chatRunCompleteRef.current) {
      chatRunCompleteRef.current();
    }
  }, [onLiveRunComplete, tab]);
  const [moreOpen, setMoreOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [goingLive, setGoingLive] = useState(false);
  const [showFirstRunPrompt, setShowFirstRunPrompt] = useState(false);

  useEffect(() => {
    if (runs.length > 0 && !selectedRunId) {
      setSelectedRunId(runs[0].id);
    }
  }, [runs, selectedRunId]);

  useEffect(() => {
    setSelectedRunId(null);
  }, [agent.id]);

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

  const handleRunNowWithConfirm = () => {
    if (isFirstRun && !showFirstRunPrompt) {
      setShowFirstRunPrompt(true);
      return;
    }

    setShowFirstRunPrompt(false);
    void onRunNow?.();
  };

  const wrappedOnRunNow = onRunNow ? handleRunNowWithConfirm : undefined;

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
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
          padding: "28px clamp(20px, 3vw, 40px) 40px",
        }}
      >
        <AgentWorkspaceHeader
          project={project}
          agent={agent}
          isDraft={isDraft}
          runAction={
            wrappedOnRunNow ? (
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
              void onRunNow?.();
            }}
          />
        ) : null}

        {tab === "activity" ? (
          <AgentWorkspaceActivityPane
            runs={runs}
            selectedRunId={selectedRunId}
            onSelectRun={setSelectedRunId}
            activeRun={activeRun}
            onLiveRunComplete={handleLiveRunCompleteWithChat}
            runError={runError}
            onRunNow={wrappedOnRunNow}
            checklistItems={checklistItems}
            onGoLive={() => void handleGoLive()}
            goingLive={goingLive}
            onApprove={onApprove}
            onReject={onReject}
          />
        ) : null}

        {tab === "settings" ? (
          <div className="aw-panel-enter">
            <AgentWorkspaceSettingsPanel
              agent={agent}
              skills={availableSkills}
              connections={projectConnections}
              requiredProviders={mergedRequiredProviders}
              onUpdateAgent={handleSave}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              providerLogos={providerLogos}
            />
          </div>
        ) : null}

        {tab === "chat" ? (
          <div className="aw-panel-enter" style={{ height: "100%", minHeight: 0 }}>
            <AgentChatPane
              agent={agent}
              projectId={project.id}
              runs={runs}
              onRunTriggered={onRunTriggered}
              registerRunCompleteHandler={(handler) => { chatRunCompleteRef.current = handler; }}
            />
          </div>
        ) : null}

        {tab === "memory" ? (
          <div className="aw-panel-enter" style={placeholderPanelStyle}>
            <div style={placeholderIconStyle}>
              <BookOpen size={20} weight="bold" color={COLORS.accent} />
            </div>
            <div style={placeholderTitleStyle}>{agent.name} hasn&apos;t learned anything yet</div>
            <div style={placeholderBodyStyle}>
              After each run, the agent extracts lessons, patterns, and decisions that make future runs smarter. This
              view stays quiet until that memory layer starts accumulating real observations.
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
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

