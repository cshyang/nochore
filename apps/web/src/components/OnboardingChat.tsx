import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useNavigate } from "@tanstack/react-router";
import {
  CircleNotch,
  Sparkle,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import { COLORS, RADIUS, TYPE, MOTION } from "~/lib/colors";

interface OnboardingChatProps {
  projectId: string;
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  onBack: () => void;
}

const EXAMPLE_PROMPTS = [
  "Monitor Google Ads spend and pause wasteful keywords",
  "Review new leads daily and score them by fit",
  "Track competitor pricing and alert me to changes",
];

export function OnboardingChat({
  projectId,
  availableSkills,
  existingConnections,
  onBack,
}: OnboardingChatProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const transport = useRef(
    new DefaultChatTransport({
      api: "/api/onboard",
      body: { projectId, availableSkills, existingConnections },
    }),
  ).current;

  const doRedirect = useCallback(
    (agentId: string) => {
      if (redirecting) return;
      setRedirecting(true);
      setTimeout(() => {
        navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId, agentId },
        });
      }, 1500);
    },
    [redirecting, navigate, projectId],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: [
      {
        id: "greeting",
        role: "assistant" as const,
        parts: [
          {
            type: "text" as const,
            text: "What would you like this agent to do? Describe its job in a sentence or two.",
          },
        ],
      },
    ],
    onFinish: ({ message: msg }) => {
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>;
        const isTool =
          p.type === "dynamic-tool" ||
          (typeof p.type === "string" && String(p.type).startsWith("tool-"));
        if (isTool && p.state === "output-available") {
          const output = p.output as { success?: boolean; agentId?: string } | undefined;
          if (output?.success && output.agentId) {
            doRedirect(output.agentId);
            return;
          }
        }
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  // Scan all message parts for a completed create_agent tool call.
  useEffect(() => {
    if (redirecting) return;
    for (const msg of messages) {
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>;
        const isCreateAgent =
          (p.type === "dynamic-tool" && p.toolName === "create_agent") ||
          (typeof p.type === "string" && p.type.startsWith("tool-") && String(p.type).includes("create_agent"));
        if (!isCreateAgent) continue;
        if (p.state !== "output-available") continue;
        const output = p.output as { success?: boolean; agentId?: string } | undefined;
        if (output?.success && output.agentId) {
          doRedirect(output.agentId);
          return;
        }
      }
    }
  }, [messages, redirecting, doRedirect]);

  // Auto-scroll when in conversation mode
  useEffect(() => {
    if (hasSubmitted) {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, hasSubmitted]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [inputValue]);

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      const text = inputValue.trim();
      if (!text || isLoading || redirecting) return;
      if (!hasSubmitted) setHasSubmitted(true);
      setInputValue("");
      void sendMessage({ text });
    },
    [inputValue, isLoading, redirecting, hasSubmitted, sendMessage],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleExampleClick = useCallback(
    (prompt: string) => {
      setInputValue(prompt);
      // Focus the input so the user can review/edit before submitting
      inputRef.current?.focus();
    },
    [],
  );

  // Conversation messages (after first submission) — skip the initial greeting
  const conversationMessages = hasSubmitted ? messages.slice(1) : [];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header */}
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
          onClick={onBack}
          style={{
            background: "none",
            border: "none",
            color: COLORS.textSecondary,
            cursor: "pointer",
            padding: 4,
            display: "flex",
            alignItems: "center",
            transition: `color ${MOTION.duration} ${MOTION.ease}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.text)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
        >
          <ArrowLeft size={18} weight="bold" />
        </button>
        <span
          style={{
            fontSize: TYPE.scale.md,
            fontWeight: TYPE.weight.bold,
            letterSpacing: TYPE.tracking.tight,
            fontFamily: TYPE.display,
          }}
        >
          New Agent
        </span>
      </div>

      {/* Main content — centered when in briefing mode, scrollable in conversation mode */}
      {!hasSubmitted ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            // Shift slightly above true center for visual balance
            marginTop: "-8vh",
            animation: `fadeIn 0.4s ${MOTION.easeOutExpo} both`,
          }}
        >
          <div style={{ width: "100%", maxWidth: 560 }}>
            {/* Prompt heading */}
            <h1
              style={{
                fontSize: TYPE.scale.xl,
                fontWeight: TYPE.weight.bold,
                fontFamily: TYPE.display,
                letterSpacing: TYPE.tracking.tight,
                lineHeight: TYPE.leading.snug,
                color: COLORS.text,
                margin: "0 0 8px 0",
              }}
            >
              What should this agent do?
            </h1>
            <p
              style={{
                fontSize: TYPE.scale.base,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.normal,
                margin: "0 0 28px 0",
                fontFamily: TYPE.body,
              }}
            >
              Describe its job in a sentence or two.
            </p>

            {/* Input area */}
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  position: "relative",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: RADIUS.md,
                  transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
                }}
              >
                <textarea
                  className="textarea"
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. Monitor my Google Ads campaigns and flag wasted spend..."
                  disabled={isLoading || redirecting}
                  rows={1}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: COLORS.text,
                    fontSize: TYPE.scale.md,
                    fontFamily: TYPE.body,
                    lineHeight: TYPE.leading.normal,
                    padding: "14px 16px",
                    paddingRight: inputValue.trim() ? 90 : 16,
                    resize: "none",
                    overflow: "hidden",
                    boxSizing: "border-box",
                  }}
                />
                {/* Continue button — slides in when there's text */}
                <div
                  style={{
                    position: "absolute",
                    right: 8,
                    bottom: 8,
                    opacity: inputValue.trim() ? 1 : 0,
                    transform: inputValue.trim() ? "translateX(0)" : "translateX(4px)",
                    transition: `opacity ${MOTION.duration} ${MOTION.ease}, transform ${MOTION.duration} ${MOTION.ease}`,
                    pointerEvents: inputValue.trim() ? "auto" : "none",
                  }}
                >
                  <button
                    className="btn"
                    type="submit"
                    disabled={!inputValue.trim() || isLoading || redirecting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      padding: "6px 14px",
                      borderRadius: RADIUS.md,
                      background: COLORS.accent,
                      color: COLORS.white,
                      border: "none",
                      fontSize: TYPE.scale.sm,
                      fontWeight: TYPE.weight.semibold,
                      fontFamily: TYPE.body,
                      cursor: "pointer",
                      transition: `background ${MOTION.duration} ${MOTION.ease}`,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentBright)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.accent)}
                  >
                    Continue
                    <ArrowRight size={14} weight="bold" />
                  </button>
                </div>
              </div>

              {/* Keyboard hint */}
              <div
                style={{
                  marginTop: 8,
                  fontSize: TYPE.scale.xs,
                  color: COLORS.textDim,
                  fontFamily: TYPE.body,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <kbd
                  style={{
                    display: "inline-block",
                    padding: "1px 5px",
                    borderRadius: RADIUS.sm,
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    fontSize: TYPE.scale.xs,
                    fontFamily: "inherit",
                    lineHeight: 1.5,
                  }}
                >
                  Enter
                </kbd>
                <span>to continue</span>
              </div>
            </form>

            {/* Example prompts */}
            <div style={{ marginTop: 32 }}>
              <div
                style={{
                  fontSize: TYPE.scale.xs,
                  fontWeight: TYPE.weight.semibold,
                  color: COLORS.textDim,
                  textTransform: "uppercase" as const,
                  letterSpacing: TYPE.tracking.wide,
                  marginBottom: 12,
                  fontFamily: TYPE.body,
                }}
              >
                Try something like
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {EXAMPLE_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleExampleClick(prompt)}
                    style={{
                      background: "none",
                      border: "none",
                      color: COLORS.textSecondary,
                      fontSize: TYPE.scale.base,
                      fontFamily: TYPE.body,
                      lineHeight: TYPE.leading.normal,
                      padding: "6px 0",
                      cursor: "pointer",
                      textAlign: "left",
                      transition: `color ${MOTION.duration} ${MOTION.ease}`,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.accent)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textSecondary)}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Conversation mode — after first submission, show threaded messages */
        <>
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              width: "100%",
              maxWidth: 640,
              margin: "0 auto",
              overflowY: "auto",
              padding: "32px 24px",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            {conversationMessages.map((msg) => (
              <ConversationMessage key={msg.id} message={msg} />
            ))}

            {isLoading && !redirecting && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  color: COLORS.textDim,
                  fontSize: TYPE.scale.sm,
                  fontFamily: TYPE.body,
                }}
              >
                <CircleNotch
                  size={14}
                  weight="bold"
                  style={{ animation: "spin 1s linear infinite" }}
                />
                Thinking...
              </div>
            )}

            {redirecting && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 16px",
                  borderRadius: RADIUS.md,
                  background: COLORS.accentDim,
                  border: `1px solid ${COLORS.accent}`,
                  fontSize: TYPE.scale.base,
                  fontWeight: TYPE.weight.semibold,
                  fontFamily: TYPE.body,
                }}
              >
                <Sparkle size={16} weight="duotone" color={COLORS.accent} />
                Setting up your agent...
              </div>
            )}
          </div>

          {/* Conversation input */}
          {!redirecting && (
            <div
              style={{
                width: "100%",
                maxWidth: 640,
                margin: "0 auto",
                padding: "12px 24px 24px",
              }}
            >
              <form onSubmit={handleSubmit}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-end",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: RADIUS.md,
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                  }}
                >
                  <textarea
                    className="textarea"
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLoading ? "Waiting for response..." : "Type your answer..."}
                    disabled={isLoading || redirecting}
                    rows={1}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: COLORS.text,
                      fontSize: TYPE.scale.md,
                      fontFamily: TYPE.body,
                      lineHeight: TYPE.leading.normal,
                      resize: "none",
                      overflow: "hidden",
                      padding: 0,
                    }}
                  />
                  <button
                    className="btn"
                    type="submit"
                    disabled={!inputValue.trim() || isLoading || redirecting}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "5px 12px",
                      borderRadius: RADIUS.md,
                      background:
                        !inputValue.trim() || isLoading
                          ? "transparent"
                          : COLORS.accent,
                      color:
                        !inputValue.trim() || isLoading
                          ? COLORS.textDim
                          : COLORS.white,
                      border: "none",
                      fontSize: TYPE.scale.sm,
                      fontWeight: TYPE.weight.semibold,
                      fontFamily: TYPE.body,
                      cursor:
                        !inputValue.trim() || isLoading
                          ? "default"
                          : "pointer",
                      transition: `background ${MOTION.duration} ${MOTION.ease}, color ${MOTION.duration} ${MOTION.ease}`,
                      flexShrink: 0,
                    }}
                  >
                    Send
                    <ArrowRight size={13} weight="bold" />
                  </button>
                </div>
              </form>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Message display for conversation mode — no chat bubbles, just clean text */
function ConversationMessage({
  message,
}: {
  message: { role: string; parts: Array<{ type: string; text?: string }> };
}) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  if (!textContent.trim()) return null;

  if (isUser) {
    return (
      <div
        style={{
          fontSize: TYPE.scale.base,
          lineHeight: TYPE.leading.normal,
          color: COLORS.text,
          fontFamily: TYPE.body,
          padding: "8px 12px",
          borderRadius: RADIUS.md,
          background: COLORS.accentDim,
          borderLeft: `2px solid ${COLORS.accent}`,
          whiteSpace: "pre-wrap",
        }}
      >
        {textContent}
      </div>
    );
  }

  return (
    <div
      style={{
        fontSize: TYPE.scale.base,
        lineHeight: TYPE.leading.normal,
        color: COLORS.textSecondary,
        fontFamily: TYPE.body,
        whiteSpace: "pre-wrap",
      }}
    >
      {textContent}
    </div>
  );
}
