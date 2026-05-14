import type { UIMessage } from "ai";
import { useEffect } from "react";
import { useAgentChatFlow } from "~/components/agent-chat-flow";
import { AgentMessage } from "~/components/chat/AgentMessage";
import { ChatApprovalCard } from "~/components/chat/ChatApprovalCard";
import { ChatColumn } from "~/components/chat/ChatColumn";
import { ChatHeader, type ChatStatus } from "~/components/chat/ChatHeader";
import { ChatInput } from "~/components/chat/ChatInput";
import { ConnectionsIsland } from "~/components/chat/ConnectionsIsland";
import { EmptyThreadHero } from "~/components/chat/EmptyThreadHero";
import { RunCard } from "~/components/chat/RunCard";
import { ScrollPastPill } from "~/components/chat/ScrollPastPill";
import { UserMessage } from "~/components/chat/UserMessage";
import { ConversationMessage } from "~/components/onboarding-chat-messages";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type {
  AgentView,
  ConnectionView,
  ConversationStateView,
  ConversationThreadSummaryView,
  PendingActionView,
  RunView,
} from "~/lib/types";

interface AgentChatPaneProps {
  agent: AgentView;
  projectId: string;
  runs: RunView[];
  connections?: ConnectionView[];
  conversation?: ConversationStateView;
  threads?: ConversationThreadSummaryView[];
  activeThreadId?: string;
  draftThreadOpen?: boolean;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
  onRunTriggered?: (runId: string, triggerRunId: string, workItemId?: string) => void;
  onThreadCreated?: (threadId: string) => void;
  registerRunCompleteHandler?: (handler: () => void) => void;
  pendingApproval?: PendingActionView | null;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onClearPendingApproval?: () => void;
}

type DisplayThread = ConversationThreadSummaryView & {
  isDraft?: boolean;
};

const DRAFT_THREAD_ID = "draft:new-thread";

export function AgentChatPane({
  agent,
  projectId,
  runs,
  connections = [],
  conversation,
  threads = [],
  activeThreadId,
  draftThreadOpen = false,
  onSelectThread,
  onCreateThread,
  onDeleteThread: _onDeleteThread,
  onRunTriggered,
  onThreadCreated,
  registerRunCompleteHandler,
  pendingApproval,
  onApprove,
  onReject,
  onClearPendingApproval,
}: AgentChatPaneProps) {
  const {
    scrollRef,
    inputRef,
    latestAssistantRef,
    inputValue,
    setInputValue,
    messages,
    isLoading,
    handleSubmit,
    handleKeyDown,
    handleOptionClick,
    notifyRunCompleted,
  } = useAgentChatFlow({
    agentId: agent.id,
    projectId,
    threadId: draftThreadOpen ? undefined : (activeThreadId ?? conversation?.threadId),
    draftThreadOpen,
    agent,
    runs,
    initialMessages: draftThreadOpen ? undefined : (conversation?.messages as UIMessage[] | undefined),
    onRunTriggered,
    onThreadCreated,
  });

  const availableThreads: DisplayThread[] =
    threads.length > 0
      ? threads
      : conversation
        ? [
            {
              id: conversation.threadId,
              title: conversation.threadTitle,
              scope: conversation.isPrimary ? "primary" : "manual",
              isPrimary: conversation.isPrimary,
              createdAt: "",
              updatedAt: "",
              messageCount: conversation.messages.length,
              hasMessages: conversation.messages.length > 0,
            } satisfies ConversationThreadSummaryView,
          ]
        : [];

  const displayedThreads = draftThreadOpen
    ? ([
        {
          id: DRAFT_THREAD_ID,
          title: "New thread",
          scope: "manual",
          isPrimary: false,
          createdAt: "",
          updatedAt: "",
          messageCount: 0,
          hasMessages: false,
          isDraft: true,
        },
        ...availableThreads,
      ] satisfies DisplayThread[])
    : availableThreads;

  useEffect(() => {
    registerRunCompleteHandler?.(() => notifyRunCompleted());
  }, [registerRunCompleteHandler, notifyRunCompleted]);

  useEffect(() => {
    if (!pendingApproval) {
      return;
    }
    setInputValue((current) =>
      current.trim().length > 0
        ? current
        : `Should I approve ${pendingApproval.proposal.toolName}? Help me think through: ${pendingApproval.proposal.reason}`,
    );
  }, [pendingApproval, setInputValue]);

  useEffect(() => {
    if (pendingApproval?.status === "pending") {
      return;
    }
    onClearPendingApproval?.();
  }, [onClearPendingApproval, pendingApproval]);

  return (
    <>
      <ChatHeader
        agent={agent}
        threads={displayedThreads}
        activeThreadId={draftThreadOpen ? DRAFT_THREAD_ID : (activeThreadId ?? conversation?.threadId)}
        status={derivePaneStatus(runs, pendingApproval)}
        onSelectThread={(id) => onSelectThread?.(id)}
        onCreateThread={() => onCreateThread?.()}
      />
      <div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
        <ChatColumn scrollRef={scrollRef}>
          {messages.length === 0 ? (
            <EmptyThreadHero
              agent={agent}
              inputValue={inputValue}
              onInputChange={setInputValue}
              onSubmit={handleSubmit}
              onKeyDown={handleKeyDown}
              inputRef={inputRef}
              isLoading={isLoading}
              onPickSuggestion={(text) => {
                setInputValue(text);
                // Auto-submit after pick. Small UX detail; can remove if it feels too eager.
                setTimeout(() => handleSubmit(), 0);
              }}
            />
          ) : (
            <>
              {!draftThreadOpen && conversation?.checkpointSummary ? (
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: RADIUS.lg,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface,
                  }}
                >
                  <div
                    style={{
                      fontSize: TYPE.scale.xs,
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                      color: COLORS.textDim,
                      marginBottom: 6,
                    }}
                  >
                    Earlier conversation summarized
                    {conversation.checkpointMessageCount > 0
                      ? ` · ${conversation.checkpointMessageCount} messages`
                      : ""}
                  </div>
                  <div
                    style={{
                      fontSize: TYPE.scale.sm,
                      lineHeight: TYPE.leading.normal,
                      color: COLORS.textSecondary,
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {conversation.checkpointSummary}
                  </div>
                </div>
              ) : null}

              {draftThreadOpen && messages.length === 1 ? (
                <div
                  style={{
                    padding: "18px 20px",
                    borderRadius: RADIUS.lg,
                    border: `1px dashed ${COLORS.borderStrong}`,
                    background: COLORS.surface,
                    color: COLORS.textSecondary,
                    fontSize: TYPE.scale.sm,
                    lineHeight: TYPE.leading.normal,
                  }}
                >
                  This thread is still a draft. It will only be saved after your first message.
                </div>
              ) : null}

              {messages.map((message, index) => {
                const isLastAssistant = index === messages.length - 1 && message.role === "assistant";

                if (message.role === "user") {
                  return <UserMessage key={message.id}>{textOfMessage(message)}</UserMessage>;
                }

                return (
                  <div key={message.id} ref={isLastAssistant ? latestAssistantRef : undefined}>
                    <AgentMessage>
                      <ConversationMessage
                        message={message as { role: string; parts: Array<Record<string, unknown>> }}
                        onOptionClick={isLastAssistant ? handleOptionClick : undefined}
                      />
                      {runCardsForMessage(message, runs).map(({ runId, run }) => (
                        <RunCard
                          key={runId}
                          runId={runId}
                          agentId={agent.id}
                          projectId={projectId}
                          headline={run.summary?.headline ?? ""}
                          findings={(run.summary?.details ?? []).map((text) => ({ text }))}
                          completedAt={run.completedAt}
                          durationMs={
                            run.completedAt && run.startedAt
                              ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                              : undefined
                          }
                        />
                      ))}
                      {messageTriggeredApproval(message, pendingApproval) &&
                        pendingApproval &&
                        onApprove &&
                        onReject && (
                          <ChatApprovalCard
                            approval={pendingApproval}
                            onApprove={(reason) => onApprove(pendingApproval.id, reason)}
                            onReject={(reason) => onReject(pendingApproval.id, reason)}
                          />
                        )}
                    </AgentMessage>
                  </div>
                );
              })}

              {isLoading ? <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim }}>Thinking...</div> : null}

              <ChatInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={() => handleSubmit()}
                onKeyDown={handleKeyDown}
                inputRef={inputRef}
                isLoading={isLoading}
              />
            </>
          )}
        </ChatColumn>
        <ConnectionsIsland connections={connections} projectId={projectId} />
        <ScrollPastPill
          scrollRef={scrollRef}
          approvalElementId={pendingApproval?.id}
          pendingCount={pendingApproval && pendingApproval.status === "pending" ? 1 : 0}
        />
      </div>
    </>
  );
}

function messageTriggeredApproval(message: UIMessage, pendingApproval: PendingActionView | null | undefined): boolean {
  if (!pendingApproval || pendingApproval.status !== "pending") return false;
  for (const part of message.parts) {
    const record = part as Record<string, unknown>;
    const type = record.type as string | undefined;
    const isTriggerRun =
      (type === "dynamic-tool" && record.toolName === "trigger_run") ||
      (typeof type === "string" && type.startsWith("tool-") && type.includes("trigger_run"));
    if (!isTriggerRun || record.state !== "output-available") continue;
    const output = record.output as { runId?: string } | undefined;
    if (output?.runId && output.runId === pendingApproval.runId) return true;
  }
  return false;
}

function runCardsForMessage(message: UIMessage, runs: RunView[]): Array<{ runId: string; run: RunView }> {
  const results: Array<{ runId: string; run: RunView }> = [];
  for (const part of message.parts) {
    const record = part as Record<string, unknown>;
    const type = record.type as string | undefined;
    const isTriggerRun =
      (type === "dynamic-tool" && record.toolName === "trigger_run") ||
      (typeof type === "string" && type.startsWith("tool-") && type.includes("trigger_run"));
    if (!isTriggerRun || record.state !== "output-available") continue;
    const output = record.output as { runId?: string } | undefined;
    const runId = output?.runId;
    if (!runId) continue;
    const run = runs.find((r) => r.id === runId);
    if (run?.summary) {
      results.push({ runId, run });
    }
  }
  return results;
}

function textOfMessage(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

function derivePaneStatus(runs: RunView[], pendingApproval: PendingActionView | null | undefined): ChatStatus {
  if (pendingApproval && pendingApproval.status === "pending") return "needs-you";
  if (runs.some((r) => r.status === "waiting_for_approval")) return "needs-you";
  if (runs.some((r) => r.status === "running" || r.status === "waiting_for_tasks" || r.status === "queued")) return "running";
  return "idle";
}
