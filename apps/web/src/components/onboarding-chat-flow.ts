import { useChat } from "@ai-sdk/react";
import { useNavigate } from "@tanstack/react-router";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import type { FormEvent, KeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isRequestInputPart } from "~/components/onboarding-chat-messages";
import type { ToolkitSummary } from "~/server/onboard-prompt";

export function useOnboardingChatFlow(params: {
  projectId: string;
  availableSkills: Array<{ id: string; name: string; description: string }>;
  existingConnections: string[];
  toolkitSummaries: ToolkitSummary[];
}) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestAssistantRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [redirecting, setRedirecting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const transport = useRef(
    new DefaultChatTransport({
      api: "/api/onboard",
      body: {
        projectId: params.projectId,
        availableSkills: params.availableSkills,
        existingConnections: params.existingConnections,
        toolkitSummaries: params.toolkitSummaries,
      },
    }),
  ).current;

  const doRedirect = useCallback(
    (agentId: string) => {
      if (redirecting) return;
      setRedirecting(true);
      setTimeout(() => {
        navigate({
          to: "/$projectId/agents/$agentId",
          params: { projectId: params.projectId, agentId },
          search: { tab: "chat" as const, runId: undefined, pendingActionId: undefined },
        });
      }, 1500);
    },
    [navigate, params.projectId, redirecting],
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
            text: "What outcome should this agent own? Describe the result you want.",
          },
        ],
      },
    ],
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ message }) => {
      for (const part of message.parts) {
        const record = part as Record<string, unknown>;
        const type = record.type as string | undefined;
        const isTool = type === "dynamic-tool" || (typeof type === "string" && type.startsWith("tool-"));
        if (!isTool || record.state !== "output-available") continue;
        const output = record.output as { success?: boolean; agentId?: string } | undefined;
        if (output?.success && output.agentId) {
          doRedirect(output.agentId);
          return;
        }
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (redirecting) return;
    for (const message of messages) {
      for (const part of message.parts) {
        const record = part as Record<string, unknown>;
        const type = record.type as string | undefined;
        const isCreateAgent =
          (type === "dynamic-tool" && record.toolName === "create_agent") ||
          (typeof type === "string" && type.startsWith("tool-") && type.includes("create_agent"));
        if (!isCreateAgent || record.state !== "output-available") continue;
        const output = record.output as { success?: boolean; agentId?: string } | undefined;
        if (output?.success && output.agentId) {
          doRedirect(output.agentId);
          return;
        }
      }
    }
  }, [doRedirect, messages, redirecting]);

  useEffect(() => {
    if (!hasSubmitted) return;
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
  }, [hasSubmitted]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  const handleSubmit = useCallback(
    (event?: FormEvent) => {
      event?.preventDefault();
      const text = inputValue.trim();
      if (!text || isLoading || redirecting) return;
      if (!hasSubmitted) setHasSubmitted(true);
      setInputValue("");
      void sendMessage({ text });
    },
    [hasSubmitted, inputValue, isLoading, redirecting, sendMessage],
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

  const handleExampleClick = useCallback((prompt: string) => {
    setInputValue(prompt);
    inputRef.current?.focus();
  }, []);

  const handleOptionClick = useCallback(
    (value: string) => {
      if (isLoading || redirecting) return;
      if (!hasSubmitted) setHasSubmitted(true);
      setInputValue("");

      const lastAssistant = [...messagesRef.current].reverse().find((message) => message.role === "assistant");
      const pendingToolParts = lastAssistant?.parts.filter((part) => {
        const record = part as Record<string, unknown>;
        return isRequestInputPart(record) && record.state === "input-available";
      }) as Array<Record<string, unknown>> | undefined;

      if (pendingToolParts?.length) {
        const answers = value.split("\n");
        for (let index = 0; index < pendingToolParts.length; index += 1) {
          const toolCallId = pendingToolParts[index].toolCallId as string;
          const input = pendingToolParts[index].input as { options?: unknown[]; allowCustom?: boolean } | undefined;
          const answer = answers[index] ?? "_skipped";
          const isTextOnly = (!input?.options || (input.options as unknown[]).length === 0) && input?.allowCustom;

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
    [addToolOutput, hasSubmitted, isLoading, redirecting, sendMessage],
  );

  return {
    scrollRef,
    inputRef,
    latestAssistantRef,
    inputValue,
    setInputValue,
    redirecting,
    hasSubmitted,
    messages,
    conversationMessages: hasSubmitted ? messages.slice(1) : [],
    isLoading,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    handleOptionClick,
  };
}
