import type { UIMessage } from "ai";
import { ArrowRight, Plus, X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ApprovalCard } from "~/components/ApprovalCard";
import { useAgentChatFlow } from "~/components/agent-chat-flow";
import { ConversationMessage } from "~/components/onboarding-chat-messages";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";
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
  onDeleteThread,
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
    threadId: draftThreadOpen ? undefined : activeThreadId ?? conversation?.threadId,
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
    <div style={{ display: "flex", flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <style>{`
        .agent-chat-layout {
          display: flex;
          flex: 1;
          min-width: 0;
          min-height: 0;
          gap: 20px;
        }
        .agent-chat-rail {
          width: 232px;
          flex-shrink: 0;
        }
        .agent-chat-topbar {
          display: none;
          margin-bottom: 12px;
        }
        .agent-chat-main {
          display: flex;
          flex: 1;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
        }
        @media (max-width: 920px) {
          .agent-chat-layout {
            flex-direction: column;
            gap: 12px;
          }
          .agent-chat-rail {
            display: none;
          }
          .agent-chat-topbar {
            display: block;
          }
        }
      `}</style>

      <div className="agent-chat-layout">
        <div className="agent-chat-rail">
          <ThreadSwitcher
            threads={displayedThreads}
            activeThreadId={draftThreadOpen ? DRAFT_THREAD_ID : activeThreadId ?? conversation?.threadId}
            isLoading={isLoading}
            onSelectThread={onSelectThread}
            onCreateThread={onCreateThread}
            onDeleteThread={onDeleteThread}
            variant="rail"
          />
        </div>

        <div className="agent-chat-main">
          <div className="agent-chat-topbar">
            <ThreadSwitcher
              threads={displayedThreads}
              activeThreadId={draftThreadOpen ? DRAFT_THREAD_ID : activeThreadId ?? conversation?.threadId}
              isLoading={isLoading}
              onSelectThread={onSelectThread}
              onCreateThread={onCreateThread}
              onDeleteThread={onDeleteThread}
              variant="topbar"
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
            <div
              ref={scrollRef}
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "0 0 24px",
                minWidth: 0,
              }}
            >
              <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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
                </div>
              </div>
            </div>

            <div style={{ flexShrink: 0, padding: "12px 0 0" }}>
              <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
                <form onSubmit={handleSubmit} style={{ width: "100%" }}>
                  <div
                    style={{
                      borderRadius: RADIUS.lg,
                      border: `1px solid ${COLORS.border}`,
                      background: COLORS.surface,
                      padding: 14,
                    }}
                  >
                    <textarea
                      ref={inputRef}
                      value={inputValue}
                      onChange={(event) => setInputValue(event.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Ask me anything..."
                      rows={1}
                      style={{
                        width: "100%",
                        border: "none",
                        outline: "none",
                        resize: "none",
                        background: "transparent",
                        color: COLORS.text,
                        fontSize: TYPE.scale.base,
                        fontFamily: TYPE.body,
                        lineHeight: TYPE.leading.normal,
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                      <button
                        type="submit"
                        disabled={!inputValue.trim() || isLoading}
                        style={{
                          width: 34,
                          height: 34,
                          borderRadius: RADIUS.pill,
                          border: "none",
                          background: inputValue.trim() ? COLORS.accent : COLORS.border,
                          color: COLORS.white,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: inputValue.trim() ? "pointer" : "default",
                        }}
                      >
                        <ArrowRight size={16} weight="bold" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadSwitcher({
  threads,
  activeThreadId,
  isLoading,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
  variant,
}: {
  threads: DisplayThread[];
  activeThreadId?: string;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
  variant: "rail" | "topbar";
}) {
  if (threads.length === 0 && !onCreateThread) {
    return null;
  }

  if (variant === "rail") {
    return (
      <ThreadRail
        threads={threads}
        activeThreadId={activeThreadId}
        isLoading={isLoading}
        onSelectThread={onSelectThread}
        onCreateThread={onCreateThread}
        onDeleteThread={onDeleteThread}
      />
    );
  }

  return (
    <ThreadTopbar
      threads={threads}
      activeThreadId={activeThreadId}
      isLoading={isLoading}
      onSelectThread={onSelectThread}
      onCreateThread={onCreateThread}
      onDeleteThread={onDeleteThread}
    />
  );
}

function ThreadRail({
  threads,
  activeThreadId,
  isLoading,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
}: {
  threads: DisplayThread[];
  activeThreadId?: string;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
      <style>{`
        .thread-row { position: relative; transition: background ${MOTION.duration} ${MOTION.ease}; }
        .thread-row-button {
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          padding: 10px 36px 10px 12px;
          border: none;
          border-left: 2px solid transparent;
          border-radius: ${RADIUS.sm}px;
          background: transparent;
          color: ${COLORS.text};
          cursor: pointer;
          text-align: left;
          font-family: ${TYPE.body};
          min-width: 0;
        }
        .thread-row-button:disabled { cursor: default; }
        .thread-row-button[data-active="true"] {
          border-left-color: ${COLORS.accent};
          background: ${COLORS.accentDim};
        }
        .thread-row-button[data-active="true"][data-draft="true"] {
          border-left-color: ${COLORS.orange};
          background: ${COLORS.orangeDim};
        }
        .thread-row:hover .thread-row-button:not([data-active="true"]):not(:disabled),
        .thread-row:focus-within .thread-row-button:not([data-active="true"]):not(:disabled) {
          background: ${COLORS.surfaceHover};
        }
        .thread-row-delete {
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          width: 24px;
          height: 24px;
          border-radius: ${RADIUS.sm}px;
          border: none;
          background: transparent;
          color: ${COLORS.textDim};
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transition: opacity ${MOTION.duration} ${MOTION.ease}, color ${MOTION.duration} ${MOTION.ease};
        }
        .thread-row:hover .thread-row-delete,
        .thread-row:focus-within .thread-row-delete {
          opacity: 1;
          pointer-events: auto;
        }
        .thread-row-delete:hover { color: ${COLORS.red}; background: ${COLORS.redSubtle}; }
        .thread-row-new {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 14px;
          border-radius: ${RADIUS.md}px;
          border: 1px dashed ${COLORS.border};
          background: transparent;
          color: ${COLORS.textSecondary};
          cursor: pointer;
          font-family: ${TYPE.body};
          font-size: ${TYPE.scale.sm};
          font-weight: ${TYPE.weight.medium};
          transition: background ${MOTION.duration} ${MOTION.ease}, border-color ${MOTION.duration} ${MOTION.ease}, color ${MOTION.duration} ${MOTION.ease};
        }
        .thread-row-new:hover:not(:disabled) {
          background: ${COLORS.surfaceHover};
          border-color: ${COLORS.borderStrong};
          color: ${COLORS.text};
        }
        .thread-row-new:disabled { opacity: 0.65; cursor: default; }
      `}</style>

      <div
        style={{
          fontSize: TYPE.scale.xs,
          fontWeight: TYPE.weight.semibold,
          letterSpacing: TYPE.tracking.wide,
          textTransform: "uppercase",
          color: COLORS.textDim,
          fontFamily: TYPE.body,
        }}
      >
        Threads
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {threads.map((thread) => (
          <ThreadRailRow
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
            isLoading={isLoading}
            onSelectThread={onSelectThread}
            onDeleteThread={onDeleteThread}
          />
        ))}
      </div>

      {onCreateThread ? (
        <button
          type="button"
          className="thread-row-new"
          disabled={isLoading}
          onClick={() => void onCreateThread()}
        >
          <Plus size={13} weight="bold" />
          <span>New thread</span>
        </button>
      ) : null}
    </div>
  );
}

function ThreadRailRow({
  thread,
  isActive,
  isLoading,
  onSelectThread,
  onDeleteThread,
}: {
  thread: DisplayThread;
  isActive: boolean;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
}) {
  const disabled = isLoading || isActive || !!thread.isDraft;
  const canDelete = !thread.isDraft && !thread.isPrimary && thread.scope === "manual" && !!onDeleteThread;

  const timestamp = thread.isDraft
    ? "Draft"
    : thread.hasMessages
      ? formatRelativeTime(thread.lastMessageAt ?? thread.updatedAt) || "Active"
      : "Empty";
  const timestampColor = thread.isDraft ? COLORS.orange : COLORS.textDim;

  return (
    <div className="thread-row">
      <button
        type="button"
        className="thread-row-button"
        data-active={isActive ? "true" : "false"}
        data-draft={thread.isDraft ? "true" : "false"}
        disabled={disabled}
        onClick={() => !thread.isDraft && onSelectThread?.(thread.id)}
      >
        <div
          style={{
            fontSize: TYPE.scale.sm,
            fontWeight: TYPE.weight.medium,
            lineHeight: TYPE.leading.snug,
            color: COLORS.text,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            width: "100%",
          }}
        >
          {thread.title}
        </div>
        <div
          style={{
            fontSize: TYPE.scale.xs,
            color: timestampColor,
            lineHeight: TYPE.leading.snug,
          }}
        >
          {timestamp}
        </div>
      </button>
      {canDelete ? (
        <button
          type="button"
          className="thread-row-delete"
          aria-label={`Delete ${thread.title}`}
          disabled={isLoading}
          onClick={(event) => {
            event.stopPropagation();
            void onDeleteThread?.(thread);
          }}
        >
          <X size={12} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}

function ThreadTopbar({
  threads,
  activeThreadId,
  isLoading,
  onSelectThread,
  onCreateThread,
  onDeleteThread,
}: {
  threads: DisplayThread[];
  activeThreadId?: string;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        minWidth: 0,
        overflowX: "auto",
        paddingBottom: 2,
      }}
    >
      {threads.map((thread) => (
        <ThreadChip
          key={thread.id}
          thread={thread}
          activeThreadId={activeThreadId}
          isLoading={isLoading}
          onSelectThread={onSelectThread}
          onDeleteThread={onDeleteThread}
        />
      ))}
      {onCreateThread ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void onCreateThread()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 12px",
            borderRadius: RADIUS.md,
            border: `1px dashed ${COLORS.border}`,
            background: "transparent",
            color: COLORS.textSecondary,
            cursor: isLoading ? "default" : "pointer",
            opacity: isLoading ? 0.65 : 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            fontFamily: TYPE.body,
            fontSize: TYPE.scale.sm,
            fontWeight: TYPE.weight.medium,
          }}
        >
          <Plus size={13} weight="bold" />
          <span>New thread</span>
        </button>
      ) : null}
    </div>
  );
}

function ThreadChip({
  thread,
  activeThreadId,
  isLoading,
  onSelectThread,
  onDeleteThread,
}: {
  thread: DisplayThread;
  activeThreadId?: string;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
  onDeleteThread?: (thread: ConversationThreadSummaryView) => Promise<void> | void;
}) {
  const isActive = thread.id === activeThreadId;
  const disabled = isLoading || isActive || !!thread.isDraft;
  const canDelete = !thread.isDraft && !thread.isPrimary && thread.scope === "manual" && !!onDeleteThread;
  const accentColor = thread.isDraft ? COLORS.orange : COLORS.accent;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !thread.isDraft && onSelectThread?.(thread.id)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          padding: "8px 12px",
          borderRadius: RADIUS.md,
          border: "none",
          borderLeft: `2px solid ${isActive ? accentColor : "transparent"}`,
          background: isActive ? COLORS.accentDim : "transparent",
          color: COLORS.text,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap",
          fontFamily: TYPE.body,
          fontSize: TYPE.scale.sm,
          fontWeight: TYPE.weight.medium,
          transition: `background ${MOTION.duration} ${MOTION.ease}`,
        }}
      >
        {thread.title}
      </button>
      {canDelete ? (
        <button
          type="button"
          aria-label={`Delete ${thread.title}`}
          disabled={isLoading}
          onClick={(event) => {
            event.stopPropagation();
            void onDeleteThread?.(thread);
          }}
          style={{
            width: 24,
            height: 24,
            borderRadius: RADIUS.sm,
            border: "none",
            background: "transparent",
            color: COLORS.textDim,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isLoading ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          <X size={11} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
