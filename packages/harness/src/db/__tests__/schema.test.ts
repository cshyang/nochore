import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../client";
import {
  projects,
  agents,
  agentEvents,
  lessons,
  runs,
  pendingActions,
  chatMessages,
  connections,
} from "../schema";
import { eq, and } from "drizzle-orm";

describe("Database schema", () => {
  let db: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    db = createTestDb();
  });

  describe("projects", () => {
    it("inserts and queries a project", () => {
      db.insert(projects)
        .values({
          id: "proj_001",
          name: "Acme Corp",
          icon: "building",
          color: "#6C5CE7",
          createdAt: Date.now(),
        })
        .run();
      const result = db
        .select()
        .from(projects)
        .where(eq(projects.id, "proj_001"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("Acme Corp");
    });
  });

  describe("agents", () => {
    it("inserts and queries an agent", () => {
      // First insert project (foreign key)
      db.insert(projects)
        .values({ id: "proj_001", name: "Test", createdAt: Date.now() })
        .run();
      db.insert(agents)
        .values({
          id: "agent_001",
          projectId: "proj_001",
          config: JSON.stringify({
            name: "Ad Spend Guardian",
            intent: "Monitor ads",
          }),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        })
        .run();
      const result = db
        .select()
        .from(agents)
        .where(eq(agents.id, "agent_001"))
        .all();
      expect(result).toHaveLength(1);
    });
  });

  describe("agentEvents", () => {
    it("inserts and queries events by agentId", () => {
      db.insert(agentEvents)
        .values([
          {
            id: "evt_001",
            runId: "run_047",
            agentId: "agent_001",
            timestamp: Date.now(),
            type: "skill_output",
            data: JSON.stringify({ findings: 5 }),
          },
          {
            id: "evt_002",
            runId: "run_047",
            agentId: "agent_001",
            timestamp: Date.now(),
            type: "action_proposed",
            data: JSON.stringify({ action: "add_negative" }),
          },
          {
            id: "evt_003",
            runId: "run_047",
            agentId: "agent_002",
            timestamp: Date.now(),
            type: "skill_output",
            data: JSON.stringify({ findings: 2 }),
          },
        ])
        .run();
      const result = db
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.agentId, "agent_001"))
        .all();
      expect(result).toHaveLength(2);
    });

    it("queries events by type", () => {
      db.insert(agentEvents)
        .values([
          {
            id: "evt_001",
            runId: "run_047",
            agentId: "agent_001",
            timestamp: Date.now(),
            type: "skill_output",
            data: "{}",
          },
          {
            id: "evt_002",
            runId: "run_047",
            agentId: "agent_001",
            timestamp: Date.now(),
            type: "action_proposed",
            data: "{}",
          },
        ])
        .run();
      const result = db
        .select()
        .from(agentEvents)
        .where(eq(agentEvents.type, "skill_output"))
        .all();
      expect(result).toHaveLength(1);
    });
  });

  describe("lessons", () => {
    it("inserts and queries lessons by agentId and scope", () => {
      db.insert(lessons)
        .values([
          {
            id: "les_001",
            agentId: "agent_001",
            content: "Budget protected Q2",
            scope: "budget",
            confidence: "high",
            sourceEventIds: JSON.stringify(["evt_001"]),
            createdAt: Date.now(),
          },
          {
            id: "les_002",
            agentId: "agent_001",
            content: "Weekend patterns differ",
            scope: "trends",
            confidence: "medium",
            sourceEventIds: JSON.stringify(["evt_002"]),
            createdAt: Date.now(),
          },
        ])
        .run();
      const result = db
        .select()
        .from(lessons)
        .where(
          and(eq(lessons.agentId, "agent_001"), eq(lessons.scope, "budget"))
        )
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe("Budget protected Q2");
    });

    it("handles lessons with and without expiry", () => {
      const now = Date.now();
      db.insert(lessons)
        .values([
          {
            id: "les_001",
            agentId: "agent_001",
            content: "Temporary",
            scope: "test",
            confidence: "low",
            sourceEventIds: "[]",
            createdAt: now,
            expiresAt: now + 86400000,
          },
          {
            id: "les_002",
            agentId: "agent_001",
            content: "Permanent",
            scope: "test",
            confidence: "high",
            sourceEventIds: "[]",
            createdAt: now,
          },
        ])
        .run();
      const all = db
        .select()
        .from(lessons)
        .where(eq(lessons.agentId, "agent_001"))
        .all();
      expect(all).toHaveLength(2);
      expect(all.find((l) => l.id === "les_001")?.expiresAt).toBeTruthy();
      expect(all.find((l) => l.id === "les_002")?.expiresAt).toBeNull();
    });
  });

  describe("runs", () => {
    it("inserts and queries a run", () => {
      db.insert(runs)
        .values({
          id: "run_047",
          agentId: "agent_001",
          triggerType: "cron",
          startedAt: Date.now(),
          completedAt: Date.now() + 8000,
          result: JSON.stringify({ proposals: 2, executed: 1 }),
        })
        .run();
      const result = db
        .select()
        .from(runs)
        .where(eq(runs.agentId, "agent_001"))
        .all();
      expect(result).toHaveLength(1);
    });
  });

  describe("pendingActions", () => {
    it("inserts and queries pending actions", () => {
      db.insert(pendingActions)
        .values({
          id: "pa_001",
          runId: "run_047",
          agentId: "agent_001",
          proposal: JSON.stringify({
            action: "reduce_budget",
            confidence: 0.78,
          }),
          status: "pending",
          createdAt: Date.now(),
        })
        .run();
      const result = db
        .select()
        .from(pendingActions)
        .where(eq(pendingActions.status, "pending"))
        .all();
      expect(result).toHaveLength(1);
    });
  });

  describe("chatMessages", () => {
    it("inserts and queries chat messages by agentId", () => {
      const now = Date.now();
      db.insert(chatMessages)
        .values([
          { id: "msg_001", agentId: "agent_001", role: "user", content: "Why did CPL spike?", createdAt: now },
          { id: "msg_002", agentId: "agent_001", role: "assistant", content: "CPL spiked due to...", createdAt: now + 1000 },
          { id: "msg_003", agentId: "agent_002", role: "user", content: "Different agent", createdAt: now },
        ])
        .run();
      const result = db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.agentId, "agent_001"))
        .all();
      expect(result).toHaveLength(2);
    });

    it("stores tool call messages", () => {
      db.insert(chatMessages)
        .values({
          id: "msg_004",
          agentId: "agent_001",
          role: "tool",
          content: JSON.stringify({ result: "Analysis complete" }),
          toolCallId: "call_abc123",
          createdAt: Date.now(),
        })
        .run();
      const result = db
        .select()
        .from(chatMessages)
        .where(eq(chatMessages.role, "tool"))
        .all();
      expect(result).toHaveLength(1);
      expect(result[0].toolCallId).toBe("call_abc123");
    });
  });

  describe("connections", () => {
    it("inserts and queries a connection", () => {
      db.insert(projects)
        .values({ id: "proj_001", name: "Test", createdAt: Date.now() })
        .run();
      db.insert(connections)
        .values({
          id: "conn_001",
          projectId: "proj_001",
          provider: "google_ads",
          composioEntityId: "entity_abc",
          status: "active",
          config: JSON.stringify({ accountId: "123-456-7890" }),
          createdAt: Date.now(),
        })
        .run();
      const result = db
        .select()
        .from(connections)
        .where(eq(connections.provider, "google_ads"))
        .all();
      expect(result).toHaveLength(1);
    });
  });
});
