import { describe, expect, it } from "vitest";
import type { LanguageModel, UIMessage } from "ai";
import {
  classifyEpisodicLesson,
  extractRunInsights,
  extractStructuredConversationEvents,
  findCompactionBoundary,
  rehydrateConversationMessages,
  sanitizeConversationMessage,
  shouldAttemptChatMemoryDistillation,
} from "../runtime";
import type { ConversationEvent } from "../../types";

describe("conversation runtime helpers", () => {
  it("keeps an empty assistant shell for unresolved request_input turns", () => {
    const message: UIMessage = {
      id: "msg_001",
      role: "assistant",
      parts: [
        {
          type: "tool-request_input",
          toolCallId: "tool_001",
          state: "input-available",
          input: { question: "Approve this?" },
        },
      ] as UIMessage["parts"],
    };

    const sanitized = sanitizeConversationMessage(message);
    expect(sanitized).not.toBeNull();
    expect(sanitized?.parts).toEqual([]);
  });

  it("rehydrates request_input tool parts from structured events", () => {
    const messages: UIMessage[] = [{ id: "msg_001", role: "assistant", parts: [] }];
    const events: ConversationEvent[] = [
      {
        id: "evt_001",
        threadId: "thread_001",
        agentId: "agent_001",
        source: "web",
        role: "assistant",
        eventType: "tool_call",
        eventKey: "tool:tool_001:call",
        messageId: "msg_001",
        payload: {
          toolCallId: "tool_001",
          toolName: "request_input",
          input: { question: "Approve this?" },
        },
        createdAt: new Date("2026-04-02T10:00:00Z"),
      },
    ];

    const rehydrated = rehydrateConversationMessages(messages, events);
    expect(rehydrated[0]?.parts[0]).toMatchObject({
      type: "tool-request_input",
      state: "input-available",
    });
  });

  it("extracts structured tool call and output events", () => {
    const message: UIMessage = {
      id: "msg_001",
      role: "assistant",
      parts: [
        {
          type: "tool-request_input",
          toolCallId: "tool_001",
          state: "output-available",
          input: { question: "Approve this?" },
          output: { selectedKeys: ["yes"] },
        },
      ] as UIMessage["parts"],
    };

    const events = extractStructuredConversationEvents(message);
    expect(events.map((event) => event.eventType)).toEqual(["tool_call", "tool_output"]);
  });

  it("cuts large conversations on a turn boundary or split turn", () => {
    const messages: UIMessage[] = [
      { id: "u1", role: "user", parts: [{ type: "text", text: "A".repeat(4000) }] as UIMessage["parts"] },
      { id: "a1", role: "assistant", parts: [{ type: "text", text: "B".repeat(4000) }] as UIMessage["parts"] },
      { id: "a2", role: "assistant", parts: [{ type: "text", text: "C".repeat(4000) }] as UIMessage["parts"] },
    ];

    const boundary = findCompactionBoundary(messages, 1500);
    expect(boundary.firstKeptMessageIndex).toBeGreaterThan(0);
    expect(boundary.isSplitTurn).toBe(true);
    expect(boundary.turnStartIndex).toBe(0);
  });

  it("classifies content-bearing episodic runs as no-finding", () => {
    const result = classifyEpisodicLesson({
      headline: "run-headline",
      finalText: "run-output",
      details: [],
      toolCallCount: 2,
    });
    expect(result[0]?.scope).toBe("episode:no-finding");
    expect(result[0]?.expiresInMs).toBeDefined();
  });

  it("classifies empty-content episodic runs as attempted", () => {
    const result = classifyEpisodicLesson({
      headline: "",
      finalText: "",
      details: [],
      toolCallCount: 2,
    });
    expect(result[0]?.scope).toBe("episode:attempted");
    expect(result[0]?.expiresInMs).toBeDefined();
  });

  it("returns no episodic lesson when no tool calls occurred", () => {
    const result = classifyEpisodicLesson({
      headline: "run-headline",
      finalText: "run-output",
      details: [],
      toolCallCount: 0,
    });
    expect(result).toEqual([]);
  });

  it("extractRunInsights returns [] when run has no content", async () => {
    const mockModel = {} as unknown as LanguageModel;
    const result = await extractRunInsights({
      model: mockModel,
      headline: "",
      finalText: "",
      details: [],
    });
    expect(result).toEqual([]);
  });

  it("extractRunInsights returns [] when the model call fails", async () => {
    const failingModel = {
      specificationVersion: "v3" as const,
      provider: "mock",
      modelId: "mock",
      defaultObjectGenerationMode: "json" as const,
      async doGenerate() {
        throw new Error("simulated model failure");
      },
      async doStream() {
        throw new Error("not used");
      },
    } as unknown as LanguageModel;

    // Content is non-empty (to pass the combined-length guard) but
    // deliberately agent-agnostic — this function is domain-neutral.
    const result = await extractRunInsights({
      model: failingModel,
      headline: "run-headline",
      finalText: "run-output-content",
      details: [],
    });

    // Any failure path — thrown error, schema mismatch, rate limit — should
    // surface as an empty write list rather than propagate.
    expect(result).toEqual([]);
  });

  it("gates chat memory extraction to stable signals", () => {
    expect(
      shouldAttemptChatMemoryDistillation({
        latestUserText: "Actually, always use weekly summaries for me.",
      }),
    ).toBe(true);
    expect(
      shouldAttemptChatMemoryDistillation({
        latestUserText: "Thanks, that helps.",
      }),
    ).toBe(false);
  });
});
