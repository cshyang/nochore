import { ArrowRight } from "@phosphor-icons/react";
import { useEffect } from "react";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";
import type { AgentView, RunView } from "~/lib/types";
import { ConversationMessage } from "~/components/onboarding-chat-messages";
import { useAgentChatFlow } from "~/components/agent-chat-flow";

interface AgentChatPaneProps {
  agent: AgentView;
  projectId: string;
  runs: RunView[];
  onRunTriggered?: (runId: string, triggerRunId: string) => void;
  registerRunCompleteHandler?: (handler: () => void) => void;
}

export function AgentChatPane({ agent, projectId, runs, onRunTriggered, registerRunCompleteHandler }: AgentChatPaneProps) {
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
    agent,
    runs,
    onRunTriggered,
  });

  useEffect(() => {
    registerRunCompleteHandler?.(() => notifyRunCompleted());
  }, [registerRunCompleteHandler, notifyRunCompleted]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Scrollable message area */}
      <div
        ref={scrollRef}
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "0 0 24px",
        }}
      >
        <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {messages.map((message, index) => {
              const isLastAssistant =
                index === messages.length - 1 && message.role === "assistant";

              return (
                <div
                  key={message.id}
                  ref={isLastAssistant ? latestAssistantRef : undefined}
                >
                  <ConversationMessage
                    message={message as { role: string; parts: Array<Record<string, unknown>> }}
                    onOptionClick={isLastAssistant ? handleOptionClick : undefined}
                  />
                </div>
              );
            })}

            {isLoading ? (
              <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim }}>Thinking…</div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Input area */}
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
                placeholder="Ask me anything…"
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
  );
}
