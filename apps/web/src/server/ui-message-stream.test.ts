import { simulateReadableStream, streamText, type UIMessage } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { describe, expect, it } from "vitest";
import { buildPersistentUIMessageStreamOptions } from "./ui-message-stream";

function createTextStream(delta: string) {
  return simulateReadableStream({
    chunks: [
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta },
      { type: "text-end", id: "text-1" },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: undefined },
        logprobs: undefined,
        usage: {
          inputTokens: {
            total: 3,
            noCache: 3,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 4,
            text: 4,
            reasoning: undefined,
          },
        },
      },
    ],
  });
}

describe("persistent UI message stream options", () => {
  it("assigns an id to new assistant messages", async () => {
    const originalMessages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Check AI Max traffic" }],
      },
    ];

    let finished:
      | {
          responseMessage: UIMessage;
          messages: UIMessage[];
        }
      | undefined;

    const result = streamText({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: createTextStream("I will check that."),
        }),
      }),
      prompt: "Check AI Max traffic",
    });

    const response = result.toUIMessageStreamResponse(
      buildPersistentUIMessageStreamOptions({
        originalMessages,
        onFinish: ({ messages, responseMessage }) => {
          finished = { messages, responseMessage };
        },
      }),
    );

    await response.text();

    expect(finished).toBeDefined();
    expect(finished?.responseMessage.id).toBeTruthy();
    expect(finished?.responseMessage.id).not.toBe("user-1");
    expect(finished?.messages.at(-1)?.id).toBe(finished?.responseMessage.id);
  });

  it("preserves the id when continuing the last assistant message", async () => {
    const originalMessages: UIMessage[] = [
      {
        id: "user-1",
        role: "user",
        parts: [{ type: "text", text: "Continue" }],
      },
      {
        id: "assistant-1",
        role: "assistant",
        parts: [{ type: "text", text: "Already checking" }],
      },
    ];

    let responseMessageId: string | undefined;

    const result = streamText({
      model: new MockLanguageModelV3({
        doStream: async () => ({
          stream: createTextStream(" with fresh findings."),
        }),
      }),
      prompt: "Continue",
    });

    const response = result.toUIMessageStreamResponse(
      buildPersistentUIMessageStreamOptions({
        originalMessages,
        onFinish: ({ responseMessage }) => {
          responseMessageId = responseMessage.id;
        },
      }),
    );

    await response.text();

    expect(responseMessageId).toBe("assistant-1");
  });
});
