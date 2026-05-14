import { createProjectRepositories } from "@nochore/harness";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../../../../packages/harness/src/db/client";
import { beginChatTurn, completeChatTurn, webThreadContextKey } from "./agent-session-core";
import type { AgentRow, ProjectDeps } from "./deps";

function makeDeps(): ProjectDeps {
  const db = createTestDb();
  return { db, ...createProjectRepositories(db) };
}

function makeAgent(): AgentRow {
  return {
    id: "agent_001",
    projectId: "proj_001",
    name: "Growth Agent",
    description: "Optimizes paid media",
    config: {
      instructions: "Focus on waste.",
      skills: [],
      toolConfig: { globalApprovalRequired: false, requiredProviders: [], tools: {} },
      notificationConfig: { inApp: true, email: false, slack: false },
      schedule: "manual",
    },
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };
}

describe("agent session core", () => {
  it("wraps a simple chat turn in an AgentSession, WorkItem, and ContextSnapshot", async () => {
    const deps = makeDeps();
    const turn = await beginChatTurn({
      deps,
      projectId: "proj_001",
      agent: makeAgent(),
      threadId: "thread_001",
      rawMessages: [{ id: "msg_001", role: "user", parts: [{ type: "text", text: "Hello" }] }],
      system: "System prompt",
      memoryContext: "Remember prior preferences.",
      providerTools: { request_input: {} },
      connectionBindingCount: 0,
      latestUserText: "Hello",
    });

    const session = await deps.agentSessionRepository.getById(turn.sessionId);
    const workItem = await deps.workItemRepository.getById(turn.workItemId);
    const snapshots = await deps.contextSnapshotRepository.listBySession(turn.sessionId);

    expect(session?.contextKey).toBe(webThreadContextKey("thread_001"));
    expect(session?.status).toBe("thinking");
    expect(session?.activeWorkItemId).toBe(turn.workItemId);
    expect(workItem?.kind).toBe("chat_turn");
    expect(workItem?.status).toBe("running");
    expect(snapshots[0]?.id).toBe(turn.contextSnapshotId);
    expect(snapshots[0]?.payload).toMatchObject({
      executor: "inline-ai-sdk",
      threadId: "thread_001",
      toolNames: ["request_input"],
    });

    await completeChatTurn(deps, turn, { responseMessageId: "msg_002" });

    const completedSession = await deps.agentSessionRepository.getById(turn.sessionId);
    const completedWorkItem = await deps.workItemRepository.getById(turn.workItemId);
    expect(completedSession?.status).toBe("idle");
    expect(completedSession?.activeWorkItemId).toBeUndefined();
    expect(completedWorkItem?.status).toBe("completed");
    expect(completedWorkItem?.result).toEqual({ responseMessageId: "msg_002" });
  });
});
