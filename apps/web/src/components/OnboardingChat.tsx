import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useNavigate } from "@tanstack/react-router";
import Markdown from "react-markdown";
import {
  CircleNotch,
  Sparkle,
  ArrowLeft,
  ArrowRight,
} from "@phosphor-icons/react";
import { COLORS, RADIUS, TYPE, MOTION } from "~/lib/colors";
import type { ComposioToolMeta } from "~/server/connections";

interface OnboardingChatProps {
  projectId: string;
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  toolCatalog: ComposioToolMeta[];
  onBack: () => void;
}

/** Check if a message part is a request_input tool call (static or dynamic) */
function isRequestInputPart(p: Record<string, unknown>): boolean {
  return p.type === "tool-request_input" ||
    (p.type === "dynamic-tool" && p.toolName === "request_input");
}

/** Check if a message part is a suggest_tools tool call (static or dynamic) */
function isSuggestToolsPart(p: Record<string, unknown>): boolean {
  return p.type === "tool-suggest_tools" ||
    (p.type === "dynamic-tool" && p.toolName === "suggest_tools");
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
  toolCatalog,
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
      body: { projectId, availableSkills, existingConnections, toolCatalog },
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

      // Send selection as text — the LLM interprets the response in context
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
                    // Fallback: check next user message text (regex path)
                    if (!selected) {
                      const nextUser = conversationMessages.slice(idx + 1).find((m) => m.role === "user");
                      if (nextUser) {
                        const userText = nextUser.parts
                          .filter((p): p is { type: "text"; text: string } => p.type === "text")
                          .map((p) => p.text)
                          .join("")
                          .trim()
                          .toUpperCase();
                        if (/^[A-Z](,\s*[A-Z])*$/.test(userText)) {
                          selected = userText;
                        }
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

  // Check for tool parts before deciding to return null
  const hasToolPart = (message.parts as unknown as Array<Record<string, unknown>>).some(
    (p) => isRequestInputPart(p as Record<string, unknown>) || isSuggestToolsPart(p as Record<string, unknown>),
  );

  if (!textContent.trim() && !hasToolPart) return null;

  // User messages — right-aligned, subtle surface chip
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

  // Check for suggest_tools tool call
  const suggestToolsPart = (message.parts as unknown as Array<Record<string, unknown>>).find((p) =>
    isSuggestToolsPart(p as Record<string, unknown>),
  );

  if (suggestToolsPart) {
    const toolInput = suggestToolsPart.input as {
      message: string;
      tools: Array<{ slug: string; name: string; reason: string; recommended: boolean }>;
    } | undefined;

    // Resolve selected slugs from tool output (for past messages)
    let resolvedSlugs: string[] | undefined;
    if (suggestToolsPart.state === "output-available") {
      const output = suggestToolsPart.output as { selectedSlugs?: string[] } | undefined;
      resolvedSlugs = output?.selectedSlugs;
    }

    return (
      <div>
        {(toolInput?.message ?? textContent) && (
          <div
            className="prose"
            style={{
              fontSize: TYPE.scale.md,
              lineHeight: TYPE.leading.loose,
              color: COLORS.textSecondary,
              fontFamily: TYPE.body,
            }}
          >
            <Markdown>{toolInput?.message ?? textContent}</Markdown>
          </div>
        )}
        {toolInput?.tools && toolInput.tools.length > 0 && (
          <ToolSuggestionCards
            tools={toolInput.tools}
            onConfirm={onOptionClick}
            resolvedSlugs={resolvedSlugs}
          />
        )}
      </div>
    );
  }

  // Check for request_input tool call in message parts
  // Tool parts have type "tool-request_input" (static) or "dynamic-tool" (dynamic)
  // Use a simple check: any part with toolName === "request_input"
  const requestInputPart = (message.parts as unknown as Array<Record<string, unknown>>).find((p) =>
    isRequestInputPart(p as Record<string, unknown>),
  );

  const toolInput = requestInputPart?.input as {
    question: string;
    options: Array<{ key: string; label: string }>;
    multiSelect: boolean;
  } | undefined;

  // Resolve selected keys from tool output (for past messages)
  let resolvedSelectedKey = selectedKey;
  if (!resolvedSelectedKey && requestInputPart?.state === "output-available") {
    const output = requestInputPart.output as { selectedKeys?: string[] } | undefined;
    if (output?.selectedKeys) {
      resolvedSelectedKey = output.selectedKeys.join(", ");
    }
  }

  // Use tool-based options if available, fall back to regex
  const toolOptions = toolInput?.options ?? [];
  const { body: regexBody, options: regexOptions, isMultiSelect: regexMulti } =
    toolOptions.length > 0
      ? { body: textContent, options: [] as Array<{ key: string; label: string }>, isMultiSelect: false }
      : parseOptions(textContent);

  const finalBody = toolOptions.length > 0 ? (toolInput?.question ?? textContent) : regexBody;
  // Normalize keys: if LLM used slugs ("shopify") instead of letters ("A"), assign letter keys
  const normalizedToolOptions = toolOptions.length > 0
    ? toolOptions.map((opt, i) => ({
        key: opt.key.length === 1 ? opt.key.toUpperCase() : String.fromCharCode(65 + i), // A, B, C...
        label: opt.label,
        originalKey: opt.key, // preserve for tool output
      }))
    : [];
  const finalOptions = normalizedToolOptions.length > 0 ? normalizedToolOptions : regexOptions;
  const finalMultiSelect = toolOptions.length > 0 ? (toolInput?.multiSelect ?? false) : regexMulti;

  return (
    <div>
      {finalBody && (
        <div
          className="prose"
          style={{
            fontSize: TYPE.scale.md,
            lineHeight: TYPE.leading.loose,
            color: COLORS.textSecondary,
            fontFamily: TYPE.body,
          }}
        >
          <Markdown>{finalBody}</Markdown>
        </div>
      )}
      {finalOptions.length > 0 && (
        <OptionCards
          options={finalOptions}
          isMultiSelect={finalMultiSelect}
          onOptionClick={onOptionClick}
          selectedKey={resolvedSelectedKey}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolSuggestionCards — pre-selected tool recommendations with reasons
// ---------------------------------------------------------------------------

function ToolSuggestionCards({
  tools,
  onConfirm,
  resolvedSlugs,
}: {
  tools: Array<{ slug: string; name: string; reason: string; recommended: boolean }>;
  onConfirm?: (value: string) => void;
  resolvedSlugs?: string[];
}) {
  // Initialize toggled set from recommended tools
  const [toggled, setToggled] = useState<Set<string>>(
    () => new Set(tools.filter((t) => t.recommended).map((t) => t.slug)),
  );
  const isActive = !!onConfirm && !resolvedSlugs;

  // For past messages, show what was selected
  const displaySlugs = resolvedSlugs ? new Set(resolvedSlugs) : toggled;

  const handleToggle = (slug: string) => {
    if (!isActive) return;
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const handleConfirm = () => {
    if (toggled.size === 0) return;
    // Send selected slugs as comma-separated string for the tool output
    onConfirm?.([...toggled].join(", "));
  };

  return (
    <div
      style={{
        marginTop: 14,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        pointerEvents: isActive ? "auto" : "none",
        transition: `opacity ${MOTION.duration} ${MOTION.ease}`,
      }}
    >
      {tools.map((tool, idx) => {
        const isOn = displaySlugs.has(tool.slug);
        const isDimmed = !isActive && !isOn && (resolvedSlugs?.length ?? 0) > 0;
        return (
          <button
            key={tool.slug}
            className={isActive ? "btn" : undefined}
            onClick={() => handleToggle(tool.slug)}
            disabled={!isActive}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              width: "100%",
              padding: "14px 16px",
              background: isOn ? COLORS.accentDim : "transparent",
              border: "none",
              borderBottom: idx < tools.length - 1 ? `1px solid ${COLORS.border}` : "none",
              color: isDimmed ? COLORS.textDim : COLORS.text,
              fontSize: TYPE.scale.base,
              fontFamily: TYPE.body,
              cursor: isActive ? "pointer" : "default",
              opacity: isDimmed ? 0.4 : 1,
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (isActive) e.currentTarget.style.background = isOn ? COLORS.accentDim : COLORS.surfaceHover;
            }}
            onMouseLeave={(e) => {
              if (isActive) e.currentTarget.style.background = isOn ? COLORS.accentDim : "transparent";
            }}
          >
            {/* Checkmark / empty box */}
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: RADIUS.sm,
                background: isOn ? COLORS.accent : COLORS.accentDim,
                color: isOn ? COLORS.white : COLORS.accent,
                fontWeight: TYPE.weight.semibold,
                fontSize: TYPE.scale.xs,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
                transition: `all ${MOTION.duration} ${MOTION.ease}`,
              }}
            >
              {isOn ? "✓" : ""}
            </span>
            {/* Name + reason */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: TYPE.weight.medium,
                  lineHeight: TYPE.leading.snug,
                }}
              >
                {tool.name}
              </div>
              <div
                style={{
                  fontSize: TYPE.scale.xs,
                  color: isDimmed ? COLORS.textDim : COLORS.textSecondary,
                  lineHeight: TYPE.leading.normal,
                  marginTop: 2,
                }}
              >
                {tool.reason}
              </div>
            </div>
          </button>
        );
      })}
      {/* Confirm bar */}
      {isActive && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "10px 16px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={toggled.size === 0}
            style={{
              padding: "7px 18px",
              borderRadius: RADIUS.md,
              border: "none",
              background: toggled.size > 0 ? COLORS.accent : COLORS.border,
              color: toggled.size > 0 ? COLORS.white : COLORS.textDim,
              fontSize: TYPE.scale.sm,
              fontWeight: TYPE.weight.medium,
              fontFamily: TYPE.body,
              cursor: toggled.size > 0 ? "pointer" : "default",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
            }}
            onMouseEnter={(e) => {
              if (toggled.size > 0) e.currentTarget.style.background = COLORS.accentBright;
            }}
            onMouseLeave={(e) => {
              if (toggled.size > 0) e.currentTarget.style.background = COLORS.accent;
            }}
          >
            Confirm{toggled.size > 0 ? ` (${toggled.size})` : ""}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// OptionCards — handles single-select (instant) and multi-select (toggle + confirm)
// ---------------------------------------------------------------------------

function OptionCards({
  options,
  isMultiSelect,
  onOptionClick,
  selectedKey,
}: {
  options: Array<{ key: string; label: string; originalKey?: string }>;
  isMultiSelect: boolean;
  onOptionClick?: (value: string) => void;
  selectedKey?: string;
}) {
  const [toggled, setToggled] = useState<Set<string>>(new Set());
  const isActive = !!onOptionClick;

  const handleToggle = (key: string) => {
    if (!isActive) return;
    // Find the option to get its originalKey for tool output
    const opt = options.find((o) => o.key === key);
    const outputKey = opt?.originalKey ?? key;
    if (isMultiSelect) {
      setToggled((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    } else {
      onOptionClick?.(outputKey);
    }
  };

  const handleConfirm = () => {
    if (toggled.size === 0) return;
    // Map display keys back to original keys for tool output
    const outputKeys = [...toggled].sort().map((k) => {
      const opt = options.find((o) => o.key === k);
      return opt?.originalKey ?? k;
    });
    onOptionClick?.(outputKeys.join(", "));
  };

  // For past messages: parse selectedKey which may be "A, C, D"
  const selectedKeys = new Set(
    selectedKey
      ? selectedKey.split(",").map((s) => s.trim().toUpperCase())
      : [],
  );

  return (
    <div
      style={{
        marginTop: 14,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow: "hidden",
        pointerEvents: isActive ? "auto" : "none",
        transition: `opacity ${MOTION.duration} ${MOTION.ease}`,
      }}
    >
      {options.map((opt, idx) => {
        const isOn = isActive ? toggled.has(opt.key) : selectedKeys.has(opt.key);
        const isDimmed = !isActive && !isOn && selectedKeys.size > 0;
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
              borderBottom: idx < options.length - 1 ? `1px solid ${COLORS.border}` : "none",
              color: isDimmed ? COLORS.textDim : COLORS.text,
              fontSize: TYPE.scale.base,
              fontFamily: TYPE.body,
              fontWeight: TYPE.weight.medium,
              cursor: isActive ? "pointer" : "default",
              opacity: isDimmed ? 0.4 : 1,
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              if (isActive) e.currentTarget.style.background = isOn ? COLORS.accentDim : COLORS.surfaceHover;
            }}
            onMouseLeave={(e) => {
              if (isActive) e.currentTarget.style.background = isOn ? COLORS.accentDim : "transparent";
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: RADIUS.sm,
                background: isOn ? COLORS.accent : COLORS.accentDim,
                color: isOn ? COLORS.white : COLORS.accent,
                fontWeight: TYPE.weight.semibold,
                fontSize: TYPE.scale.xs,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: `all ${MOTION.duration} ${MOTION.ease}`,
              }}
            >
              {isOn ? "✓" : opt.key}
            </span>
            <span style={{ flex: 1 }}>{opt.label}</span>
          </button>
        );
      })}
      {/* Confirm bar — only in multi-select active mode */}
      {isActive && isMultiSelect && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            padding: "10px 16px",
            borderTop: `1px solid ${COLORS.border}`,
          }}
        >
          <button
            className="btn"
            onClick={handleConfirm}
            disabled={toggled.size === 0}
            style={{
              padding: "7px 18px",
              borderRadius: RADIUS.md,
              border: "none",
              background: toggled.size > 0 ? COLORS.accent : COLORS.border,
              color: toggled.size > 0 ? COLORS.white : COLORS.textDim,
              fontSize: TYPE.scale.sm,
              fontWeight: TYPE.weight.medium,
              fontFamily: TYPE.body,
              cursor: toggled.size > 0 ? "pointer" : "default",
              transition: `all ${MOTION.duration} ${MOTION.ease}`,
            }}
            onMouseEnter={(e) => {
              if (toggled.size > 0) e.currentTarget.style.background = COLORS.accentBright;
            }}
            onMouseLeave={(e) => {
              if (toggled.size > 0) e.currentTarget.style.background = COLORS.accent;
            }}
          >
            Confirm{toggled.size > 0 ? ` (${toggled.size})` : ""}
          </button>
        </div>
      )}
    </div>
  );
}
