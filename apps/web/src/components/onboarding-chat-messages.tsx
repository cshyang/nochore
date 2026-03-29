import { CaretRight, Lightning, MagnifyingGlass, Sparkle } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { OptionCards, PaginatedCard, parseOptions } from "~/components/onboarding-chat-options";
import type { OnboardingMessage, RequestInputToolInput } from "~/components/onboarding-chat-types";
import { COLORS, MOTION, RADIUS, TYPE } from "~/lib/colors";

export function isRequestInputPart(part: Record<string, unknown>): boolean {
  return part.type === "tool-request_input" || (part.type === "dynamic-tool" && part.toolName === "request_input");
}

function getPartToolName(part: Record<string, unknown>): string | null {
  if (part.type === "dynamic-tool") return part.toolName as string;
  if (typeof part.type === "string" && String(part.type).startsWith("tool-")) return String(part.type).slice(5);
  return null;
}

const TOOL_LABELS: Record<string, { verb: string; done: string; icon: "search" | "bolt" }> = {
  search_tools: { verb: "Searching for tools", done: "Found tools", icon: "search" },
  create_agent: { verb: "Creating your agent", done: "Agent created", icon: "bolt" },
};

function ReasoningBlock({ text, state }: { text: string; state: string }) {
  const [expanded, setExpanded] = useState(state === "streaming");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setExpanded(state === "streaming");
  }, [state]);

  useEffect(() => {
    if (state === "streaming") {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    }
  }, [state, text]);

  return (
    <div
      style={{
        marginTop: 10,
        borderRadius: RADIUS.lg,
        border: `1px solid ${COLORS.border}`,
        background: COLORS.surface,
        overflow: "hidden",
      }}
    >
      <button
        type="button"
        className="btn"
        onClick={() => setExpanded((value) => !value)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 14px",
          background: "transparent",
          border: "none",
          color: COLORS.textSecondary,
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Sparkle size={14} weight="fill" color={COLORS.accent} />
        <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.medium, color: COLORS.text }}>
          {state === "streaming" ? "Thinking…" : "Thought for a moment"}
        </span>
        <span style={{ marginLeft: "auto", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>
          <CaretRight size={14} />
        </span>
      </button>
      {expanded ? (
        <div
          ref={scrollRef}
          style={{
            maxHeight: 240,
            overflowY: "auto",
            padding: "0 14px 14px",
            color: COLORS.textSecondary,
            fontSize: TYPE.scale.sm,
            lineHeight: TYPE.leading.normal,
            whiteSpace: "pre-wrap",
          }}
        >
          {text}
        </div>
      ) : null}
    </div>
  );
}

function ToolActivityRow({ toolName, state, output }: { toolName: string; state: string; output: unknown }) {
  const label = TOOL_LABELS[toolName];
  if (!label) return null;

  const Icon = label.icon === "search" ? MagnifyingGlass : Lightning;
  const summary =
    toolName === "search_tools" && Array.isArray(output)
      ? `${label.done} (${output.length})`
      : state === "output-available"
        ? label.done
        : label.verb;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        marginTop: 10,
        padding: "8px 10px",
        borderRadius: RADIUS.pill,
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        color: COLORS.textSecondary,
        fontSize: TYPE.scale.xs,
      }}
    >
      <Icon size={12} weight="bold" color={COLORS.accent} />
      <span>{summary}</span>
    </div>
  );
}

function resolveSelectedLabel(selected: string, options: Array<{ key: string; label: string }>): string {
  const labelByKey = new Map(options.map((option) => [option.key, option.label]));
  if (labelByKey.has(selected)) return labelByKey.get(selected)!;

  return selected
    .split(",")
    .map((token) => token.trim())
    .map((token) => labelByKey.get(token) ?? token)
    .join(", ");
}

function renderPart(part: Record<string, unknown>, index: number): ReactNode {
  if (part.type === "reasoning") {
    const text = (part.text as string) ?? (part.reasoning as string) ?? "";
    const state = (part.state as string) ?? "done";
    return text ? <ReasoningBlock key={`reasoning-${index}`} text={text} state={state} /> : null;
  }

  if (part.type === "step-start") {
    return <div key={`step-${index}`} style={{ height: 1, background: COLORS.border, margin: "8px 0", opacity: 0.5 }} />;
  }

  if (part.type === "text") {
    const text = part.text as string;
    if (!text?.trim()) return null;
    return (
      <div
        key={`text-${index}`}
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

  const toolName = getPartToolName(part);
  if (toolName && TOOL_LABELS[toolName]) {
    return <ToolActivityRow key={`tool-${index}`} toolName={toolName} state={part.state as string} output={part.output} />;
  }

  return null;
}

export function ConversationMessage({
  message,
  onOptionClick,
}: {
  message: OnboardingMessage;
  onOptionClick?: (value: string) => void;
}) {
  const isUser = message.role === "user";
  const parts = message.parts;

  if (isUser) {
    const textContent = parts
      .filter((part) => part.type === "text")
      .map((part) => part.text as string)
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

  const requestInputParts = parts.filter(
    (part) => isRequestInputPart(part) && (part.state === "input-available" || part.state === "output-available"),
  );

  if (!onOptionClick && requestInputParts.length > 0) {
    const nonRequestParts = parts.filter((part) => !isRequestInputPart(part));

    return (
      <div>
        {nonRequestParts.map((part, index) => renderPart(part, index))}
        {requestInputParts.map((part) => {
          const input = part.input as RequestInputToolInput | undefined;
          const output = part.output as { selectedKeys?: string[]; customText?: string; skipped?: boolean } | undefined;
          const answer = output?.skipped
            ? "Skipped"
            : output?.customText || resolveSelectedLabel((output?.selectedKeys ?? []).join(", "), input?.options ?? []);

          return (
            <div
              key={`past-${part.toolCallId}`}
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
              {input?.question ?? ""} → <span style={{ color: COLORS.text }}>{answer}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const renderedParts: React.ReactNode[] = [];
  let textBuffer = "";
  let lastTextState: string | undefined;

  const flushText = () => {
    if (!textBuffer.trim()) {
      textBuffer = "";
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
        <Markdown>{textBuffer.trim()}</Markdown>
        {isStreaming ? (
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
        ) : null}
      </div>,
    );

    textBuffer = "";
    lastTextState = undefined;
  };

  for (const part of parts) {
    if (part.type === "text") {
      textBuffer += part.text as string;
      lastTextState = part.state as string | undefined;
      continue;
    }

    flushText();

    if (part.type === "reasoning" || part.type === "step-start") {
      renderedParts.push(renderPart(part, renderedParts.length));
      continue;
    }

    if (isRequestInputPart(part) && part.state === "output-available") {
      const input = part.input as RequestInputToolInput | undefined;
      const output = part.output as { selectedKeys?: string[]; customText?: string; skipped?: boolean } | undefined;
      const answer = output?.skipped
        ? "Skipped"
        : output?.customText || resolveSelectedLabel((output?.selectedKeys ?? []).join(", "), input?.options ?? []);

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
          {input?.question ?? ""} → <span style={{ color: COLORS.text }}>{answer}</span>
        </div>,
      );
      continue;
    }

    if (!isRequestInputPart(part)) {
      const toolName = getPartToolName(part);
      if (toolName && TOOL_LABELS[toolName]) {
        renderedParts.push(renderPart(part, renderedParts.length));
      }
    }
  }

  flushText();

  const pendingParts = requestInputParts.filter((part) => part.state === "input-available");
  const pendingInputs = pendingParts
    .map((part) => part.input as RequestInputToolInput | undefined)
    .filter((input): input is RequestInputToolInput => !!input);

  if (pendingInputs.length > 1 && onOptionClick) {
    renderedParts.push(<PaginatedCard key="paginated" steps={pendingInputs} onComplete={onOptionClick} />);
  } else if (pendingInputs.length > 0) {
    const input = pendingInputs[0];
    const textContent = parts
      .filter((part) => part.type === "text")
      .map((part) => part.text as string)
      .join("");
    const fallback = input.options.length > 0 ? { options: input.options, isMultiSelect: input.multiSelect } : parseOptions(textContent);
    const finalOptions = input.options.length > 0 ? input.options : fallback.options;
    const finalMultiSelect = input.options.length > 0 ? input.multiSelect : fallback.isMultiSelect;
    const isTextOnly = finalOptions.length === 0 && input.allowCustom;

    if (input.question && !textContent.includes(input.question)) {
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
          <Markdown>{input.question}</Markdown>
        </div>,
      );
    }

    if (finalOptions.length > 0 || isTextOnly) {
      renderedParts.push(
        <OptionCards
          key="options"
          options={finalOptions}
          isMultiSelect={finalMultiSelect}
          allowCustom={input.allowCustom}
          skippable={input.skippable}
          placeholder={input.placeholder}
          onOptionClick={onOptionClick}
        />,
      );
    }
  }

  if (renderedParts.length === 0 && requestInputParts.length === 0) {
    return null;
  }

  return <div>{renderedParts}</div>;
}
