import { createProjectRepositories } from "@nochore/harness";
import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../../../../packages/harness/src/db/client";
import { loadConversationLoaderState, persistConversationMessages } from "./chat-memory";

function createProjectDeps() {
  const db = createTestDb();
  return {
    db,
    ...createProjectRepositories(db),
  };
}

describe("chat memory thread loading", () => {
  it("loads the requested thread when it belongs to the agent", async () => {
    const deps = createProjectDeps();
    const primary = await deps.conversationThreadRepository.getOrCreatePrimary("agent_001");
    const manual = await deps.conversationThreadRepository.createManualWebThread("agent_001");

    await persistConversationMessages({
      deps,
      threadId: primary.id,
      agentId: "agent_001",
      messages: [
        {
          id: "msg_primary_001",
          role: "user",
          parts: [{ type: "text", text: "Primary thread question" }],
        } satisfies UIMessage,
      ],
    });

    await persistConversationMessages({
      deps,
      threadId: manual.id,
      agentId: "agent_001",
      messages: [
        {
          id: "msg_manual_001",
          role: "user",
          parts: [{ type: "text", text: "Manual thread question" }],
        } satisfies UIMessage,
      ],
    });

    const state = await loadConversationLoaderState({
      deps,
      agentId: "agent_001",
      requestedThreadId: manual.id,
    });

    expect(state.thread.id).toBe(manual.id);
    expect(state.messages.map((message) => message.id)).toEqual(["msg_manual_001"]);
  });

  it("falls back to the primary thread when the requested thread is missing", async () => {
    const deps = createProjectDeps();
    const primary = await deps.conversationThreadRepository.getOrCreatePrimary("agent_001");

    await persistConversationMessages({
      deps,
      threadId: primary.id,
      agentId: "agent_001",
      messages: [
        {
          id: "msg_primary_001",
          role: "user",
          parts: [{ type: "text", text: "Primary thread question" }],
        } satisfies UIMessage,
      ],
    });

    const state = await loadConversationLoaderState({
      deps,
      agentId: "agent_001",
      requestedThreadId: "thread_missing",
    });

    expect(state.thread.id).toBe(primary.id);
    expect(state.thread.scope).toBe("primary");
    expect(state.messages.map((message) => message.id)).toEqual(["msg_primary_001"]);
  });
});

describe("chat memory thread titles", () => {
  it("auto-titles a new manual thread from its first user message", async () => {
    const deps = createProjectDeps();
    const manual = await deps.conversationThreadRepository.createManualWebThread("agent_001");

    await persistConversationMessages({
      deps,
      threadId: manual.id,
      agentId: "agent_001",
      messages: [
        {
          id: "msg_user_001",
          role: "user",
          parts: [
            {
              type: "text",
              text: "Can you check if the AI Max feature brings in good traffic to the campaigns?\nIgnore the second line.",
            },
          ],
        } satisfies UIMessage,
      ],
    });

    const updated = await deps.conversationThreadRepository.getById(manual.id);
    expect(updated?.title).toBe("Can you check if the AI Max feature brings in good traf...");
  });
});
