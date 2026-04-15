import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import { useOnboardingChatFlow } from "~/components/onboarding-chat-flow";
import { ConversationMessage } from "~/components/onboarding-chat-messages";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
import type { ToolkitSummary } from "~/server/onboard-prompt";

interface OnboardingChatProps {
  projectId: string;
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  toolkitSummaries: ToolkitSummary[];
  onBack: () => void;
}

const EXAMPLE_PROMPTS = [
  "Reduce ad waste",
  "Grow qualified leads",
  "Monitor funnel health",
  "Track competitor pricing",
];

export function OnboardingChat({
  projectId,
  availableSkills,
  existingConnections,
  toolkitSummaries,
  onBack,
}: OnboardingChatProps) {
  const {
    scrollRef,
    inputRef,
    latestAssistantRef,
    inputValue,
    setInputValue,
    redirecting,
    hasSubmitted,
    messages,
    conversationMessages,
    isLoading,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    handleOptionClick,
  } = useOnboardingChatFlow({
    projectId,
    availableSkills,
    existingConnections,
    toolkitSummaries,
  });

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        background: COLORS.bg,
        color: COLORS.text,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          padding: "24px 24px 0",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            cursor: "pointer",
            color: COLORS.textSecondary,
            width: 36,
            height: 36,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <ArrowLeft size={16} />
        </button>
      </div>

      {!hasSubmitted ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "24px",
          }}
        >
          <div style={{ width: "100%", maxWidth: 640 }}>
            <div
              style={{
                fontSize: TYPE.scale["2xl"],
                lineHeight: TYPE.leading.tight,
                fontWeight: TYPE.weight.bold,
                fontFamily: TYPE.display,
                letterSpacing: TYPE.tracking.tight,
                color: COLORS.text,
                marginBottom: 12,
                textAlign: "center",
              }}
            >
              What outcome should this agent own?
            </div>
            <div
              style={{
                fontSize: TYPE.scale.base,
                color: COLORS.textSecondary,
                textAlign: "center",
                marginBottom: 28,
                lineHeight: TYPE.leading.normal,
              }}
            >
              Describe the result you want. We&apos;ll build an agent that owns it.
            </div>

            <form onSubmit={handleSubmit}>
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
                  placeholder="Example: Monitor my Google Ads account every morning and flag wasted spend."
                  rows={3}
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
                    disabled={!inputValue.trim() || isLoading || redirecting}
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

            <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 20 }}>
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  type="button"
                  key={prompt}
                  onClick={() => handleExampleClick(prompt)}
                  style={{
                    borderRadius: RADIUS.pill,
                    border: `1px solid ${COLORS.border}`,
                    background: COLORS.surface,
                    color: COLORS.textSecondary,
                    padding: "8px 12px",
                    fontSize: TYPE.scale.sm,
                    fontFamily: TYPE.body,
                    cursor: "pointer",
                    transition: `all ${MOTION.duration} ${MOTION.ease}`,
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "0 24px 180px",
            }}
          >
            <div style={{ width: "100%", maxWidth: 640, margin: "0 auto" }}>
              <div
                style={{
                  position: "sticky",
                  top: 0,
                  background: `linear-gradient(180deg, ${COLORS.bg} 0%, ${COLORS.bg} 75%, transparent 100%)`,
                  padding: "20px 0 16px",
                  zIndex: 2,
                }}
              >
                <div style={{ fontSize: TYPE.scale.lg, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
                  Agent setup
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {conversationMessages.map((message, index) => {
                  const isLastAssistant =
                    index === conversationMessages.length - 1 && message.role === "assistant" && !redirecting;

                  return (
                    <div key={message.id} ref={isLastAssistant ? latestAssistantRef : undefined}>
                      <ConversationMessage
                        message={message as { role: string; parts: Array<Record<string, unknown>> }}
                        onOptionClick={isLastAssistant ? handleOptionClick : undefined}
                        existingConnections={existingConnections}
                      />
                    </div>
                  );
                })}

                {isLoading ? <div style={{ fontSize: TYPE.scale.sm, color: COLORS.textDim }}>Working…</div> : null}
              </div>

              <div style={{ height: "35vh" }} />
            </div>
          </div>

          <div
            style={{
              position: "fixed",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "16px 24px 24px",
              background: `linear-gradient(180deg, transparent 0%, ${COLORS.bg} 24%, ${COLORS.bg} 100%)`,
            }}
          >
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
                    placeholder="Reply or add more context…"
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
                      disabled={!inputValue.trim() || isLoading || redirecting}
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
        </>
      )}
    </div>
  );
}
