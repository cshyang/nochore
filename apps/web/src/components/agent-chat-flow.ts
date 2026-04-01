import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, type UIMessage } from "ai";
import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentView, RunView } from "~/lib/types";
import { isRequestInputPart } from "~/components/onboarding-chat-messages";

function computeGreeting(agent: AgentView, runs: RunView[]): string {
  if (agent.lifecycleStatus === "draft") {
    return `I'm ${agent.name}. I'm still being set up — what would you like to know?`;
  }
  if (runs.length === 0) {
    return `Hey, I'm ${agent.name}. I haven't run yet. Want to start my first run?`;
  }
  const lastRunTime = agent.lastRunRelative ?? "recently";
  return `Hey, I'm ${agent.name}. My last run completed ${lastRunTime}. What can I help with?`;
}

export function useAgentChatFlow(params: {
  agentId: string;
  projectId: string;
  threadId?: string;
  agent: AgentView;
  runs: RunView[];
  initialMessages?: UIMessage[];
  onRunTriggered?: (runId: string, triggerRunId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");

  const greeting = computeGreeting(params.agent, params.runs);
  const initialMessages =
    params.initialMessages && params.initialMessages.length > 0
      ? params.initialMessages
      : [
          {
            id: "greeting",
            role: "assistant" as const,
            parts: [{ type: "text" as const, text: greeting }],
          },
        ];

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
      api: "/api/agent-chat",
      body: {
        agentId: params.agentId,
        projectId: params.projectId,
        threadId: params.threadId,
      },
    }),
    [params.agentId, params.projectId, params.threadId],
  );

  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport,
    messages: initialMessages,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ message }) => {
      for (const part of message.parts) {
        const record = part as Record<string, unknown>;
        const type = record.type as string | undefined;
        const isTriggerRun =
          (type === "dynamic-tool" && record.toolName === "trigger_run") ||
          (typeof type === "string" && type.startsWith("tool-") && type.includes("trigger_run"));
        if (!isTriggerRun || record.state !== "output-available") continue;
        const output = record.output as { runId?: string; triggerRunId?: string } | undefined;
        if (output?.runId && output.triggerRunId) {
          params.onRunTriggered?.(output.runId, output.triggerRunId);
          return;
        }
      }
    },
  });

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll to latest assistant message
  useEffect(() => {
    const timer = setTimeout(() => {
      const container = scrollRef.current;
      const target = latestAssistantRef.current;
      if (container && target) {
        const containerRect = container.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const offset = targetRect.top - containerRect.top + container.scrollTop;
        container.scrollTo({ top: offset - 24, behavior: "smooth" });
      } else {
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [messages.length]);

  // Auto-focus input
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, [inputValue]);

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = inputValue.trim();
      if (!text || isLoading) return;
      setInputValue("");
      void sendMessage({ text });
    },
    [inputValue, isLoading, sendMessage],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleOptionClick = useCallback(
    (value: string) => {
      if (isLoading) return;
      setInputValue("");

      const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
      const pendingToolParts = lastAssistant?.parts.filter((part) => {
        const record = part as Record<string, unknown>;
        return isRequestInputPart(record) && record.state === "input-available";
      }) as Array<Record<string, unknown>> | undefined;

      if (pendingToolParts?.length) {
        const answers = value.split("\n");
        for (let index = 0; index < pendingToolParts.length; index += 1) {
          const toolCallId = pendingToolParts[index].toolCallId as string;
          const input = pendingToolParts[index].input as
            | { options?: unknown[]; allowCustom?: boolean }
            | undefined;
          const answer = answers[index] ?? "_skipped";
          const isTextOnly =
            (!input?.options || (input.options as unknown[]).length === 0) && input?.allowCustom;

          addToolOutput({
            tool: "request_input" as never,
            toolCallId,
            output: {
              selectedKeys: answer === "_skipped" ? [] : isTextOnly ? [] : answer.split(", "),
              customText: isTextOnly && answer !== "_skipped" ? answer : undefined,
              skipped: answer === "_skipped",
            } as never,
          });
        }
        return;
      }

      void sendMessage({ text: value });
    },
    [addToolOutput, isLoading, sendMessage],
  );

  const notifyRunCompleted = useCallback(() => {
    if (isLoading) return;
    void sendMessage({ text: "The run just completed. Summarize what you found." });
  }, [isLoading, sendMessage]);

  return {
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
  };
}
