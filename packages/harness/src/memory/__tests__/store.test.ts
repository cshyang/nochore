import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../../db/client";
import { SqliteMemoryStore } from "../store";
import type { AgentEvent } from "../../types/memory";

type TestDb = ReturnType<typeof createTestDb>;

describe("SqliteMemoryStore", () => {
  let db: TestDb;
  let store: SqliteMemoryStore;

  beforeEach(() => {
    db = createTestDb();
    store = new SqliteMemoryStore(db);
  });

  // -------------------------------------------------------------------------
  // appendEvent + queryEvents roundtrip
  // -------------------------------------------------------------------------

  describe("appendEvent", () => {
    it("returns a generated id string", async () => {
      const id = await store.appendEvent({
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
      const id1 = await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });
      const id2 = await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "action_proposed",
        data: {},
      });

      expect(id1).not.toBe(id2);
    });
  });

  // -------------------------------------------------------------------------
  // queryEvents
  // -------------------------------------------------------------------------

  describe("queryEvents", () => {
    it("roundtrips an event through append and query", async () => {
      const ts = new Date("2026-03-15T12:30:00Z");
      const id = await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: ts,
        type: "skill_output",
        data: { key: "value", nested: { a: 1 } },
      });

      const events = await store.queryEvents({ agentId: "agent_001" });
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe(id);
      expect(events[0].runId).toBe("run_001");
      expect(events[0].agentId).toBe("agent_001");
      expect(events[0].timestamp).toBeInstanceOf(Date);
      expect(events[0].timestamp.getTime()).toBe(ts.getTime());
      expect(events[0].type).toBe("skill_output");
      expect(events[0].data).toEqual({ key: "value", nested: { a: 1 } });
    });

    it("filters by agentId", async () => {
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_002",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });

      const events = await store.queryEvents({ agentId: "agent_001" });
      expect(events).toHaveLength(1);
      expect(events[0].agentId).toBe("agent_001");
    });

    it("filters by runId", async () => {
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_002",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "action_proposed",
        data: {},
      });

      const events = await store.queryEvents({ runId: "run_001" });
      expect(events).toHaveLength(1);
      expect(events[0].runId).toBe("run_001");
    });

    it("filters by single type (string)", async () => {
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "action_proposed",
        data: {},
      });

      const events = await store.queryEvents({ type: "skill_output" });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("skill_output");
    });

    it("filters by type as array", async () => {
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "action_proposed",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "run_started",
        data: {},
      });

      const events = await store.queryEvents({
        type: ["skill_output", "action_proposed"],
      });
      expect(events).toHaveLength(2);
    });

    it("filters by since (Date-based)", async () => {
      const t1 = new Date("2026-03-01T00:00:00Z");
      const t2 = new Date("2026-03-02T00:00:00Z");
      const t3 = new Date("2026-03-03T00:00:00Z");

      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t1,
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t3,
        type: "action_proposed",
        data: {},
      });

      const events = await store.queryEvents({ since: t2 });
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("action_proposed");
    });

    it("applies limit", async () => {
      for (let i = 0; i < 5; i++) {
        await store.appendEvent({
          runId: "run_001",
          agentId: "agent_001",
          timestamp: new Date(Date.now() + i * 1000),
          type: "skill_output",
          data: { i },
        });
      }

      const events = await store.queryEvents({
        agentId: "agent_001",
        limit: 3,
      });
      expect(events).toHaveLength(3);
    });

    it("combines multiple filters", async () => {
      const t1 = new Date("2026-03-01T00:00:00Z");
      const t2 = new Date("2026-03-02T00:00:00Z");

      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t1,
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t2,
        type: "action_proposed",
        data: {},
      });
      await store.appendEvent({
        runId: "run_002",
        agentId: "agent_002",
        timestamp: t2,
        type: "skill_output",
        data: {},
      });

      const events = await store.queryEvents({
        agentId: "agent_001",
        type: "skill_output",
      });
      expect(events).toHaveLength(1);
      expect(events[0].agentId).toBe("agent_001");
      expect(events[0].type).toBe("skill_output");
    });

    it("returns events ordered by timestamp ascending", async () => {
      const t1 = new Date("2026-03-01T00:00:00Z");
      const t2 = new Date("2026-03-02T00:00:00Z");
      const t3 = new Date("2026-03-03T00:00:00Z");

      // Insert out of order
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t3,
        type: "skill_output",
        data: { order: 3 },
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t1,
        type: "skill_output",
        data: { order: 1 },
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t2,
        type: "skill_output",
        data: { order: 2 },
      });

      const events = await store.queryEvents({ agentId: "agent_001" });
      expect(events).toHaveLength(3);
      expect((events[0].data as Record<string, unknown>).order).toBe(1);
      expect((events[1].data as Record<string, unknown>).order).toBe(2);
      expect((events[2].data as Record<string, unknown>).order).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // getRecentEvents
  // -------------------------------------------------------------------------

  describe("getRecentEvents", () => {
    it("returns events in DESC order (most recent first)", async () => {
      const t1 = new Date("2026-03-01T00:00:00Z");
      const t2 = new Date("2026-03-02T00:00:00Z");
      const t3 = new Date("2026-03-03T00:00:00Z");

      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t1,
        type: "skill_output",
        data: { order: 1 },
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t2,
        type: "skill_output",
        data: { order: 2 },
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: t3,
        type: "skill_output",
        data: { order: 3 },
      });

      const events = await store.getRecentEvents("agent_001");
      expect(events).toHaveLength(3);
      expect((events[0].data as Record<string, unknown>).order).toBe(3);
      expect((events[1].data as Record<string, unknown>).order).toBe(2);
      expect((events[2].data as Record<string, unknown>).order).toBe(1);
    });

    it("defaults to limit of 50", async () => {
      for (let i = 0; i < 60; i++) {
        await store.appendEvent({
          runId: "run_001",
          agentId: "agent_001",
          timestamp: new Date(Date.now() + i * 1000),
          type: "skill_output",
          data: { i },
        });
      }

      const events = await store.getRecentEvents("agent_001");
      expect(events).toHaveLength(50);
    });

    it("respects custom limit", async () => {
      for (let i = 0; i < 10; i++) {
        await store.appendEvent({
          runId: "run_001",
          agentId: "agent_001",
          timestamp: new Date(Date.now() + i * 1000),
          type: "skill_output",
          data: { i },
        });
      }

      const events = await store.getRecentEvents("agent_001", 3);
      expect(events).toHaveLength(3);
      // Should be the 3 most recent
      expect((events[0].data as Record<string, unknown>).i).toBe(9);
      expect((events[1].data as Record<string, unknown>).i).toBe(8);
      expect((events[2].data as Record<string, unknown>).i).toBe(7);
    });

    it("only returns events for the specified agent", async () => {
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_002",
        timestamp: new Date(),
        type: "skill_output",
        data: {},
      });

      const events = await store.getRecentEvents("agent_001");
      expect(events).toHaveLength(1);
      expect(events[0].agentId).toBe("agent_001");
    });
  });

  // -------------------------------------------------------------------------
  // getLessons
  // -------------------------------------------------------------------------

  describe("getLessons", () => {
    it("returns lessons for an agent", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Budget spikes on weekends",
          scope: "budget",
          confidence: "high",
          sourceEventIds: ["evt_001", "evt_002"],
          createdAt: new Date("2026-03-01T00:00:00Z"),
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons).toHaveLength(1);
      expect(lessons[0].content).toBe("Budget spikes on weekends");
      expect(lessons[0].scope).toBe("budget");
      expect(lessons[0].confidence).toBe("high");
      expect(lessons[0].sourceEventIds).toEqual(["evt_001", "evt_002"]);
      expect(lessons[0].createdAt).toBeInstanceOf(Date);
      expect(lessons[0].id).toBeTruthy();
    });

    it("filters by scope when provided", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Budget lesson",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
        {
          agentId: "agent_001",
          content: "Trends lesson",
          scope: "trends",
          confidence: "medium",
          sourceEventIds: [],
          createdAt: new Date(),
        },
      ]);

      const budgetLessons = await store.getLessons("agent_001", "budget");
      expect(budgetLessons).toHaveLength(1);
      expect(budgetLessons[0].content).toBe("Budget lesson");
    });

    it("returns all scopes when scope is not provided", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Budget lesson",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
        {
          agentId: "agent_001",
          content: "Trends lesson",
          scope: "trends",
          confidence: "medium",
          sourceEventIds: [],
          createdAt: new Date(),
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons).toHaveLength(2);
    });

    it("excludes expired lessons", async () => {
      const now = Date.now();

      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Permanent",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
          // no expiresAt
        },
        {
          agentId: "agent_001",
          content: "Future expiry",
          scope: "budget",
          confidence: "medium",
          sourceEventIds: [],
          createdAt: new Date(),
          expiresAt: new Date(now + 86400000),
        },
        {
          agentId: "agent_001",
          content: "Expired",
          scope: "budget",
          confidence: "low",
          sourceEventIds: [],
          createdAt: new Date(),
          expiresAt: new Date(now - 86400000),
        },
      ]);

      const active = await store.getLessons("agent_001");
      expect(active).toHaveLength(2);
      expect(active.map((l) => l.content).sort()).toEqual([
        "Future expiry",
        "Permanent",
      ]);
    });

    it("only returns lessons for the specified agent", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Agent 1 lesson",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
        {
          agentId: "agent_002",
          content: "Agent 2 lesson",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons).toHaveLength(1);
      expect(lessons[0].content).toBe("Agent 1 lesson");
    });
  });

  // -------------------------------------------------------------------------
  // saveLessons
  // -------------------------------------------------------------------------

  describe("saveLessons", () => {
    it("batch inserts multiple lessons", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Lesson 1",
          scope: "budget",
          confidence: "high",
          sourceEventIds: ["evt_001"],
          createdAt: new Date("2026-03-01T00:00:00Z"),
        },
        {
          agentId: "agent_001",
          content: "Lesson 2",
          scope: "trends",
          confidence: "medium",
          sourceEventIds: ["evt_002", "evt_003"],
          createdAt: new Date("2026-03-02T00:00:00Z"),
        },
        {
          agentId: "agent_001",
          content: "Lesson 3",
          scope: "budget",
          confidence: "low",
          sourceEventIds: [],
          createdAt: new Date("2026-03-03T00:00:00Z"),
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons).toHaveLength(3);
    });

    it("generates unique ids for each lesson", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Lesson 1",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
        {
          agentId: "agent_001",
          content: "Lesson 2",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons[0].id).not.toBe(lessons[1].id);
    });

    it("correctly converts Date to integer and back", async () => {
      const createdAt = new Date("2026-03-15T12:30:00Z");
      const expiresAt = new Date("2026-06-01T00:00:00Z");

      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "With dates",
          scope: "budget",
          confidence: "high",
          sourceEventIds: ["evt_001"],
          createdAt,
          expiresAt,
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons[0].createdAt).toBeInstanceOf(Date);
      expect(lessons[0].createdAt.getTime()).toBe(createdAt.getTime());
      expect(lessons[0].expiresAt).toBeInstanceOf(Date);
      expect(lessons[0].expiresAt!.getTime()).toBe(expiresAt.getTime());
    });

    it("handles empty array gracefully", async () => {
      await store.saveLessons([]);
      const lessons = await store.getLessons("agent_001");
      expect(lessons).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // expireLesson
  // -------------------------------------------------------------------------

  describe("expireLesson", () => {
    it("sets expiresAt to now, making the lesson excluded from getLessons", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "To be expired",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
      ]);

      const before = await store.getLessons("agent_001");
      expect(before).toHaveLength(1);

      await store.expireLesson(before[0].id);

      const after = await store.getLessons("agent_001");
      expect(after).toHaveLength(0);
    });

    it("only expires the specified lesson", async () => {
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Keep this",
          scope: "budget",
          confidence: "high",
          sourceEventIds: [],
          createdAt: new Date(),
        },
        {
          agentId: "agent_001",
          content: "Expire this",
          scope: "budget",
          confidence: "low",
          sourceEventIds: [],
          createdAt: new Date(),
        },
      ]);

      const all = await store.getLessons("agent_001");
      const toExpire = all.find((l) => l.content === "Expire this")!;
      await store.expireLesson(toExpire.id);

      const remaining = await store.getLessons("agent_001");
      expect(remaining).toHaveLength(1);
      expect(remaining[0].content).toBe("Keep this");
    });
  });

  // -------------------------------------------------------------------------
  // Date/integer conversion correctness
  // -------------------------------------------------------------------------

  describe("Date/integer conversion", () => {
    it("preserves millisecond precision for event timestamps", async () => {
      const ts = new Date("2026-03-15T12:30:45.123Z");
      await store.appendEvent({
        runId: "run_001",
        agentId: "agent_001",
        timestamp: ts,
        type: "skill_output",
        data: {},
      });

      const events = await store.queryEvents({ agentId: "agent_001" });
      expect(events[0].timestamp.getTime()).toBe(ts.getTime());
    });

    it("preserves millisecond precision for lesson createdAt", async () => {
      const ts = new Date("2026-03-15T12:30:45.456Z");
      await store.saveLessons([
        {
          agentId: "agent_001",
          content: "Precise timing",
          scope: "test",
          confidence: "high",
          sourceEventIds: [],
          createdAt: ts,
        },
      ]);

      const lessons = await store.getLessons("agent_001");
      expect(lessons[0].createdAt.getTime()).toBe(ts.getTime());
    });
  });
});
