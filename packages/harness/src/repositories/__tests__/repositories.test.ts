import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../db/client";
import { EventRepository } from "../event";
import { LessonRepository } from "../lesson";
import { RunRepository } from "../run";
import { ApprovalRepository } from "../approval";
import { ChatSessionStore } from "../chat-session";
import type { AgentEventType } from "../../types/memory";
import type { ActionProposal } from "../../types/action";

type TestDb = ReturnType<typeof createTestDb>;

// ---------------------------------------------------------------------------
// EventRepository
// ---------------------------------------------------------------------------

describe("EventRepository", () => {
  let db: TestDb;
  let repo: EventRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new EventRepository(db);
  });

  it("appends an event and returns the generated id", async () => {
    const id = await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date("2026-03-01T00:00:00Z"),
      type: "skill_output",
      data: { findings: 5 },
    });

    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
    expect(id.length).toBeGreaterThan(0);
  });

  it("generates unique ids for each event", async () => {
    const id1 = await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "skill_output",
      data: {},
    });
    const id2 = await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "action_proposed",
      data: {},
    });

    expect(id1).not.toBe(id2);
  });

  it("queries events by agentId filter", async () => {
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "skill_output",
      data: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_002",
      timestamp: new Date(),
      type: "skill_output",
      data: {},
    });

    const events = await repo.query({ agentId: "agent_001" });
    expect(events).toHaveLength(1);
    expect(events[0].agentId).toBe("agent_001");
  });

  it("queries events by runId filter", async () => {
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "skill_output",
      data: {},
    });
    await repo.append({
      runId: "run_002",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "action_proposed",
      data: {},
    });

    const events = await repo.query({ runId: "run_001" });
    expect(events).toHaveLength(1);
    expect(events[0].runId).toBe("run_001");
  });

  it("queries events by single type filter", async () => {
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "skill_output",
      data: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "action_proposed",
      data: {},
    });

    const events = await repo.query({ type: "skill_output" });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("skill_output");
  });

  it("queries events by array of types filter", async () => {
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "skill_output",
      data: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "action_proposed",
      data: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: new Date(),
      type: "run_started",
      data: {},
    });

    const events = await repo.query({
      type: ["skill_output", "action_proposed"],
    });
    expect(events).toHaveLength(2);
  });

  it("queries events by since filter", async () => {
    const t1 = new Date("2026-03-01T00:00:00Z");
    const t2 = new Date("2026-03-02T00:00:00Z");
    const t3 = new Date("2026-03-03T00:00:00Z");

    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t1,
      type: "skill_output",
      data: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t3,
      type: "action_proposed",
      data: {},
    });

    const events = await repo.query({ since: t2 });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("action_proposed");
  });

  it("queries events with limit", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.append({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(Date.now() + i * 1000),
        type: "skill_output",
        data: { i },
      });
    }

    const events = await repo.query({ agentId: "agent_001", limit: 3 });
    expect(events).toHaveLength(3);
  });

  it("combines multiple filters", async () => {
    const t1 = new Date("2026-03-01T00:00:00Z");
    const t2 = new Date("2026-03-02T00:00:00Z");

    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t1,
      type: "skill_output",
      data: {},
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t2,
      type: "action_proposed",
      data: {},
    });
    await repo.append({
      runId: "run_002",
      agentId: "agent_002",
      timestamp: t2,
      type: "skill_output",
      data: {},
    });

    const events = await repo.query({
      agentId: "agent_001",
      type: "skill_output",
    });
    expect(events).toHaveLength(1);
  });

  it("returns events with Date objects for timestamp", async () => {
    const ts = new Date("2026-03-15T12:30:00Z");
    const id = await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: ts,
      type: "skill_output",
      data: { key: "value" },
    });

    const events = await repo.query({ agentId: "agent_001" });
    expect(events[0].timestamp).toBeInstanceOf(Date);
    expect(events[0].timestamp.getTime()).toBe(ts.getTime());
    expect(events[0].id).toBe(id);
    expect(events[0].data).toEqual({ key: "value" });
  });

  it("returns events ordered by timestamp ascending", async () => {
    const t1 = new Date("2026-03-01T00:00:00Z");
    const t2 = new Date("2026-03-02T00:00:00Z");
    const t3 = new Date("2026-03-03T00:00:00Z");

    // Insert out of order
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t3,
      type: "skill_output",
      data: { order: 3 },
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t1,
      type: "skill_output",
      data: { order: 1 },
    });
    await repo.append({
      runId: "run_001",
      agentId: "agent_001",
      timestamp: t2,
      type: "skill_output",
      data: { order: 2 },
    });

    const events = await repo.query({ agentId: "agent_001" });
    expect(events).toHaveLength(3);
    expect((events[0].data as Record<string, unknown>).order).toBe(1);
    expect((events[1].data as Record<string, unknown>).order).toBe(2);
    expect((events[2].data as Record<string, unknown>).order).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// LessonRepository
// ---------------------------------------------------------------------------

describe("LessonRepository", () => {
  let db: TestDb;
  let repo: LessonRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new LessonRepository(db);
  });

  it("creates a lesson and returns the generated id", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      content: "Budget spikes on weekends",
      scope: "budget",
      confidence: "high",
      sourceEventIds: ["evt_001", "evt_002"],
      createdAt: new Date(),
    });

    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("gets a lesson by id", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      content: "Budget spikes on weekends",
      scope: "budget",
      confidence: "high",
      sourceEventIds: ["evt_001"],
      createdAt: new Date("2026-03-01T00:00:00Z"),
    });

    const lesson = await repo.getById(id);
    expect(lesson).toBeTruthy();
    expect(lesson!.id).toBe(id);
    expect(lesson!.content).toBe("Budget spikes on weekends");
    expect(lesson!.scope).toBe("budget");
    expect(lesson!.confidence).toBe("high");
    expect(lesson!.sourceEventIds).toEqual(["evt_001"]);
    expect(lesson!.createdAt).toBeInstanceOf(Date);
    expect(lesson!.expiresAt).toBeUndefined();
  });

  it("returns null for non-existent lesson", async () => {
    const lesson = await repo.getById("nonexistent");
    expect(lesson).toBeNull();
  });

  it("creates a lesson with expiresAt", async () => {
    const expiresAt = new Date("2026-06-01T00:00:00Z");
    const id = await repo.create({
      agentId: "agent_001",
      content: "Temporary insight",
      scope: "test",
      confidence: "low",
      sourceEventIds: [],
      createdAt: new Date(),
      expiresAt,
    });

    const lesson = await repo.getById(id);
    expect(lesson!.expiresAt).toBeInstanceOf(Date);
    expect(lesson!.expiresAt!.getTime()).toBe(expiresAt.getTime());
  });

  it("updates a lesson", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      content: "Original content",
      scope: "budget",
      confidence: "low",
      sourceEventIds: [],
      createdAt: new Date(),
    });

    await repo.update(id, {
      content: "Updated content",
      confidence: "high",
    });

    const lesson = await repo.getById(id);
    expect(lesson!.content).toBe("Updated content");
    expect(lesson!.confidence).toBe("high");
  });

  it("deletes a lesson", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      content: "To be deleted",
      scope: "test",
      confidence: "low",
      sourceEventIds: [],
      createdAt: new Date(),
    });

    await repo.delete(id);

    const lesson = await repo.getById(id);
    expect(lesson).toBeNull();
  });

  it("getActive returns lessons for agent filtered by scope", async () => {
    await repo.create({
      agentId: "agent_001",
      content: "Budget lesson",
      scope: "budget",
      confidence: "high",
      sourceEventIds: [],
      createdAt: new Date(),
    });
    await repo.create({
      agentId: "agent_001",
      content: "Trends lesson",
      scope: "trends",
      confidence: "medium",
      sourceEventIds: [],
      createdAt: new Date(),
    });

    const budgetLessons = await repo.getActive("agent_001", "budget");
    expect(budgetLessons).toHaveLength(1);
    expect(budgetLessons[0].content).toBe("Budget lesson");
  });

  it("getActive returns all active lessons when no scope given", async () => {
    await repo.create({
      agentId: "agent_001",
      content: "Lesson 1",
      scope: "budget",
      confidence: "high",
      sourceEventIds: [],
      createdAt: new Date(),
    });
    await repo.create({
      agentId: "agent_001",
      content: "Lesson 2",
      scope: "trends",
      confidence: "medium",
      sourceEventIds: [],
      createdAt: new Date(),
    });

    const lessons = await repo.getActive("agent_001");
    expect(lessons).toHaveLength(2);
  });

  it("getActive excludes expired lessons", async () => {
    const now = Date.now();

    // Active lesson (no expiry)
    await repo.create({
      agentId: "agent_001",
      content: "Permanent",
      scope: "budget",
      confidence: "high",
      sourceEventIds: [],
      createdAt: new Date(),
    });

    // Active lesson (future expiry)
    await repo.create({
      agentId: "agent_001",
      content: "Future expiry",
      scope: "budget",
      confidence: "medium",
      sourceEventIds: [],
      createdAt: new Date(),
      expiresAt: new Date(now + 86400000),
    });

    // Expired lesson (past expiry)
    await repo.create({
      agentId: "agent_001",
      content: "Expired",
      scope: "budget",
      confidence: "low",
      sourceEventIds: [],
      createdAt: new Date(),
      expiresAt: new Date(now - 86400000),
    });

    const active = await repo.getActive("agent_001");
    expect(active).toHaveLength(2);
    expect(active.map((l) => l.content).sort()).toEqual([
      "Future expiry",
      "Permanent",
    ]);
  });

  it("getActive only returns lessons for the specified agent", async () => {
    await repo.create({
      agentId: "agent_001",
      content: "Agent 1 lesson",
      scope: "budget",
      confidence: "high",
      sourceEventIds: [],
      createdAt: new Date(),
    });
    await repo.create({
      agentId: "agent_002",
      content: "Agent 2 lesson",
      scope: "budget",
      confidence: "high",
      sourceEventIds: [],
      createdAt: new Date(),
    });

    const lessons = await repo.getActive("agent_001");
    expect(lessons).toHaveLength(1);
    expect(lessons[0].content).toBe("Agent 1 lesson");
  });
});

// ---------------------------------------------------------------------------
// RunRepository
// ---------------------------------------------------------------------------

describe("RunRepository", () => {
  let db: TestDb;
  let repo: RunRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new RunRepository(db);
  });

  it("creates a run and returns the generated id", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      triggerType: "cron",
      startedAt: new Date("2026-03-15T10:00:00Z"),
    });

    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("gets a run by id", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      triggerType: "manual",
      startedAt: new Date("2026-03-15T10:00:00Z"),
    });

    const run = await repo.getById(id);
    expect(run).toBeTruthy();
    expect(run!.id).toBe(id);
    expect(run!.agentId).toBe("agent_001");
    expect(run!.triggerType).toBe("manual");
    expect(run!.startedAt).toBeInstanceOf(Date);
    expect(run!.completedAt).toBeUndefined();
    expect(run!.result).toBeUndefined();
  });

  it("returns null for non-existent run", async () => {
    const run = await repo.getById("nonexistent");
    expect(run).toBeNull();
  });

  it("completes a run with result", async () => {
    const id = await repo.create({
      agentId: "agent_001",
      triggerType: "cron",
      startedAt: new Date("2026-03-15T10:00:00Z"),
    });

    const completedAt = new Date("2026-03-15T10:05:00Z");
    const result = {
      runId: id,
      agentId: "agent_001",
      duration: 300000,
      steps: [],
      proposals: [],
      eventsLogged: 5,
    };

    await repo.complete(id, completedAt, result);

    const run = await repo.getById(id);
    expect(run!.completedAt).toBeInstanceOf(Date);
    expect(run!.completedAt!.getTime()).toBe(completedAt.getTime());
    expect(run!.result).toEqual(result);
  });

  it("queries runs by agent", async () => {
    await repo.create({
      agentId: "agent_001",
      triggerType: "cron",
      startedAt: new Date(),
    });
    await repo.create({
      agentId: "agent_001",
      triggerType: "manual",
      startedAt: new Date(),
    });
    await repo.create({
      agentId: "agent_002",
      triggerType: "cron",
      startedAt: new Date(),
    });

    const runs = await repo.getByAgent("agent_001");
    expect(runs).toHaveLength(2);
    runs.forEach((r) => expect(r.agentId).toBe("agent_001"));
  });

  it("queries runs by agent with limit", async () => {
    for (let i = 0; i < 5; i++) {
      await repo.create({
        agentId: "agent_001",
        triggerType: "cron",
        startedAt: new Date(Date.now() + i * 1000),
      });
    }

    const runs = await repo.getByAgent("agent_001", 3);
    expect(runs).toHaveLength(3);
  });

  it("returns runs ordered by startedAt descending (most recent first)", async () => {
    const t1 = new Date("2026-03-01T00:00:00Z");
    const t2 = new Date("2026-03-02T00:00:00Z");
    const t3 = new Date("2026-03-03T00:00:00Z");

    await repo.create({ agentId: "agent_001", triggerType: "cron", startedAt: t1 });
    await repo.create({ agentId: "agent_001", triggerType: "cron", startedAt: t3 });
    await repo.create({ agentId: "agent_001", triggerType: "cron", startedAt: t2 });

    const runs = await repo.getByAgent("agent_001");
    expect(runs[0].startedAt.getTime()).toBe(t3.getTime());
    expect(runs[1].startedAt.getTime()).toBe(t2.getTime());
    expect(runs[2].startedAt.getTime()).toBe(t1.getTime());
  });
});

// ---------------------------------------------------------------------------
// ApprovalRepository
// ---------------------------------------------------------------------------

describe("ApprovalRepository", () => {
  let db: TestDb;
  let repo: ApprovalRepository;

  const sampleProposal: ActionProposal = {
    id: "prop_001",
    action: "add_negative_keyword",
    toolCategory: "google_ads",
    args: { keyword: "free", matchType: "BROAD" },
    reason: "Irrelevant traffic",
    confidence: 0.92,
    skillSource: "search_terms_analyzer",
    reversible: true,
    idempotencyKey: "neg_free_broad_001",
  };

  beforeEach(() => {
    db = createTestDb();
    repo = new ApprovalRepository(db);
  });

  it("queues a pending action and returns the generated id", async () => {
    const id = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });

    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("gets a pending action by id", async () => {
    const id = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });

    const action = await repo.getById(id);
    expect(action).toBeTruthy();
    expect(action!.id).toBe(id);
    expect(action!.status).toBe("pending");
    expect(action!.proposal).toEqual(sampleProposal);
    expect(action!.createdAt).toBeInstanceOf(Date);
    expect(action!.resolvedAt).toBeUndefined();
    expect(action!.resolvedReason).toBeUndefined();
  });

  it("returns null for non-existent action", async () => {
    const action = await repo.getById("nonexistent");
    expect(action).toBeNull();
  });

  it("resolves an action as approved", async () => {
    const id = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });

    await repo.resolve(id, "approved", "Looks good to me");

    const action = await repo.getById(id);
    expect(action!.status).toBe("approved");
    expect(action!.resolvedAt).toBeInstanceOf(Date);
    expect(action!.resolvedReason).toBe("Looks good to me");
  });

  it("resolves an action as rejected", async () => {
    const id = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });

    await repo.resolve(id, "rejected", "Too risky");

    const action = await repo.getById(id);
    expect(action!.status).toBe("rejected");
    expect(action!.resolvedReason).toBe("Too risky");
  });

  it("resolves an action as expired", async () => {
    const id = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });

    await repo.resolve(id, "expired", "Timed out after 24h");

    const action = await repo.getById(id);
    expect(action!.status).toBe("expired");
  });

  it("queries actions by agent and status", async () => {
    await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });

    const id2 = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: { ...sampleProposal, id: "prop_002" },
    });
    await repo.resolve(id2, "approved", "ok");

    await repo.queue({
      runId: "run_002",
      agentId: "agent_002",
      proposal: { ...sampleProposal, id: "prop_003" },
    });

    const pending = await repo.getByAgentAndStatus("agent_001", "pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].status).toBe("pending");

    const approved = await repo.getByAgentAndStatus("agent_001", "approved");
    expect(approved).toHaveLength(1);
    expect(approved[0].status).toBe("approved");
  });

  it("queries all actions by agent (no status filter)", async () => {
    await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: sampleProposal,
    });
    const id2 = await repo.queue({
      runId: "run_001",
      agentId: "agent_001",
      proposal: { ...sampleProposal, id: "prop_002" },
    });
    await repo.resolve(id2, "approved", "ok");

    const all = await repo.getByAgentAndStatus("agent_001");
    expect(all).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// ChatSessionStore
// ---------------------------------------------------------------------------

describe("ChatSessionStore", () => {
  let db: TestDb;
  let store: ChatSessionStore;

  beforeEach(() => {
    db = createTestDb();
    store = new ChatSessionStore(db);
  });

  it("appends a message and returns the generated id", async () => {
    const id = await store.append({
      agentId: "agent_001",
      role: "user",
      content: "Why did CPL spike?",
    });

    expect(id).toBeTruthy();
    expect(typeof id).toBe("string");
  });

  it("appends a tool message with toolCallId", async () => {
    const id = await store.append({
      agentId: "agent_001",
      role: "tool",
      content: JSON.stringify({ result: "done" }),
      toolCallId: "call_abc",
    });

    const history = await store.loadHistory("agent_001");
    expect(history).toHaveLength(1);
    expect(history[0].role).toBe("tool");
    expect(history[0].toolCallId).toBe("call_abc");
  });

  it("loads history ordered by createdAt ASC", async () => {
    const t1 = new Date("2026-03-01T00:00:00Z");
    const t2 = new Date("2026-03-01T00:01:00Z");
    const t3 = new Date("2026-03-01T00:02:00Z");

    // Insert out of order
    await store.append({
      agentId: "agent_001",
      role: "assistant",
      content: "Second response",
      createdAt: t2,
    });
    await store.append({
      agentId: "agent_001",
      role: "user",
      content: "First message",
      createdAt: t1,
    });
    await store.append({
      agentId: "agent_001",
      role: "user",
      content: "Third message",
      createdAt: t3,
    });

    const history = await store.loadHistory("agent_001");
    expect(history).toHaveLength(3);
    expect(history[0].content).toBe("First message");
    expect(history[1].content).toBe("Second response");
    expect(history[2].content).toBe("Third message");
  });

  it("loads history with limit", async () => {
    for (let i = 0; i < 10; i++) {
      await store.append({
        agentId: "agent_001",
        role: "user",
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000),
      });
    }

    const history = await store.loadHistory("agent_001", 5);
    expect(history).toHaveLength(5);
  });

  it("limit returns the most recent messages (ordered ASC)", async () => {
    for (let i = 0; i < 10; i++) {
      await store.append({
        agentId: "agent_001",
        role: "user",
        content: `Message ${i}`,
        createdAt: new Date(Date.now() + i * 1000),
      });
    }

    const history = await store.loadHistory("agent_001", 3);
    expect(history).toHaveLength(3);
    // Should be the LAST 3 messages, in ASC order
    expect(history[0].content).toBe("Message 7");
    expect(history[1].content).toBe("Message 8");
    expect(history[2].content).toBe("Message 9");
  });

  it("only loads history for the specified agent", async () => {
    await store.append({
      agentId: "agent_001",
      role: "user",
      content: "Agent 1 message",
    });
    await store.append({
      agentId: "agent_002",
      role: "user",
      content: "Agent 2 message",
    });

    const history = await store.loadHistory("agent_001");
    expect(history).toHaveLength(1);
    expect(history[0].content).toBe("Agent 1 message");
  });

  it("returns messages with Date objects for createdAt", async () => {
    const ts = new Date("2026-03-15T12:30:00Z");
    await store.append({
      agentId: "agent_001",
      role: "user",
      content: "Hello",
      createdAt: ts,
    });

    const history = await store.loadHistory("agent_001");
    expect(history[0].createdAt).toBeInstanceOf(Date);
    expect(history[0].createdAt.getTime()).toBe(ts.getTime());
  });

  it("returns undefined for toolCallId when not set", async () => {
    await store.append({
      agentId: "agent_001",
      role: "user",
      content: "Hello",
    });

    const history = await store.loadHistory("agent_001");
    expect(history[0].toolCallId).toBeUndefined();
  });
});
