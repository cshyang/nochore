import { useChat } from "@ai-sdk/react";
import { ArrowLeft, ArrowRight, CaretRight, Info, Lightning, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";
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
  return p.type === "tool-request_input" || (p.type === "dynamic-tool" && p.toolName === "request_input");
}

/** Extract the tool name from any tool part (static `tool-{name}` or dynamic) */
function getPartToolName(p: Record<string, unknown>): string | null {
  if (p.type === "dynamic-tool") return p.toolName as string;
  if (typeof p.type === "string" && String(p.type).startsWith("tool-")) return String(p.type).slice(5); // "tool-search_tools" → "search_tools"
  return null;
}

/** Human-friendly labels for server-executed tools */
const TOOL_LABELS: Record<string, { verb: string; done: string; icon: "search" | "bolt" }> = {
  search_tools: { verb: "Searching for tools", done: "Found tools", icon: "search" },
  create_agent: { verb: "Creating your agent", done: "Agent created", icon: "bolt" },
};

const EXAMPLE_PROMPTS = ["Monitor ad spend", "Score new leads", "Track competitors", "Optimize keywords"];

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

  const { messages, sendMessage, addToolOutput, status } = useChat({
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
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ message: msg }) => {
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>;
        const isTool = p.type === "dynamic-tool" || (typeof p.type === "string" && String(p.type).startsWith("tool-"));
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

  // Auto-scroll: bring the latest assistant response to the top of the visible area.
  // Re-runs whenever a new message appears (not during streaming of existing messages).
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const messageCount = messages.length;

  useEffect(() => {
    if (!hasSubmitted) return;
    const timer = setTimeout(() => {
      const container = scrollRef.current;
      const target = latestAssistantRef.current;
      if (container && target) {
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
  }, [hasSubmitted, messageCount]);

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
  }, []);

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

  const handleExampleClick = useCallback((prompt: string) => {
    setInputValue(prompt);
    // Focus the input so the user can review/edit before submitting
    inputRef.current?.focus();
  }, []);

  // Use a ref to access messages without adding it as a dependency
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const handleOptionClick = useCallback(
    (value: string) => {
      if (isLoading || redirecting) return;
      if (!hasSubmitted) setHasSubmitted(true);
      setInputValue("");

      // Find pending request_input tool call(s) in the last assistant message
      const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
      const pendingToolParts = lastAssistant?.parts.filter((p) => {
        const r = p as Record<string, unknown>;
        return isRequestInputPart(r) && r.state === "input-available";
      }) as Array<Record<string, unknown>> | undefined;

      if (pendingToolParts && pendingToolParts.length > 0) {
        // Set output on all pending request_input tool calls
        // For batched (paginated) cards, value is newline-separated answers
        const answers = value.split("\n");
        for (let i = 0; i < pendingToolParts.length; i++) {
          const toolCallId = pendingToolParts[i].toolCallId as string;
          const answer = answers[i] ?? "_skipped";
          addToolOutput({
            tool: "request_input" as never, // dynamic tool — cast for type safety
            toolCallId,
            output: {
              selectedKeys: answer === "_skipped" ? [] : answer.split(", "),
              skipped: answer === "_skipped",
            } as never,
          });
        }
      } else {
        // No pending tool call — send as regular text (initial briefing, freeform input)
        void sendMessage({ text: value });
      }
    },
    [isLoading, redirecting, hasSubmitted, sendMessage, addToolOutput],
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
          type="button"
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
              <span style={{ color: COLORS.accent }}>✦</span> What should this agent do?
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
                      background: inputValue.trim() ? COLORS.accent : "transparent",
                      color: inputValue.trim() ? COLORS.white : COLORS.textDim,
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
                  type="button"
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
                  <span style={{ color: COLORS.accent }}>✦</span> Setting up your agent
                </h2>
              </div>

              {/* Messages */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {conversationMessages.map((msg, idx) => {
                  // Only the last assistant message's options are interactive
                  const isLastAssistant =
                    msg.role === "assistant" &&
                    !conversationMessages.slice(idx + 1).some((m) => m.role === "assistant");

                  return (
                    <div key={msg.id} ref={isLastAssistant ? latestAssistantRef : undefined}>
                      <ConversationMessage
                        message={msg}
                        onOptionClick={isLastAssistant ? handleOptionClick : undefined}
                      />
                    </div>
                  );
                })}

                {/* Loading heartbeat — visible while any response is in progress */}
                {isLoading && !redirecting && (
                  <div style={{ padding: "10px 0", animation: "fadeIn 0.2s ease both" }}>
                    <span
                      style={{
                        display: "block",
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: COLORS.accent,
                        animation: "heartbeat 1.2s ease-in-out infinite",
                      }}
                    />
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
                        background: inputValue.trim() ? COLORS.accent : "transparent",
                        color: inputValue.trim() ? COLORS.white : COLORS.textDim,
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
// ReasoningBlock — inline collapsible thinking (Claude-style)
// Streaming: pulsing dot + live text. Done: collapsed "Thought for a moment" toggle.
// ---------------------------------------------------------------------------

function ReasoningBlock({ text, state }: { text: string; state: string }) {
  const [expanded, setExpanded] = useState(state === "streaming");
  const scrollRef = useRef<HTMLDivElement>(null);
  const isStreaming = state === "streaming";

  // Auto-expand when streaming, auto-collapse when done
  useEffect(() => {
    setExpanded(isStreaming);
  }, [isStreaming]);

  // Auto-scroll while streaming — `text` in deps is intentional (triggers scroll on each chunk)
  // biome-ignore lint/correctness/useExhaustiveDependencies: text change drives scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (el && isStreaming) el.scrollTop = el.scrollHeight;
  }, [text, isStreaming]);

  return (
    <div
      style={{
        borderLeft: `2px solid ${isStreaming ? COLORS.accent : COLORS.border}`,
        borderRadius: `0 ${RADIUS.md}px ${RADIUS.md}px 0`,
        background: COLORS.surface,
        padding: expanded ? "10px 14px" : "0 14px",
        marginBottom: 8,
        transition: `all ${MOTION.duration} ${MOTION.ease}`,
        animation: "fadeIn 0.2s ease both",
      }}
    >
      {/* Header — clickable toggle */}
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          width: "100%",
          textAlign: "left",
        }}
      >
        {isStreaming ? (
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
        ) : (
          <CaretRight
            size={12}
            weight="bold"
            style={{
              color: COLORS.textDim,
              flexShrink: 0,
              transform: expanded ? "rotate(90deg)" : "rotate(0deg)",
              transition: `transform ${MOTION.duration} ${MOTION.ease}`,
            }}
          />
        )}
        <span
          className={isStreaming ? "thinking-shimmer" : undefined}
          style={{
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            fontWeight: TYPE.weight.medium,
            letterSpacing: TYPE.tracking.wide,
            textTransform: "uppercase" as const,
            color: isStreaming ? undefined : COLORS.textDim,
          }}
        >
          {isStreaming ? "Thinking" : "Thought for a moment"}
        </span>
      </button>
      {/* Reasoning text — collapsible */}
      {expanded && text && (
        <div
          ref={scrollRef}
          style={{
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            color: COLORS.textDim,
            lineHeight: TYPE.leading.loose,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            paddingBottom: 6,
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolActivityRow — compact status row for server-executed tools
// ---------------------------------------------------------------------------

function ToolActivityRow({ toolName, state, output }: { toolName: string; state: string; output: unknown }) {
  const label = TOOL_LABELS[toolName];
  if (!label) return null; // unknown tool — skip

  const isDone = state === "output-available";
  const isError = state === "output-error";
  const isWorking = !isDone && !isError;

  // Summarize search_tools output
  let summary = label.done;
  if (isDone && toolName === "search_tools" && Array.isArray(output)) {
    summary = `Found ${output.length} tool${output.length === 1 ? "" : "s"}`;
  }

  const Icon = label.icon === "search" ? MagnifyingGlass : Lightning;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 0",
        fontSize: TYPE.scale.sm,
        fontFamily: TYPE.body,
        color: COLORS.textDim,
        animation: "fadeIn 0.2s ease both",
      }}
    >
      <Icon
        size={14}
        weight="bold"
        style={{
          color: isError ? COLORS.red : COLORS.accent,
          flexShrink: 0,
          ...(isWorking ? { animation: "pulse 1.5s ease-in-out infinite" } : {}),
        }}
      />
      <span>{isWorking ? `${label.verb}...` : isError ? `${label.verb} failed` : summary}</span>
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
  let match: RegExpExecArray | null = OPTION_RE.exec(text);

  while (match !== null) {
    // Strip markdown bold markers from option labels
    const label = match[2].replace(/\*\*(.+?)\*\*/g, "$1");
    options.push({ key: match[1], label });
    match = OPTION_RE.exec(text);
  }
  OPTION_RE.lastIndex = 0;

  // Require 2+ matches to avoid false positives
  if (options.length < 2) {
    return { body: text, options: [], isMultiSelect: false };
  }

  const body = text
    .replace(OPTION_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
}: {
  message: { role: string; parts: Array<Record<string, unknown>> };
  onOptionClick?: (value: string) => void;
}) {
  const isUser = message.role === "user";
  const parts = message.parts;

  // ── User messages — right-aligned chip ──────────────────────────────
  if (isUser) {
    const textContent = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text as string)
      .join("");
    if (!textContent.trim()) return null;
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

  // ── Assistant messages — render parts in order ──────────────────────
  const isActive = !!onOptionClick;
  const isPast = !isActive;

  // Collect request_input tool parts for option rendering — only when fully generated
  const requestInputParts = parts.filter(
    (p) => isRequestInputPart(p) && (p.state === "input-available" || p.state === "output-available"),
  );
  const requestInputs: RequestInputToolInput[] = requestInputParts
    .map((p) => p.input as RequestInputToolInput | undefined)
    .filter((input): input is RequestInputToolInput => !!input);

  // For past messages with request_input tools, show each answer as a collapsed artifact
  if (isPast && requestInputParts.length > 0) {
    const nonRequestParts = parts.filter((p) => !isRequestInputPart(p));
    return (
      <div>
        {nonRequestParts.map((p, i) => renderPart(p, i))}
        {requestInputParts.map((part) => {
          const input = (part as Record<string, unknown>).input as RequestInputToolInput | undefined;
          const output = (part as Record<string, unknown>).output as
            | { selectedKeys?: string[]; skipped?: boolean }
            | undefined;
          const question = input?.question ?? "";
          const selectedKeys = output?.selectedKeys ?? [];
          const answer = output?.skipped
            ? "Skipped"
            : resolveSelectedLabel(selectedKeys.join(", "), input?.options ?? []);
          return (
            <div
              key={`past-${(part as Record<string, unknown>).toolCallId}`}
              style={{
                marginTop: 8,
                fontSize: TYPE.scale.sm,
                color: COLORS.textDim,
                fontFamily: TYPE.body,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span style={{ color: COLORS.accent }}>☑</span>
              {question} → <span style={{ color: COLORS.text }}>{answer}</span>
            </div>
          );
        })}
      </div>
    );
  }

  // Active message (or message with no request_input tools): render all parts in order,
  // then append option cards at the end
  const renderedParts: React.ReactNode[] = [];
  // Accumulate consecutive text parts into a single markdown block
  let textBuf = "";
  let lastTextState: string | undefined;

  const flushText = () => {
    if (!textBuf.trim()) {
      textBuf = "";
      return;
    }
    const isStreaming = lastTextState === "streaming";
    renderedParts.push(
      <div
        key={`text-${renderedParts.length}`}
        className="prose"
        style={{
          fontSize: TYPE.scale.md,
          lineHeight: TYPE.leading.loose,
          color: COLORS.textSecondary,
          fontFamily: TYPE.body,
        }}
      >
        <Markdown>{textBuf.trim()}</Markdown>
        {isStreaming && (
          <span
            style={{
              display: "inline-block",
              width: 2,
              height: "1.1em",
              background: COLORS.accent,
              marginLeft: 1,
              verticalAlign: "text-bottom",
              animation: "blink 1s step-end infinite",
            }}
          />
        )}
      </div>,
    );
    textBuf = "";
    lastTextState = undefined;
  };

  for (const part of parts) {
    if (part.type === "text") {
      textBuf += part.text as string;
      lastTextState = part.state as string | undefined;
      continue;
    }
    // Flush accumulated text before non-text parts
    flushText();

    if (part.type === "reasoning") {
      renderedParts.push(renderPart(part, renderedParts.length));
    } else if (part.type === "step-start") {
      renderedParts.push(renderPart(part, renderedParts.length));
    } else if (isRequestInputPart(part) && part.state === "output-available") {
      // Answered tool call — render inline as collapsed artifact
      const input = part.input as RequestInputToolInput | undefined;
      const output = part.output as { selectedKeys?: string[]; skipped?: boolean } | undefined;
      const question = input?.question ?? "";
      const selectedKeys = output?.selectedKeys ?? [];
      const answer = output?.skipped
        ? "Skipped"
        : resolveSelectedLabel(selectedKeys.join(", "), input?.options ?? []);
      renderedParts.push(
        <div
          key={`answered-${part.toolCallId}`}
          style={{
            marginTop: 8,
            fontSize: TYPE.scale.sm,
            color: COLORS.textDim,
            fontFamily: TYPE.body,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span style={{ color: COLORS.accent }}>☑</span>
          {question} → <span style={{ color: COLORS.text }}>{answer}</span>
        </div>,
      );
    } else if (isRequestInputPart(part)) {
      // Pending tool call — skip, rendered below as active card(s)
    } else {
      // Tool activity (search_tools, create_agent, etc.)
      const toolName = getPartToolName(part);
      if (toolName && TOOL_LABELS[toolName]) {
        renderedParts.push(renderPart(part, renderedParts.length));
      }
    }
  }
  flushText(); // flush any trailing text

  // If nothing rendered and no option cards, bail
  if (renderedParts.length === 0 && requestInputParts.length === 0) return null;

  // Render pending request_input parts as active card(s)
  // (answered parts were already rendered inline in the parts loop above)
  const pendingParts = requestInputParts.filter((p) => p.state === "input-available");
  const pendingInputs: RequestInputToolInput[] = pendingParts
    .map((p) => p.input as RequestInputToolInput | undefined)
    .filter((input): input is RequestInputToolInput => !!input);
  if (isActive && pendingInputs.length > 1) {
    renderedParts.push(<PaginatedCard key="paginated" steps={pendingInputs} onComplete={onOptionClick} />);
  } else if (pendingParts.length > 0) {
    const singleInput = pendingInputs[0];
    const textContent = parts
      .filter((p) => p.type === "text")
      .map((p) => p.text as string)
      .join("");
    const toolOptions = singleInput?.options ?? [];
    const { options: regexOptions, isMultiSelect: regexMulti } =
      toolOptions.length > 0
        ? { options: [] as Array<{ key: string; label: string }>, isMultiSelect: false }
        : parseOptions(textContent);
    const finalOptions = toolOptions.length > 0 ? toolOptions : regexOptions;
    const finalMultiSelect = toolOptions.length > 0 ? (singleInput?.multiSelect ?? false) : regexMulti;

    const question = singleInput?.question;
    if (question && !textContent.includes(question)) {
      renderedParts.push(
        <div
          key="tool-question"
          className="prose"
          style={{
            fontSize: TYPE.scale.md,
            lineHeight: TYPE.leading.loose,
            color: COLORS.textSecondary,
            fontFamily: TYPE.body,
          }}
        >
          <Markdown>{question}</Markdown>
        </div>,
      );
    }

    if (finalOptions.length > 0) {
      renderedParts.push(
        <OptionCards
          key="options"
          options={finalOptions}
          isMultiSelect={finalMultiSelect}
          allowCustom={singleInput?.allowCustom}
          skippable={singleInput?.skippable}
          onOptionClick={onOptionClick}
        />,
      );
    }
  }

  return <div>{renderedParts}</div>;
}

/** Render a single non-text, non-request_input part */
function renderPart(part: Record<string, unknown>, idx: number): React.ReactNode {
  if (part.type === "reasoning") {
    const text = (part.text as string) ?? (part.reasoning as string) ?? "";
    const state = (part.state as string) ?? "done";
    if (!text) return null;
    return <ReasoningBlock key={`reasoning-${idx}`} text={text} state={state} />;
  }

  if (part.type === "step-start") {
    return (
      <div
        key={`step-${idx}`}
        style={{
          height: 1,
          background: COLORS.border,
          margin: "8px 0",
          opacity: 0.5,
        }}
      />
    );
  }

  if (part.type === "text") {
    // Standalone text render (used in past collapsed messages)
    const text = part.text as string;
    if (!text?.trim()) return null;
    return (
      <div
        key={`text-${idx}`}
        className="prose"
        style={{
          fontSize: TYPE.scale.md,
          lineHeight: TYPE.leading.loose,
          color: COLORS.textSecondary,
          fontFamily: TYPE.body,
        }}
      >
        <Markdown>{text}</Markdown>
      </div>
    );
  }

  // Tool activity row
  const toolName = getPartToolName(part);
  if (toolName && TOOL_LABELS[toolName]) {
    return (
      <ToolActivityRow key={`tool-${idx}`} toolName={toolName} state={part.state as string} output={part.output} />
    );
  }

  return null;
}

/** Resolve a selectedKey back to a human-readable label */
function resolveSelectedLabel(selected: string, options: Array<{ key: string; label: string }>): string {
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
  const [answers, setAnswers] = useState<Map<number, { keys: string[]; customText?: string; skipped?: boolean }>>(
    new Map(),
  );

  const step = steps[currentStep];
  const isLast = currentStep === steps.length - 1;
  const currentAnswer = answers.get(currentStep);
  const _hasAnswer =
    currentAnswer && (currentAnswer.keys.length > 0 || currentAnswer.customText || currentAnswer.skipped);

  const handleStepAnswer = useCallback(
    (keys: string[], customText?: string) => {
      setAnswers((prev) => {
        // Avoid re-render if values haven't changed (breaks potential effect loops)
        const existing = prev.get(currentStep);
        const sameKeys = existing?.keys.join(",") === keys.join(",");
        const sameCustom = (existing?.customText ?? undefined) === (customText ?? undefined);
        if (sameKeys && sameCustom) return prev;
        const next = new Map(prev);
        next.set(currentStep, { keys, customText });
        return next;
      });
    },
    [currentStep],
  );

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
      <div
        style={{
          padding: "14px 16px 10px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        <span
          style={{
            fontSize: TYPE.scale.base,
            fontFamily: TYPE.body,
            fontWeight: TYPE.weight.medium,
            color: COLORS.text,
            lineHeight: TYPE.leading.snug,
          }}
        >
          {step.question}
        </span>
        <span
          style={{
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            color: COLORS.textDim,
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
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
// InfoTooltip — "i" icon with hover tooltip for option descriptions
// ---------------------------------------------------------------------------

function InfoTooltip({ text }: { text: string }) {
  const [show, setShow] = useState(false);

  return (
    <span
      role="tooltip"
      style={{ position: "relative", display: "inline-flex", alignItems: "center", flexShrink: 0 }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onFocus={() => setShow(true)}
      onBlur={() => setShow(false)}
    >
      <Info
        size={16}
        weight="regular"
        style={{
          color: COLORS.textDim,
          cursor: "help",
          transition: `color ${MOTION.duration} ${MOTION.ease}`,
          ...(show ? { color: COLORS.textSecondary } : {}),
        }}
      />
      {show && (
        <span
          style={{
            position: "absolute",
            bottom: "calc(100% + 8px)",
            right: 0,
            background: COLORS.surfaceHover,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "8px 12px",
            fontSize: TYPE.scale.xs,
            fontFamily: TYPE.body,
            fontWeight: TYPE.weight.regular,
            color: COLORS.textSecondary,
            lineHeight: TYPE.leading.normal,
            whiteSpace: "normal",
            width: 240,
            zIndex: 10,
            pointerEvents: "none",
            animation: "fadeIn 0.15s ease both",
          }}
        >
          {text}
        </span>
      )}
    </span>
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

  // Stable key derived from option keys — only changes on step navigation, not on
  // every parent re-render. Using initialKeys (an array ref) as a dep would cause an
  // infinite loop: sync effect → parent re-render → new initialKeys ref → reset → sync → …
  const optionsKey = options.map((o) => o.key).join(",");
  useEffect(() => {
    setToggled(new Set(initialKeys ?? options.filter((o) => o.selected).map((o) => o.key)));
    setCustomActive(initialKeys?.includes("_custom") ?? false);
    setCustomText(initialCustomText ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [optionsKey]);

  const handleToggle = (key: string) => {
    if (!isActive) return;

    if (isMultiSelect) {
      setToggled((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      if (customActive) {
        setCustomActive(false);
        setCustomText("");
      }
    } else {
      // Single-select in non-paginated mode: send immediately
      if (!isPaginated) {
        const opt = options.find((o) => o.key === key);
        onOptionClick?.(opt?.label ?? key);
        return;
      }
      // Single-select in paginated mode: save locally
      setToggled(new Set([key]));
      if (customActive) {
        setCustomActive(false);
        setCustomText("");
      }
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
  const _totalOptions = options.length + (allowCustom ? 1 : 0);

  return (
    <div
      style={
        isPaginated
          ? {}
          : {
              marginTop: 14,
              background: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              overflow: "hidden",
            }
      }
    >
      {options.map((opt, idx) => {
        const isOn = toggled.has(opt.key);
        const isLastOption = !allowCustom && idx === options.length - 1 && !showFooter;
        return (
          <button
            type="button"
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
              borderLeft: `3px solid ${isOn ? COLORS.accent : "transparent"}`,
              borderBottom: isLastOption ? "none" : `1px solid ${COLORS.border}`,
              color: COLORS.text,
              fontSize: TYPE.scale.base,
              fontFamily: TYPE.body,
              fontWeight: TYPE.weight.medium,
              cursor: isActive ? "pointer" : "default",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (!isActive) return;
              e.currentTarget.style.background = isOn ? COLORS.accentDim : COLORS.surfaceHover;
              if (!isOn) e.currentTarget.style.borderLeftColor = COLORS.accent;
              const indicator = e.currentTarget.querySelector("[data-indicator]") as HTMLElement | null;
              if (indicator && !isOn) {
                indicator.style.borderColor = COLORS.accent;
                indicator.style.background = COLORS.accent;
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) return;
              e.currentTarget.style.background = isOn ? COLORS.accentDim : "transparent";
              if (!isOn) e.currentTarget.style.borderLeftColor = "transparent";
              const indicator = e.currentTarget.querySelector("[data-indicator]") as HTMLElement | null;
              if (indicator && !isOn) {
                indicator.style.borderColor = COLORS.textDim;
                indicator.style.background = "transparent";
              }
            }}
          >
            <span
              data-indicator
              style={{
                width: 18,
                height: 18,
                borderRadius: isMultiSelect ? 4 : "50%",
                border: isOn ? "none" : `2px solid ${COLORS.textDim}`,
                background: isOn ? COLORS.accent : "transparent",
                color: COLORS.white,
                fontSize: 11,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: `all ${MOTION.duration} ${MOTION.ease}`,
              }}
            >
              {isOn ? "✓" : ""}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                lineHeight: TYPE.leading.snug,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              {opt.label}
              {opt.description && <InfoTooltip text={opt.description} />}
            </span>
          </button>
        );
      })}

      {/* "Something else" row with inline text input */}
      {allowCustom && isActive && (
        <button
          type="button"
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
            border: "none",
            borderBottom: showFooter ? `1px solid ${COLORS.border}` : "none",
            cursor: customActive ? "default" : "pointer",
            transition: `all ${MOTION.duration} ${MOTION.ease}`,
            textAlign: "left",
          }}
          onMouseEnter={(e) => {
            if (!customActive) e.currentTarget.style.background = COLORS.surfaceHover;
          }}
          onMouseLeave={(e) => {
            if (!customActive) e.currentTarget.style.background = "transparent";
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: `2px solid ${customActive ? COLORS.accent : COLORS.borderStrong}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          />
          {customActive ? (
            <input
              ref={customInputRef}
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && customText.trim()) handleConfirm();
              }}
              placeholder="E.g., Generate a daily report..."
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                outline: "none",
                color: COLORS.text,
                fontSize: TYPE.scale.base,
                fontFamily: TYPE.body,
                padding: 0,
              }}
            />
          ) : (
            <span style={{ flex: 1, minWidth: 0, lineHeight: TYPE.leading.snug, color: COLORS.textSecondary }}>
              Something else...
            </span>
          )}
        </button>
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
              type="button"
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
              onMouseEnter={(e) => {
                e.currentTarget.style.color = COLORS.text;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = COLORS.textDim;
              }}
            >
              Skip
            </button>
          )}
          <button
            type="button"
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
            onMouseEnter={(e) => {
              if (hasSelection) e.currentTarget.style.background = COLORS.accentBright;
            }}
            onMouseLeave={(e) => {
              if (hasSelection) e.currentTarget.style.background = COLORS.accent;
            }}
          >
            {isPaginated ? (isLast ? "Submit" : "Next") : `Confirm${toggled.size > 0 ? ` (${toggled.size})` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
