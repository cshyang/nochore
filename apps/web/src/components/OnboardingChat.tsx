import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useNavigate } from "@tanstack/react-router";
import Markdown from "react-markdown";
import {
  Sparkle,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import { COLORS, RADIUS, TYPE, MOTION } from "~/lib/colors";
import type { ToolkitSummary } from "~/server/onboard-prompt";

interface OnboardingChatProps {
  projectId: string;
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  toolkitSummaries: ToolkitSummary[];
  onBack: () => void;
}

/** Check if a message part is a request_input tool call (static or dynamic) */
function isRequestInputPart(p: Record<string, unknown>): boolean {
  return p.type === "tool-request_input" ||
    (p.type === "dynamic-tool" && p.toolName === "request_input");
}

const EXAMPLE_PROMPTS = [
  "Monitor ad spend",
  "Score new leads",
  "Track competitors",
  "Optimize keywords",
];

export function OnboardingChat({
  projectId,
  availableSkills,
  existingConnections,
  toolkitSummaries,
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
      body: { projectId, availableSkills, existingConnections, toolkitSummaries },
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

  // Auto-scroll: bring the latest assistant response to the top of the visible area
  const latestAssistantRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasSubmitted) return;
    const timer = setTimeout(() => {
      const container = scrollRef.current;
      const target = latestAssistantRef.current;
      if (container && target) {
        // Calculate the target's position relative to the scroll container
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offset = targetRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({
          top: offset - 24, // 24px breathing room from top
          behavior: "smooth",
        });
      } else if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: "smooth",
        });
      }
    }, 80);
    return () => clearTimeout(timer);
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

  const handleOptionClick = useCallback(
    (value: string) => {
      if (isLoading || redirecting) return;
      if (!hasSubmitted) setHasSubmitted(true);
      setInputValue("");
      void sendMessage({ text: value });
    },
    [isLoading, redirecting, hasSubmitted, sendMessage],
  );

  // Conversation messages (after first submission) — skip the initial greeting
  const conversationMessages = hasSubmitted ? messages.slice(1) : [];

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

      {/* Briefing mode — input-centric, Claude-style layout */}
      {!hasSubmitted ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 24px",
            marginTop: "-6vh",
            animation: `fadeIn 0.4s ${MOTION.easeOutExpo} both`,
          }}
        >
          <div style={{ width: "100%", maxWidth: 640, textAlign: "center" }}>
            {/* Greeting */}
            <h1
              style={{
                fontSize: "2rem",
                fontWeight: TYPE.weight.bold,
                fontFamily: TYPE.display,
                letterSpacing: TYPE.tracking.tight,
                lineHeight: TYPE.leading.snug,
                color: COLORS.text,
                margin: "0 0 32px 0",
              }}
            >
              <span style={{ color: COLORS.accent }}>✦</span>{" "}
              What should this agent do?
            </h1>

            {/* Hero input */}
            <form onSubmit={handleSubmit}>
              <div
                className="hero-input"
                style={{
                  position: "relative",
                  background: COLORS.surface,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 16,
                  transition: `border-color ${MOTION.duration} ${MOTION.ease}, box-shadow ${MOTION.duration} ${MOTION.ease}`,
                  padding: "4px",
                }}
              >
                <textarea
                  ref={inputRef}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe the agent's job..."
                  disabled={isLoading || redirecting}
                  rows={2}
                  style={{
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: COLORS.text,
                    fontSize: TYPE.scale.md,
                    fontFamily: TYPE.body,
                    lineHeight: TYPE.leading.normal,
                    padding: "14px 16px 6px",
                    resize: "none",
                    overflow: "hidden",
                    boxSizing: "border-box",
                  }}
                />
                {/* Bottom bar inside input — submit button */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "flex-end",
                    padding: "4px 8px 8px",
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
                      padding: "6px 16px",
                      borderRadius: RADIUS.lg,
                      background: inputValue.trim()
                        ? COLORS.accent
                        : "transparent",
                      color: inputValue.trim()
                        ? COLORS.white
                        : COLORS.textDim,
                      border: "none",
                      fontSize: TYPE.scale.sm,
                      fontWeight: TYPE.weight.semibold,
                      fontFamily: TYPE.body,
                      cursor: inputValue.trim() ? "pointer" : "default",
                      transition: `all ${MOTION.duration} ${MOTION.ease}`,
                    }}
                    onMouseEnter={(e) => {
                      if (inputValue.trim()) e.currentTarget.style.background = COLORS.accentBright;
                    }}
                    onMouseLeave={(e) => {
                      if (inputValue.trim()) e.currentTarget.style.background = COLORS.accent;
                    }}
                  >
                    <ArrowRight size={14} weight="bold" />
                  </button>
                </div>
              </div>
            </form>

            {/* Suggestion pills — horizontal row below input */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: 8,
                marginTop: 16,
              }}
            >
              {EXAMPLE_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  className="pill"
                  onClick={() => handleExampleClick(prompt)}
                  style={{
                    background: "transparent",
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: RADIUS.pill,
                    color: COLORS.textSecondary,
                    fontSize: TYPE.scale.xs,
                    fontFamily: TYPE.body,
                    fontWeight: TYPE.weight.medium,
                    padding: "7px 16px",
                    cursor: "pointer",
                    transition: `all ${MOTION.duration} ${MOTION.ease}`,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = COLORS.accent;
                    e.currentTarget.style.color = COLORS.text;
                    e.currentTarget.style.background = COLORS.accentDim;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border;
                    e.currentTarget.style.color = COLORS.textSecondary;
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        /* Conversation mode — scrollable messages + fixed input at bottom */
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
        >
          {/* Scrollable messages area */}
          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "0 24px 24px",
            }}
          >
            <div style={{ width: "100%", maxWidth: 640 }}>
              {/* Persistent heading */}
              <div style={{ textAlign: "center", marginBottom: 32, paddingTop: 24 }}>
                <h2
                  style={{
                    fontSize: TYPE.scale.lg,
                    fontWeight: TYPE.weight.bold,
                    fontFamily: TYPE.display,
                    letterSpacing: TYPE.tracking.tight,
                    color: COLORS.text,
                    margin: 0,
                  }}
                >
                  <span style={{ color: COLORS.accent }}>✦</span>{" "}
                  Setting up your agent
                </h2>
              </div>

              {/* Messages */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {conversationMessages.map((msg, idx) => {
                  // Only the last assistant message's options are interactive
                  const isLastAssistant =
                    msg.role === "assistant" &&
                    !conversationMessages.slice(idx + 1).some((m) => m.role === "assistant");

                  // Find which option the user selected
                  let selected: string | undefined;
                  if (msg.role === "assistant" && !isLastAssistant) {
                    // First: check tool output (structured path)
                    for (const part of msg.parts) {
                      const p = part as Record<string, unknown>;
                      if (
                        (p.type === "dynamic-tool" ||
                          (typeof p.type === "string" && String(p.type).startsWith("tool-"))) &&
                        isRequestInputPart(p as Record<string, unknown>) &&
                        p.state === "output-available"
                      ) {
                        const output = p.output as { selectedKeys?: string[] } | undefined;
                        if (output?.selectedKeys) {
                          selected = output.selectedKeys.join(", ");
                        }
                      }
                    }
                    // Fallback: use next user message text as the selection
                    if (!selected) {
                      const nextUser = conversationMessages.slice(idx + 1).find((m) => m.role === "user");
                      if (nextUser) {
                        selected = nextUser.parts
                          .filter((p): p is { type: "text"; text: string } => p.type === "text")
                          .map((p) => p.text)
                          .join("")
                          .trim();
                      }
                    }
                  }

                  return (
                    <div key={msg.id} ref={isLastAssistant ? latestAssistantRef : undefined}>
                      <ConversationMessage
                        message={msg}
                        onOptionClick={isLastAssistant ? handleOptionClick : undefined}
                        selectedKey={selected}
                      />
                    </div>
                  );
                })}

                {isLoading && !redirecting && (
                  <ThinkingIndicator messages={conversationMessages} />
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
              {/* Spacer — gives enough scroll room to push last response to the top */}
              <div style={{ minHeight: "60vh", flexShrink: 0 }} />
            </div>
          </div>

          {/* Fixed input at bottom */}
          {!redirecting && (
            <div
              style={{
                flexShrink: 0,
                display: "flex",
                justifyContent: "center",
                padding: "12px 24px 24px",
                background: COLORS.bg,
              }}
            >
              <form onSubmit={handleSubmit} style={{ width: "100%", maxWidth: 640 }}>
                <div
                  className="hero-input"
                  style={{
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 16,
                    padding: "4px",
                    transition: `border-color ${MOTION.duration} ${MOTION.ease}, box-shadow ${MOTION.duration} ${MOTION.ease}`,
                  }}
                >
                  <textarea
                    ref={inputRef}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLoading ? "Waiting for response..." : "Type your answer..."}
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
                      padding: "12px 14px 4px",
                      resize: "none",
                      overflow: "hidden",
                      boxSizing: "border-box",
                    }}
                  />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      padding: "2px 8px 6px",
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
                        padding: "6px 16px",
                        borderRadius: RADIUS.lg,
                        background: inputValue.trim()
                          ? COLORS.accent
                          : "transparent",
                        color: inputValue.trim()
                          ? COLORS.white
                          : COLORS.textDim,
                        border: "none",
                        fontSize: TYPE.scale.sm,
                        fontWeight: TYPE.weight.semibold,
                        fontFamily: TYPE.body,
                        cursor: inputValue.trim() ? "pointer" : "default",
                        transition: `all ${MOTION.duration} ${MOTION.ease}`,
                      }}
                      onMouseEnter={(e) => {
                        if (inputValue.trim()) e.currentTarget.style.background = COLORS.accentBright;
                      }}
                      onMouseLeave={(e) => {
                        if (inputValue.trim()) e.currentTarget.style.background = COLORS.accent;
                      }}
                    >
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ThinkingIndicator — pulsing dot + ephemeral reasoning text with shimmer
// ---------------------------------------------------------------------------

function ThinkingIndicator({
  messages,
}: {
  messages: Array<{ role: string; parts: Array<{ type: string; text?: string; reasoning?: string; state?: string }> }>;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Extract the latest streaming reasoning text from the last assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const reasoningPart = lastAssistant?.parts
    .slice()
    .reverse()
    .find((p) => p.type === "reasoning" && p.state === "streaming");
  const reasoningText = reasoningPart?.text ?? reasoningPart?.reasoning ?? "";

  // Auto-scroll to bottom as reasoning streams in
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [reasoningText]);

  return (
    <div
      style={{
        borderLeft: `2px solid ${COLORS.accent}`,
        borderRadius: `0 ${RADIUS.md}px ${RADIUS.md}px 0`,
        background: COLORS.surface,
        padding: "10px 14px",
        animation: "fadeIn 0.2s ease both",
      }}
    >
      {/* Header: pulsing dot + label */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: reasoningText ? 8 : 0,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: COLORS.accent,
            flexShrink: 0,
            animation: "heartbeat 1.2s ease-in-out infinite",
          }}
        />
        <span
          className="thinking-shimmer"
          style={{
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            fontWeight: TYPE.weight.medium,
            letterSpacing: TYPE.tracking.wide,
            textTransform: "uppercase" as const,
          }}
        >
          Thinking
        </span>
      </div>
      {/* Streaming reasoning text */}
      {reasoningText && (
        <div
          ref={scrollRef}
          style={{
            maxHeight: 120,
            overflowY: "auto",
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            color: COLORS.textDim,
            lineHeight: TYPE.leading.loose,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
          }}
        >
          {reasoningText}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Option detection — parses "A) label" / "A. label" lines from LLM responses
// ---------------------------------------------------------------------------

const OPTION_RE = /^([A-Z])[).]\s+(.+)$/gm;

function parseOptions(text: string): {
  body: string;
  options: Array<{ key: string; label: string }>;
  isMultiSelect: boolean;
} {
  const options: Array<{ key: string; label: string }> = [];
  let match: RegExpExecArray | null;

  while ((match = OPTION_RE.exec(text)) !== null) {
    // Strip markdown bold markers from option labels
    const label = match[2].replace(/\*\*(.+?)\*\*/g, "$1");
    options.push({ key: match[1], label });
  }
  OPTION_RE.lastIndex = 0;

  // Require 2+ matches to avoid false positives
  if (options.length < 2) {
    return { body: text, options: [], isMultiSelect: false };
  }

  const body = text.replace(OPTION_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  OPTION_RE.lastIndex = 0;

  // Detect multi-select from the message text
  const isMultiSelect = /pick multiple|select multiple|choose multiple|more than one|select all that/i.test(text);

  return { body, options, isMultiSelect };
}

// ---------------------------------------------------------------------------
// ConversationMessage — renders markdown + clickable option buttons
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types for request_input tool
// ---------------------------------------------------------------------------

interface RequestInputToolInput {
  question: string;
  options: Array<{ key: string; label: string; description?: string; selected?: boolean }>;
  multiSelect: boolean;
  allowCustom?: boolean;
  skippable?: boolean;
}

// ---------------------------------------------------------------------------
// ConversationMessage — renders markdown + option cards (single or paginated)
// ---------------------------------------------------------------------------

function ConversationMessage({
  message,
  onOptionClick,
  selectedKey,
}: {
  message: { role: string; parts: Array<{ type: string; text?: string }> };
  onOptionClick?: (value: string) => void;
  selectedKey?: string;
}) {
  const isUser = message.role === "user";

  const textContent = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");

  // Collect ALL request_input tool calls in this message
  const toolParts = (message.parts as unknown as Array<Record<string, unknown>>).filter(
    (p) => isRequestInputPart(p as Record<string, unknown>),
  );

  if (!textContent.trim() && toolParts.length === 0) return null;

  // User messages — right-aligned chip
  if (isUser) {
    return (
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            fontSize: TYPE.scale.md,
            lineHeight: TYPE.leading.normal,
            color: COLORS.text,
            fontFamily: TYPE.body,
            padding: "10px 16px",
            borderRadius: RADIUS.lg,
            background: COLORS.surfaceHover,
            maxWidth: "85%",
            wordBreak: "break-word",
            overflowWrap: "break-word",
          }}
        >
          {textContent}
        </div>
      </div>
    );
  }

  // Extract tool inputs
  const toolInputs: RequestInputToolInput[] = toolParts
    .map((p) => p.input as RequestInputToolInput | undefined)
    .filter((input): input is RequestInputToolInput => !!input);

  // For single tool call, fall back to regex if no tool input
  const singleToolInput = toolInputs[0];
  const toolOptions = singleToolInput?.options ?? [];
  const { body: regexBody, options: regexOptions, isMultiSelect: regexMulti } =
    toolOptions.length > 0
      ? { body: textContent, options: [] as Array<{ key: string; label: string }>, isMultiSelect: false }
      : parseOptions(textContent);

  const isActive = !!onOptionClick;
  const isPast = !isActive;

  // Past message: collapsed summary
  if (isPast && toolParts.length > 0) {
    // Resolve what was selected
    let resolvedSelectedKey = selectedKey;
    if (!resolvedSelectedKey && toolParts[0]?.state === "output-available") {
      const output = toolParts[0].output as { selectedKeys?: string[] } | undefined;
      if (output?.selectedKeys) resolvedSelectedKey = output.selectedKeys.join(", ");
    }

    if (toolInputs.length > 1) {
      // Batched: show collapsed summary
      const answeredCount = resolvedSelectedKey
        ? resolvedSelectedKey.split("\n").filter((l) => l.trim()).length
        : 0;
      return (
        <div>
          {textContent.trim() && (
            <div className="prose" style={{ fontSize: TYPE.scale.md, lineHeight: TYPE.leading.loose, color: COLORS.textSecondary, fontFamily: TYPE.body }}>
              <Markdown>{textContent}</Markdown>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: TYPE.scale.sm, color: COLORS.textDim, fontFamily: TYPE.body, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: COLORS.accent }}>☑</span>
            {answeredCount > 0 ? `${answeredCount} questions answered` : "Questions answered"}
          </div>
        </div>
      );
    }

    // Single past card: collapsed single-line
    const question = singleToolInput?.question ?? regexBody;
    const answer = resolvedSelectedKey || "Skipped";
    const resolvedAnswer = resolveSelectedLabel(answer, singleToolInput?.options ?? regexOptions);
    return (
      <div>
        {textContent.trim() && textContent !== question && (
          <div className="prose" style={{ fontSize: TYPE.scale.md, lineHeight: TYPE.leading.loose, color: COLORS.textSecondary, fontFamily: TYPE.body }}>
            <Markdown>{textContent}</Markdown>
          </div>
        )}
        <div style={{ marginTop: 8, fontSize: TYPE.scale.sm, color: COLORS.textDim, fontFamily: TYPE.body, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: COLORS.accent }}>☑</span>
          {question} → <span style={{ color: COLORS.text }}>{resolvedAnswer}</span>
        </div>
      </div>
    );
  }

  // Active message: paginated card (or single card)
  if (toolInputs.length > 1) {
    return (
      <div>
        {textContent.trim() && (
          <div className="prose" style={{ fontSize: TYPE.scale.md, lineHeight: TYPE.leading.loose, color: COLORS.textSecondary, fontFamily: TYPE.body }}>
            <Markdown>{textContent}</Markdown>
          </div>
        )}
        <PaginatedCard steps={toolInputs} onComplete={onOptionClick} />
      </div>
    );
  }

  // Single active card
  const finalBody = toolOptions.length > 0 ? (singleToolInput?.question ?? textContent) : regexBody;
  const finalOptions = toolOptions.length > 0 ? toolOptions : regexOptions;
  const finalMultiSelect = toolOptions.length > 0 ? (singleToolInput?.multiSelect ?? false) : regexMulti;

  return (
    <div>
      {finalBody && (
        <div className="prose" style={{ fontSize: TYPE.scale.md, lineHeight: TYPE.leading.loose, color: COLORS.textSecondary, fontFamily: TYPE.body }}>
          <Markdown>{finalBody}</Markdown>
        </div>
      )}
      {finalOptions.length > 0 && (
        <OptionCards
          options={finalOptions}
          isMultiSelect={finalMultiSelect}
          allowCustom={singleToolInput?.allowCustom}
          skippable={singleToolInput?.skippable}
          onOptionClick={onOptionClick}
        />
      )}
    </div>
  );
}

/** Resolve a selectedKey back to a human-readable label */
function resolveSelectedLabel(
  selected: string,
  options: Array<{ key: string; label: string }>,
): string {
  const keyToLabel = new Map(options.map((o) => [o.key, o.label]));
  // Try full match first
  if (keyToLabel.has(selected)) return keyToLabel.get(selected)!;
  const byLabel = options.find((o) => o.label === selected);
  if (byLabel) return byLabel.label;
  // Multi-select: resolve each token
  return selected
    .split(",")
    .map((s) => s.trim())
    .map((t) => keyToLabel.get(t) ?? t)
    .join(", ");
}

// ---------------------------------------------------------------------------
// PaginatedCard — batched questions with Next/Back/Skip navigation
// ---------------------------------------------------------------------------

function PaginatedCard({
  steps,
  onComplete,
}: {
  steps: RequestInputToolInput[];
  onComplete?: (value: string) => void;
}) {
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Map<number, { keys: string[]; customText?: string; skipped?: boolean }>>(new Map);

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const currentAnswer = answers.get(currentStep);
  const hasAnswer = currentAnswer && (currentAnswer.keys.length > 0 || currentAnswer.customText || currentAnswer.skipped);

  const handleStepAnswer = (keys: string[], customText?: string) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(currentStep, { keys, customText });
      return next;
    });
  };

  const handleSkip = () => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(currentStep, { keys: [], skipped: true });
      return next;
    });
    if (isLast) {
      submitAll();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleNext = () => {
    if (isLast) {
      submitAll();
    } else {
      setCurrentStep((s) => s + 1);
    }
  };

  const submitAll = () => {
    // Build a combined text from all answers
    const parts: string[] = [];
    for (let i = 0; i < steps.length; i++) {
      const ans = answers.get(i);
      if (!ans || ans.skipped) continue;
      if (ans.customText) {
        parts.push(ans.customText);
      } else if (ans.keys.length > 0) {
        // Resolve keys to labels
        const labelMap = new Map(steps[i].options.map((o) => [o.key, o.label]));
        const labels = ans.keys.map((k) => labelMap.get(k) ?? k);
        parts.push(labels.join(", "));
      }
    }
    onComplete?.(parts.join("\n"));
  };

  return (
    <div
      style={{
        marginTop: 14,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
      }}
    >
      {/* Header with question + progress */}
      <div style={{ padding: "14px 16px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <span style={{ fontSize: TYPE.scale.base, fontFamily: TYPE.body, fontWeight: TYPE.weight.medium, color: COLORS.text, lineHeight: TYPE.leading.snug }}>
          {step.question}
        </span>
        <span style={{ fontSize: TYPE.scale.xs, fontFamily: TYPE.body, color: COLORS.textDim, flexShrink: 0, whiteSpace: "nowrap" }}>
          {currentStep + 1} / {steps.length}
        </span>
      </div>

      {/* Options */}
      <OptionCards
        options={step.options}
        isMultiSelect={step.multiSelect}
        allowCustom={step.allowCustom}
        skippable={step.skippable}
        isPaginated
        initialKeys={currentAnswer?.keys}
        initialCustomText={currentAnswer?.customText}
        onSelectionChange={handleStepAnswer}
        onSkip={handleSkip}
        onSubmit={handleNext}
        isLast={isLast}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// OptionCards — radio/checkbox with optional "Something else" and Skip
// ---------------------------------------------------------------------------

function OptionCards({
  options,
  isMultiSelect,
  allowCustom,
  skippable,
  onOptionClick,
  // Paginated mode props
  isPaginated,
  initialKeys,
  initialCustomText,
  onSelectionChange,
  onSkip,
  onSubmit,
  isLast,
}: {
  options: Array<{ key: string; label: string; description?: string; selected?: boolean }>;
  isMultiSelect: boolean;
  allowCustom?: boolean;
  skippable?: boolean;
  onOptionClick?: (value: string) => void;
  // Paginated mode
  isPaginated?: boolean;
  initialKeys?: string[];
  initialCustomText?: string;
  onSelectionChange?: (keys: string[], customText?: string) => void;
  onSkip?: () => void;
  onSubmit?: () => void;
  isLast?: boolean;
}) {
  const [toggled, setToggled] = useState<Set<string>>(
    () => new Set(initialKeys ?? options.filter((o) => o.selected).map((o) => o.key)),
  );
  const [customActive, setCustomActive] = useState(initialKeys?.includes("_custom") ?? false);
  const [customText, setCustomText] = useState(initialCustomText ?? "");
  const customInputRef = useRef<HTMLInputElement>(null);
  const isActive = !!onOptionClick || isPaginated;

  // Sync selection changes to parent in paginated mode
  useEffect(() => {
    if (isPaginated && onSelectionChange) {
      const keys = [...toggled];
      if (customActive) keys.push("_custom");
      onSelectionChange(keys, customActive ? customText : undefined);
    }
  }, [toggled, customActive, customText, isPaginated, onSelectionChange]);

  // Reset state when paginated step changes
  useEffect(() => {
    setToggled(new Set(initialKeys ?? options.filter((o) => o.selected).map((o) => o.key)));
    setCustomActive(initialKeys?.includes("_custom") ?? false);
    setCustomText(initialCustomText ?? "");
  }, [options, initialKeys, initialCustomText]);

  const handleToggle = (key: string) => {
    if (!isActive) return;

    if (isMultiSelect) {
      setToggled((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (customActive) { setCustomActive(false); setCustomText(""); }
    } else {
      // Single-select in non-paginated mode: send immediately
      if (!isPaginated) {
        const opt = options.find((o) => o.key === key);
        onOptionClick?.(opt?.label ?? key);
        return;
      }
      // Single-select in paginated mode: save locally
      setToggled(new Set([key]));
      if (customActive) { setCustomActive(false); setCustomText(""); }
    }
  };

  const handleCustomClick = () => {
    if (!isActive) return;
    if (customActive) {
      // Deselect custom
      setCustomActive(false);
      setCustomText("");
    } else {
      setCustomActive(true);
      if (!isMultiSelect) setToggled(new Set());
      setTimeout(() => customInputRef.current?.focus(), 0);
    }
  };

  const handleConfirm = () => {
    if (isPaginated) {
      onSubmit?.();
      return;
    }
    // Non-paginated multi-select or custom
    if (customActive && customText.trim()) {
      onOptionClick?.(customText.trim());
    } else if (toggled.size > 0) {
      onOptionClick?.([...toggled].join(", "));
    }
  };

  const handleSkip = () => {
    if (isPaginated) {
      onSkip?.();
    } else {
      onOptionClick?.("_skipped");
    }
  };

  const hasSelection = toggled.size > 0 || (customActive && customText.trim().length > 0);
  const showFooter = isActive && (isMultiSelect || isPaginated || skippable || (customActive && customText.trim()));
  const totalOptions = options.length + (allowCustom ? 1 : 0);

  return (
    <div style={isPaginated ? {} : {
      marginTop: 14,
      background: COLORS.surface,
      border: `1px solid ${COLORS.border}`,
      borderRadius: RADIUS.lg,
      overflow: "hidden",
    }}>
      {options.map((opt, idx) => {
        const isOn = toggled.has(opt.key);
        const isLastOption = !allowCustom && idx === options.length - 1 && !showFooter;
        return (
          <button
            key={opt.key}
            className={isActive ? "btn" : undefined}
            onClick={() => handleToggle(opt.key)}
            disabled={!isActive}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              padding: "14px 16px",
              background: isOn ? COLORS.accentDim : "transparent",
              border: "none",
              borderBottom: isLastOption ? "none" : `1px solid ${COLORS.border}`,
              color: COLORS.text,
              fontSize: TYPE.scale.base,
              fontFamily: TYPE.body,
              fontWeight: TYPE.weight.medium,
              cursor: isActive ? "pointer" : "default",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
              textAlign: "left",
            }}
            onMouseEnter={(e) => { if (isActive) e.currentTarget.style.background = isOn ? COLORS.accentDim : COLORS.surfaceHover; }}
            onMouseLeave={(e) => { if (isActive) e.currentTarget.style.background = isOn ? COLORS.accentDim : "transparent"; }}
          >
            <span style={{
              width: 18, height: 18,
              borderRadius: isMultiSelect ? 4 : "50%",
              border: isOn ? "none" : `2px solid ${COLORS.textDim}`,
              background: isOn ? COLORS.accent : "transparent",
              color: COLORS.white, fontSize: 11,
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
            }}>
              {isOn ? "✓" : ""}
            </span>
            <span style={{ flex: 1, minWidth: 0, lineHeight: TYPE.leading.snug }} title={opt.description ?? undefined}>
              {opt.label}
            </span>
          </button>
        );
      })}

      {/* "Something else" row with inline text input */}
      {allowCustom && isActive && (
        <div
          key="_custom"
          className="btn"
          onClick={!customActive ? handleCustomClick : undefined}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            width: "100%",
            padding: "14px 16px",
            background: customActive ? COLORS.accentDim : "transparent",
            borderBottom: showFooter ? `1px solid ${COLORS.border}` : "none",
            cursor: customActive ? "default" : "pointer",
            transition: `all ${MOTION.duration} ${MOTION.ease}`,
          }}
          onMouseEnter={(e) => { if (!customActive) e.currentTarget.style.background = COLORS.surfaceHover; }}
          onMouseLeave={(e) => { if (!customActive) e.currentTarget.style.background = customActive ? COLORS.accentDim : "transparent"; }}
        >
          <span style={{
            width: 18, height: 18,
            borderRadius: isMultiSelect ? 4 : "50%",
            border: customActive ? "none" : `2px solid ${COLORS.textDim}`,
            background: customActive ? COLORS.accent : "transparent",
            color: COLORS.white, fontSize: 11,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
            transition: `all ${MOTION.duration} ${MOTION.ease}`,
          }}>
            {customActive ? "✓" : ""}
          </span>
          {customActive ? (
            <input
              ref={customInputRef}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customText.trim()) handleConfirm();
              }}
              placeholder="Something else..."
              style={{
                flex: 1, minWidth: 0,
                background: "transparent", border: "none", outline: "none",
                color: COLORS.text, fontSize: TYPE.scale.base,
                fontFamily: TYPE.body, fontWeight: TYPE.weight.medium,
                lineHeight: TYPE.leading.snug,
              }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, lineHeight: TYPE.leading.snug, color: COLORS.textDim }}>
              Something else...
            </span>
          )}
        </div>
      )}

      {/* Footer: Skip / Confirm|Next|Submit */}
      {showFooter && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: skippable ? "space-between" : "flex-end",
            padding: "10px 16px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          {skippable && (
            <button
              className="btn"
              onClick={handleSkip}
              style={{
                padding: "7px 12px",
                borderRadius: RADIUS.md,
                border: "none",
                background: "transparent",
                color: COLORS.textDim,
                fontSize: TYPE.scale.sm,
                fontWeight: TYPE.weight.medium,
                fontFamily: TYPE.body,
                cursor: "pointer",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = COLORS.text; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = COLORS.textDim; }}
            >
              Skip
            </button>
          )}
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={!hasSelection}
            style={{
              padding: "7px 18px",
              borderRadius: RADIUS.md,
              border: "none",
              background: hasSelection ? COLORS.accent : COLORS.border,
              color: hasSelection ? COLORS.white : COLORS.textDim,
              fontSize: TYPE.scale.sm,
              fontWeight: TYPE.weight.medium,
              fontFamily: TYPE.body,
              cursor: hasSelection ? "pointer" : "default",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
            }}
            onMouseEnter={(e) => { if (hasSelection) e.currentTarget.style.background = COLORS.accentBright; }}
            onMouseLeave={(e) => { if (hasSelection) e.currentTarget.style.background = COLORS.accent; }}
          >
            {isPaginated
              ? (isLast ? "Submit" : "Next")
              : `Confirm${toggled.size > 0 ? ` (${toggled.size})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
