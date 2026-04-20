import type { UIMessage } from "ai";
import { ArrowRight, Plus } from "@phosphor-icons/react";
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
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => Promise<void> | void;
  onRunTriggered?: (runId: string, triggerRunId: string) => void;
  registerRunCompleteHandler?: (handler: () => void) => void;
  pendingApproval?: PendingActionView | null;
  onApprove?: (actionId: string, reason: string) => void | Promise<void>;
  onReject?: (actionId: string, reason: string) => void | Promise<void>;
  onClearPendingApproval?: () => void;
}

export function AgentChatPane({
  agent,
  projectId,
  runs,
  conversation,
  threads = [],
  onSelectThread,
  onCreateThread,
  onRunTriggered,
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
    threadId: conversation?.threadId,
    agent,
    runs,
    initialMessages: conversation?.messages as UIMessage[] | undefined,
    onRunTriggered,
  });

  const availableThreads =
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
            } satisfies ConversationThreadSummaryView,
          ]
        : [];

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
          gap: 16px;
        }
        .agent-chat-rail {
          width: 220px;
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
            threads={availableThreads}
            activeThreadId={conversation?.threadId}
            isLoading={isLoading}
            onSelectThread={onSelectThread}
            onCreateThread={onCreateThread}
            variant="rail"
          />
        </div>

        <div className="agent-chat-main">
          <div className="agent-chat-topbar">
            <ThreadSwitcher
              threads={availableThreads}
              activeThreadId={conversation?.threadId}
              isLoading={isLoading}
              onSelectThread={onSelectThread}
              onCreateThread={onCreateThread}
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
                  {conversation?.checkpointSummary ? (
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
  variant,
}: {
  threads: ConversationThreadSummaryView[];
  activeThreadId?: string;
  isLoading: boolean;
  onSelectThread?: (threadId: string) => void;
  onCreateThread?: () => Promise<void> | void;
  variant: "rail" | "topbar";
}) {
  if (threads.length === 0 && !onCreateThread) {
    return null;
  }

  const isRail = variant === "rail";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: isRail ? "column" : "row",
        gap: 10,
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: isRail ? "column" : "row",
          gap: 8,
          minWidth: 0,
          overflowX: isRail ? "visible" : "auto",
          paddingBottom: isRail ? 0 : 2,
        }}
      >
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          const disabled = isLoading || isActive;
          return (
            <button
              key={thread.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelectThread?.(thread.id)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 4,
                minWidth: isRail ? 0 : 180,
                padding: isRail ? "12px 12px" : "10px 12px",
                borderRadius: RADIUS.lg,
                border: `1px solid ${isActive ? COLORS.accentBorder : COLORS.border}`,
                background: isActive ? COLORS.accentSubtle : COLORS.surface,
                color: COLORS.text,
                cursor: disabled ? "default" : "pointer",
                opacity: disabled && !isActive ? 0.65 : 1,
                textAlign: "left",
                flexShrink: 0,
              }}
            >
              <span
                style={{
                  fontSize: TYPE.scale.sm,
                  fontWeight: TYPE.weight.medium,
                  lineHeight: TYPE.leading.snug,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  width: "100%",
                }}
              >
                {thread.title}
              </span>
              <span
                style={{
                  fontSize: TYPE.scale.xs,
                  color: isActive ? COLORS.accentBright : COLORS.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                }}
              >
                {thread.isPrimary ? "Primary" : "Thread"}
              </span>
            </button>
          );
        })}
      </div>

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
            padding: isRail ? "12px 12px" : "10px 12px",
            borderRadius: RADIUS.lg,
            border: `1px dashed ${COLORS.borderStrong}`,
            background: "transparent",
            color: COLORS.textSecondary,
            cursor: isLoading ? "default" : "pointer",
            opacity: isLoading ? 0.65 : 1,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <Plus size={14} weight="bold" />
          <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium }}>New thread</span>
        </button>
      ) : null}
    </div>
  );
}
