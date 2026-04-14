import { describe, expect, it } from "vitest";
import { createTestDb } from "../../db/client";
import { projects } from "../../db/schema";
import { AgentRepository } from "../agent";
import { ApprovalRepository } from "../approval";
import { createProjectRepositories } from "../bundle";
import { ConversationCheckpointRepository } from "../conversation-checkpoint";
import { ConversationEventRepository } from "../conversation-event";
import { ConversationThreadRepository } from "../conversation-thread";
import { RunEventRepository } from "../event";
import { LessonRepository } from "../lesson";
import { RunRepository } from "../run";
import { WorkItemRepository } from "../work-item";

describe("simplified repositories", () => {
  it("creates a concrete repository bundle for one project database", () => {
    const db = createTestDb();
    const repositories = createProjectRepositories(db);

    expect(repositories.agentRepository).toBeInstanceOf(AgentRepository);
    expect(repositories.approvalRepository).toBeInstanceOf(ApprovalRepository);
    expect(repositories.conversationCheckpointRepository).toBeInstanceOf(ConversationCheckpointRepository);
    expect(repositories.runRepository).toBeInstanceOf(RunRepository);
  });

  it("creates, loads, and updates agents", async () => {
    const db = createTestDb();
    const now = Date.now();
    db.insert(projects)
      .values({
        id: "proj_001",
        name: "Homescape",
        createdAt: now,
      })
      .run();

    const repo = new AgentRepository(db);
    const id = await repo.create({
      projectId: "proj_001",
      name: "Budget Guardian",
      description: "Monitors paid media changes",
      instructions: "Focus on waste reduction.",
      skills: ["campaign-analysis"],
      toolConfig: {
        globalApprovalRequired: false,
        requiredProviders: [{ provider: "googleads", reason: "Reads account data" }],
        tools: {},
      },
      notificationConfig: { inApp: true, email: false, slack: true },
      schedule: "daily",
      status: "draft",
    });

    await repo.update(id, {
      status: "live",
      skills: ["campaign-analysis", "campaign-reviewer"],
    });

    const agent = await repo.getById(id);
    expect(agent?.status).toBe("live");
    expect(agent?.skills).toEqual(["campaign-analysis", "campaign-reviewer"]);
  });

  it("tracks run lifecycle and summary state", async () => {
    const db = createTestDb();
    const repo = new RunRepository(db);
    const startedAt = new Date("2026-03-24T10:00:00Z");
    const completedAt = new Date("2026-03-24T10:04:00Z");

    const id = await repo.create({
      agentId: "agent_001",
      triggerType: "manual",
      startedAt,
    });

    await repo.markRunning(id);
    await repo.markWaitingForApproval(id);
    await repo.complete(id, completedAt, {
      status: "completed",
      headline: "Budget review finished",
      details: ["1 approval requested", "3 findings recorded"],
      finalText: "No automatic changes were made.",
    });

    const run = await repo.getById(id);
    expect(run?.status).toBe("completed");
    expect(run?.summary?.headline).toBe("Budget review finished");
    expect(run?.completedAt?.toISOString()).toBe(completedAt.toISOString());
  });

  it("marks cancelled runs as terminal without a summary", async () => {
    const db = createTestDb();
    const repo = new RunRepository(db);
    const startedAt = new Date("2026-03-24T10:00:00Z");
    const cancelledAt = new Date("2026-03-24T10:01:00Z");

    const id = await repo.create({
      agentId: "agent_001",
      triggerType: "manual",
      startedAt,
    });

    await repo.markRunning(id);
    await repo.cancel(id, cancelledAt, "Cancelled in Trigger.dev");

    const run = await repo.getById(id);
    expect(run?.status).toBe("cancelled");
    expect(run?.error).toBe("Cancelled in Trigger.dev");
    expect(run?.summary).toBeUndefined();
    expect(run?.completedAt?.toISOString()).toBe(cancelledAt.toISOString());
  });

  it("marks stopped runs as terminal without a summary", async () => {
    const db = createTestDb();
    const repo = new RunRepository(db);
    const startedAt = new Date("2026-03-24T10:00:00Z");
    const stoppedAt = new Date("2026-03-24T10:02:00Z");

    const id = await repo.create({
      agentId: "agent_001",
      triggerType: "manual",
      startedAt,
    });

    await repo.markRunning(id);
    await repo.stop(id, stoppedAt, "Approval rejected");

    const run = await repo.getById(id);
    expect(run?.status).toBe("stopped");
    expect(run?.error).toBe("Approval rejected");
    expect(run?.summary).toBeUndefined();
    expect(run?.completedAt?.toISOString()).toBe(stoppedAt.toISOString());
  });

  it("appends timeline events in order for a run", async () => {
    const db = createTestDb();
    const repo = new RunEventRepository(db);
    const t0 = new Date("2026-03-24T10:00:00Z");
    const t1 = new Date("2026-03-24T10:01:00Z");

    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t0,
      type: "run_started",
      payload: { triggerType: "manual" },
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t1,
      type: "finding_recorded",
      payload: { title: "High CPA keyword cluster" },
    });

    const runEvents = await repo.listByRun("run_001");
    const agentEvents = await repo.listByAgent("agent_001", 5);

    expect(runEvents.map((event) => event.type)).toEqual(["run_started", "finding_recorded"]);
    expect(agentEvents[0]?.type).toBe("finding_recorded");
  });

  it("creates and resolves approvals by approval id", async () => {
    const db = createTestDb();
    const repo = new ApprovalRepository(db);
    const createdAt = new Date("2026-03-24T10:02:00Z");
    const resolvedAt = new Date("2026-03-24T10:03:00Z");

    const id = await repo.create({
      runId: "run_001",
      agentId: "agent_001",
      approvalId: "approval_sdk_001",
      waitTokenId: "wait_001",
      toolName: "googleads_adjust_budget",
      toolInput: { campaignId: "123", amount: 50 },
      requestReason: "Budget changes require approval",
      requestEventId: "evt_approval_requested",
      createdAt,
      expiresAt: new Date("2026-03-25T10:02:00Z"),
    });

    await repo.markResolved(id, "approved", "Safe budget reduction", resolvedAt);

    const approval = await repo.getByApprovalId("approval_sdk_001");
    const approvals = await repo.listByAgent("agent_001", ["approved"]);

    expect(approval?.status).toBe("approved");
    expect(approval?.decisionReason).toBe("Safe budget reduction");
    expect(approval?.requestReason).toBe("Budget changes require approval");
    expect(approval?.requestEventId).toBe("evt_approval_requested");
    expect(approval?.expiresAt?.toISOString()).toBe("2026-03-25T10:02:00.000Z");
    expect(approvals).toHaveLength(1);
  });

  it("stops work items as a terminal state and clears blocking metadata", async () => {
    const db = createTestDb();
    const repo = new WorkItemRepository(db);
    const completedAt = new Date("2026-03-24T10:03:00Z");

    const id = await repo.create({
      parentRunId: "run_001",
      rootRunId: "run_001",
      agentId: "agent_001",
      role: "analyst",
      title: "Inspect approval gate",
    });

    await repo.markRunning(id);
    await repo.markWaitingForApproval(id);
    await repo.stop(id, completedAt, "Approval expired");

    const workItem = await repo.getById(id);
    expect(workItem?.status).toBe("stopped");
    expect(workItem?.error).toBe("Approval expired");
    expect(workItem?.blockingReason).toBeUndefined();
    expect(workItem?.completedAt?.toISOString()).toBe(completedAt.toISOString());
  });

  it("returns only active lessons for an agent", async () => {
    const db = createTestDb();
    const repo = new LessonRepository(db);
    const now = new Date();

    await repo.create({
      agentId: "agent_001",
      content: "Exclude coupon-seeking traffic.",
      scope: "search_terms",
      confidence: "high",
      sourceEventIds: ["evt_001"],
      createdAt: now,
    });
    await repo.create({
      agentId: "agent_001",
      content: "Old pacing observation",
      scope: "budget",
      confidence: "low",
      sourceEventIds: ["evt_002"],
      createdAt: now,
      expiresAt: new Date(now.getTime() - 60_000),
    });

    const lessons = await repo.listByAgent("agent_001");
    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.scope).toBe("search_terms");
  });

  it("separates durable and episodic lessons", async () => {
    const db = createTestDb();
    const repo = new LessonRepository(db);
    const now = new Date();

    await repo.create({
      agentId: "agent_001",
      content: "Use weekly summaries.",
      scope: "memory:preference",
      confidence: "high",
      sourceEventIds: ["evt_001"],
      createdAt: now,
    });
    await repo.create({
      agentId: "agent_001",
      content: "Checked this yesterday and found no issue.",
      scope: "episode:no-finding",
      confidence: "low",
      sourceEventIds: ["evt_002"],
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    });

    const durable = await repo.listDurableByAgent("agent_001");
    const episodic = await repo.listEpisodicByAgent("agent_001");

    expect(durable).toHaveLength(1);
    expect(durable[0]?.scope).toBe("memory:preference");
    expect(episodic).toHaveLength(1);
    expect(episodic[0]?.scope).toBe("episode:no-finding");
  });

  it("creates one primary conversation thread per agent and reuses it", async () => {
    const db = createTestDb();
    const repo = new ConversationThreadRepository(db);

    const first = await repo.getOrCreatePrimary("agent_001");
    const second = await repo.getOrCreatePrimary("agent_001");

    expect(second.id).toBe(first.id);
    expect(second.scope).toBe("primary");
    expect(second.channelKind).toBe("web");
  });

  it("upserts conversation messages and rolling checkpoints", async () => {
    const db = createTestDb();
    const threadRepo = new ConversationThreadRepository(db);
    const eventRepo = new ConversationEventRepository(db);
    const checkpointRepo = new ConversationCheckpointRepository(db);
    const thread = await threadRepo.getOrCreatePrimary("agent_001");

    await eventRepo.upsertMessages([
      {
        threadId: thread.id,
        agentId: "agent_001",
        source: "web",
        createdAt: new Date("2026-04-01T10:00:00Z"),
        message: {
          id: "msg_001",
          role: "assistant",
          parts: [{ type: "text", text: "Initial answer" }],
        },
      },
    ]);

    await eventRepo.upsertMessages([
      {
        threadId: thread.id,
        agentId: "agent_001",
        source: "web",
        createdAt: new Date("2026-04-01T10:01:00Z"),
        message: {
          id: "msg_001",
          role: "assistant",
          parts: [{ type: "text", text: "Updated answer" }],
        },
      },
      {
        threadId: thread.id,
        agentId: "agent_001",
        source: "web",
        createdAt: new Date("2026-04-01T10:02:00Z"),
        message: {
          id: "msg_002",
          role: "user",
          parts: [{ type: "text", text: "Follow-up question" }],
        },
      },
    ]);

    const messages = await eventRepo.listAllMessagesByThread(thread.id);
    const firstMessage = eventRepo.toUIMessage(messages[0]!);
    expect(messages).toHaveLength(2);
    expect(firstMessage?.parts[0]).toMatchObject({ type: "text", text: "Updated answer" });

    await checkpointRepo.upsert({
      threadId: thread.id,
      summary: "Earlier conversation summary (1 messages):\n- Assistant: Updated answer",
      messageCount: 1,
      estimatedTokens: 42,
      coversThroughMessageId: "msg_001",
    });

    const checkpoint = await checkpointRepo.getByThread(thread.id);
    expect(checkpoint?.messageCount).toBe(1);
    expect(checkpoint?.estimatedTokens).toBe(42);
    expect(checkpoint?.summaryVersion).toBe(1);
    expect(checkpoint?.coversThroughMessageId).toBe("msg_001");
  });

  it("upserts structured conversation events by event key", async () => {
    const db = createTestDb();
    const threadRepo = new ConversationThreadRepository(db);
    const eventRepo = new ConversationEventRepository(db);
    const thread = await threadRepo.getOrCreatePrimary("agent_001");

    await eventRepo.upsertStructuredEvents([
      {
        threadId: thread.id,
        agentId: "agent_001",
        source: "web",
        role: "assistant",
        eventType: "tool_call",
        eventKey: "tool:tool_001:call",
        messageId: "msg_001",
        payload: {
          toolCallId: "tool_001",
          toolName: "request_input",
          input: { question: "Approve?" },
        },
        createdAt: new Date("2026-04-01T10:00:00Z"),
      },
      {
        threadId: thread.id,
        agentId: "agent_001",
        source: "web",
        role: "tool",
        eventType: "tool_output",
        eventKey: "tool:tool_001:output",
        messageId: "msg_001",
        payload: {
          toolCallId: "tool_001",
          toolName: "request_input",
          output: { selectedKeys: ["yes"] },
        },
        createdAt: new Date("2026-04-01T10:00:01Z"),
      },
    ]);

    const events = await eventRepo.listStructuredEventsByThread(thread.id);
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.eventType)).toEqual(["tool_call", "tool_output"]);
  });
});
