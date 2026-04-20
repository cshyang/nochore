import type { UIMessage } from "ai";
import { ArrowRight, Plus, X } from "@phosphor-icons/react";
import { useEffect } from "react";
import { ApprovalCard } from "~/components/ApprovalCard";
import { useAgentChatFlow } from "~/components/agent-chat-flow";
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
  onRunTriggered?: (runId: string, triggerRunId: string) => void;
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

  const isRail = variant === "rail";
  const primaryThread = threads.find((thread) => thread.isPrimary);
  const draftThread = threads.find((thread) => thread.isDraft);
  const manualThreads = threads.filter((thread) => !thread.isPrimary && !thread.isDraft);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isRail ? "column" : "row",
        gap: isRail ? 14 : 10,
        minHeight: 0,
      }}
    >
      {isRail ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 14,
            minHeight: 0,
          }}
        >
          <div>
            <div
              style={{
                marginBottom: 8,
                fontSize: TYPE.scale.xs,
                fontWeight: TYPE.weight.medium,
                letterSpacing: TYPE.tracking.wide,
                textTransform: "uppercase",
                color: COLORS.textDim,
              }}
            >
              Threads
            </div>
            {primaryThread ? (
              <ThreadPrimaryCard
                thread={primaryThread}
                activeThreadId={activeThreadId}
                isLoading={isLoading}
                onSelectThread={onSelectThread}
              />
            ) : null}
          </div>

          {draftThread || manualThreads.length > 0 ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              {draftThread ? (
                <ThreadListRow
                  thread={draftThread}
                  activeThreadId={activeThreadId}
                  isLoading={isLoading}
                  onSelectThread={onSelectThread}
                />
              ) : null}
              {manualThreads.length > 0 ? (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "6px",
                    borderRadius: RADIUS.lg,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.bgRaised,
                  }}
                >
                  {manualThreads.map((thread) => (
                    <ThreadListRow
                      key={thread.id}
                      thread={thread}
                      activeThreadId={activeThreadId}
                      isLoading={isLoading}
                      onSelectThread={onSelectThread}
                      onDeleteThread={onDeleteThread}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : (
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
        </div>
      )}

      {onCreateThread ? (
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void onCreateThread()}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            padding: isRail ? "14px 14px" : "10px 12px",
            borderRadius: RADIUS.lg,
            border: `1px dashed ${COLORS.borderStrong}`,
            background: isRail ? COLORS.bgRaised : "transparent",
            color: COLORS.textSecondary,
            cursor: isLoading ? "default" : "pointer",
            opacity: isLoading ? 0.65 : 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
            width: isRail ? "100%" : undefined,
          }}
        >
          <Plus size={14} weight="bold" />
          <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium }}>New thread</span>
        </button>
      ) : null}
    </div>
  );
}

function ThreadPrimaryCard({
  thread,
  activeThreadId,
  isLoading,
  onSelectThread,
}: {
  thread: DisplayThread;
  activeThreadId?: string;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
}) {
  const isActive = thread.id === activeThreadId;
  const disabled = isLoading || isActive;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelectThread?.(thread.id)}
      style={{
        width: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: 10,
        padding: "16px 16px 14px",
        borderRadius: RADIUS.lg,
        border: `1px solid ${isActive ? COLORS.accentBorder : COLORS.border}`,
        background: isActive
          ? `linear-gradient(180deg, ${COLORS.accentSubtle} 0%, ${COLORS.surface} 100%)`
          : COLORS.surface,
        color: COLORS.text,
        cursor: disabled ? "default" : "pointer",
        textAlign: "left",
      }}
    >
      <div
        style={{
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: TYPE.scale.base,
              fontWeight: TYPE.weight.medium,
              lineHeight: TYPE.leading.snug,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {thread.title}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: TYPE.scale.sm,
              color: COLORS.textSecondary,
              lineHeight: TYPE.leading.normal,
            }}
          >
            Default conversation for this agent
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            width: 8,
            height: 8,
            marginTop: 4,
            borderRadius: RADIUS.pill,
            background: isActive ? COLORS.accentBright : COLORS.borderStrong,
          }}
        />
      </div>
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: TYPE.scale.xs,
          fontWeight: TYPE.weight.medium,
          letterSpacing: TYPE.tracking.wide,
          textTransform: "uppercase",
          color: isActive ? COLORS.accentBright : COLORS.textDim,
        }}
      >
        <span>Primary</span>
        <span style={{ opacity: 0.45 }}>•</span>
        <span>{thread.hasMessages ? "Active history" : "Empty"}</span>
      </div>
    </button>
  );
}

function ThreadListRow({
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
  const disabled = isLoading || isActive || thread.isDraft;
  const canDelete = !thread.isDraft && !thread.isPrimary && thread.scope === "manual" && onDeleteThread;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 8,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !thread.isDraft && onSelectThread?.(thread.id)}
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          minWidth: 0,
          padding: "11px 12px",
          borderRadius: RADIUS.md,
          border: `1px solid ${isActive ? COLORS.accentBorder : "transparent"}`,
          background: isActive ? COLORS.accentSubtle : thread.isDraft ? COLORS.draftBg : "transparent",
          color: COLORS.text,
          cursor: disabled ? "default" : "pointer",
          textAlign: "left",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: TYPE.scale.sm,
              fontWeight: TYPE.weight.medium,
              lineHeight: TYPE.leading.snug,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {thread.title}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: TYPE.scale.xs,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: isActive ? COLORS.accentBright : COLORS.textDim,
            }}
          >
            {thread.isDraft ? "Draft" : thread.hasMessages ? `${thread.messageCount} messages` : "Empty"}
          </div>
        </div>
        <div
          style={{
            flexShrink: 0,
            width: 6,
            height: 6,
            borderRadius: RADIUS.pill,
            background: isActive ? COLORS.accentBright : thread.isDraft ? COLORS.orange : COLORS.borderStrong,
          }}
        />
      </button>
      {canDelete ? (
        <button
          type="button"
          aria-label={`Delete ${thread.title}`}
          disabled={isLoading}
          onClick={() => void onDeleteThread?.(thread)}
          style={{
            width: 34,
            height: 34,
            alignSelf: "center",
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            color: COLORS.textDim,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isLoading ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          <X size={13} weight="bold" />
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
  const disabled = isLoading || isActive || thread.isDraft;
  const canDelete = !thread.isDraft && !thread.isPrimary && thread.scope === "manual" && onDeleteThread;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => !thread.isDraft && onSelectThread?.(thread.id)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderRadius: RADIUS.lg,
          border: `1px solid ${isActive ? COLORS.accentBorder : COLORS.border}`,
          background: isActive ? COLORS.accentSubtle : COLORS.surface,
          color: COLORS.text,
          cursor: disabled ? "default" : "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: RADIUS.pill,
            background: thread.isPrimary ? COLORS.accentBright : thread.isDraft ? COLORS.orange : COLORS.borderStrong,
            flexShrink: 0,
          }}
        />
        <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium }}>{thread.title}</span>
      </button>
      {canDelete ? (
        <button
          type="button"
          aria-label={`Delete ${thread.title}`}
          disabled={isLoading}
          onClick={() => void onDeleteThread?.(thread)}
          style={{
            width: 30,
            height: 30,
            borderRadius: RADIUS.md,
            border: `1px solid ${COLORS.border}`,
            background: COLORS.surface,
            color: COLORS.textDim,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: isLoading ? "default" : "pointer",
            flexShrink: 0,
          }}
        >
          <X size={12} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
