import type { UIMessage } from "ai";
import { useEffect } from "react";
import { ApprovalCard } from "~/components/ApprovalCard";
import { useAgentChatFlow } from "~/components/agent-chat-flow";
import { ChatColumn } from "~/components/chat/ChatColumn";
import { ChatHeader, type ChatStatus } from "~/components/chat/ChatHeader";
import { ConversationMessage } from "~/components/onboarding-chat-messages";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type {
  AgentView,
  ConversationStateView,
  ConversationThreadSummaryView,
  PendingActionView,
  RunView,
} from "~/lib/types";

interface AgentChatPaneProps {
  agent: AgentView;
  projectId: string;
  runs: RunView[];
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
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
      <ChatHeader
        agent={agent}
        threads={displayedThreads}
        activeThreadId={draftThreadOpen ? DRAFT_THREAD_ID : (activeThreadId ?? conversation?.threadId)}
        status={derivePaneStatus(runs, pendingApproval)}
        onSelectThread={(id) => onSelectThread?.(id)}
        onCreateThread={() => onCreateThread?.()}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ChatColumn scrollRef={scrollRef}>
          {pendingApproval?.status === "pending" ? (
            <ApprovalCard
              approval={pendingApproval}
              title="Pending approval in chat"
              onApprove={onApprove ? (approval) => onApprove(approval.id, "Approved from chat") : undefined}
              onReject={onReject ? (approval) => onReject(approval.id, "Rejected from chat") : undefined}
            />
          ) : null}

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
                {conversation.checkpointMessageCount > 0 ? ` · ${conversation.checkpointMessageCount} messages` : ""}
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
            return (
              <div key={message.id} ref={isLastAssistant ? latestAssistantRef : undefined}>
                <ConversationMessage
                  message={message as { role: string; parts: Array<Record<string, unknown>> }}
                  onOptionClick={isLastAssistant ? handleOptionClick : undefined}
                />
              </div>
            );
          })}

          {isLoading ? <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim }}>Thinking...</div> : null}

          <ChatInputStub
            value={inputValue}
            onChange={setInputValue}
            onSubmit={() => handleSubmit()}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
            isLoading={isLoading}
          />
        </ChatColumn>
      </div>
    </>
  );
}

function derivePaneStatus(runs: RunView[], pendingApproval: PendingActionView | null | undefined): ChatStatus {
  if (pendingApproval && pendingApproval.status === "pending") return "needs-you";
  if (runs.some((r) => r.status === "running" || r.status === "waiting_for_tasks")) return "running";
  return "idle";
}

/**
 * Temporary inline input wrapper. Replaced by chat/ChatInput.tsx in Phase 2.
 * Kept inline here so the chat keeps working between phases.
 */
function ChatInputStub(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      style={{ marginTop: "auto", paddingTop: 8 }}
    >
      <textarea
        ref={props.inputRef}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={props.onKeyDown}
        placeholder="Brief or ask anything…"
        rows={2}
        disabled={props.isLoading}
        style={{
          width: "100%",
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg,
          padding: "12px 14px",
          fontSize: TYPE.scale.sm,
          color: COLORS.text,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
        }}
      />
    </form>
  );
}
