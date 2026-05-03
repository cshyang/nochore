import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, createTestDb } from "../client";
import {
  agents,
  agentTasks,
  approvals,
  connections,
  conversationCheckpoints,
  conversationEvents,
  conversationThreads,
  learnedPolicyRules,
  lessons,
  projects,
  runEvents,
  runs,
} from "../schema";

describe("simplified schema", () => {
  it("stores agents with the new persisted contract", () => {
    const db = createTestDb();
    const now = Date.now();

    db.insert(projects)
      .values({
        id: "proj_001",
        name: "Homescape",
        createdAt: now,
      })
      .run();

    db.insert(agents)
      .values({
        id: "agent_001",
        projectId: "proj_001",
        name: "Budget Guardian",
        description: "Protects paid media efficiency",
        instructions: "Watch spend and waste closely.",
        skills: JSON.stringify(["campaign-analysis"]),
        toolConfig: JSON.stringify({
          globalApprovalRequired: false,
          requiredProviders: [{ provider: "googleads", reason: "Reads campaigns" }],
          tools: {},
        }),
        notificationConfig: JSON.stringify({ inApp: true, email: false, slack: true }),
        schedule: "daily",
        status: "draft",
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const row = db.select().from(agents).where(eq(agents.id, "agent_001")).get();
    expect(row?.name).toBe("Budget Guardian");
    expect(row?.schedule).toBe("daily");
    expect(JSON.parse(row?.skills ?? "[]")).toEqual(["campaign-analysis"]);
  });

  it("stores runs, run events, and approvals on the same execution surface", () => {
    const db = createTestDb();
    const now = Date.now();

    db.insert(runs)
      .values({
        id: "run_001",
        agentId: "agent_001",
        triggerType: "manual",
        status: "waiting_for_approval",
        startedAt: now,
      })
      .run();

    db.insert(runEvents)
      .values([
        {
          id: "evt_001",
          runId: "run_001",
          agentId: "agent_001",
          timestamp: now,
          type: "run_started",
          payload: JSON.stringify({ triggerType: "manual" }),
        },
        {
          id: "evt_002",
          runId: "run_001",
          agentId: "agent_001",
          timestamp: now + 1,
          type: "tool_approval_requested",
          payload: JSON.stringify({ toolName: "googleads_adjust_budget" }),
        },
      ])
      .run();

    db.insert(approvals)
      .values({
        id: "approval_row_001",
        runId: "run_001",
        agentId: "agent_001",
        approvalId: "approval_sdk_001",
        waitTokenId: "wait_001",
        toolName: "googleads_adjust_budget",
        toolInput: JSON.stringify({ campaignId: "123", amount: 50 }),
        status: "pending",
        requestReason: "Budget changes require approval",
        requestEventId: "evt_002",
        createdAt: now,
        expiresAt: now + 86_400_000,
      })
      .run();

    const eventRows = db.select().from(runEvents).where(eq(runEvents.runId, "run_001")).all();
    const approvalRow = db.select().from(approvals).where(eq(approvals.id, "approval_row_001")).get();

    expect(eventRows).toHaveLength(2);
    expect(eventRows[1]?.type).toBe("tool_approval_requested");
    expect(approvalRow?.waitTokenId).toBe("wait_001");
    expect(approvalRow?.status).toBe("pending");
    expect(approvalRow?.requestReason).toBe("Budget changes require approval");
    expect(approvalRow?.requestEventId).toBe("evt_002");
  });

  it("stores lessons and slim project connections", () => {
    const db = createTestDb();
    const now = Date.now();

    db.insert(lessons)
      .values({
        id: "lesson_001",
        agentId: "agent_001",
        content: "Search terms with student intent should be excluded.",
        scope: "search_terms",
        confidence: "high",
        sourceEventIds: JSON.stringify(["evt_001", "evt_002"]),
        createdAt: now,
      })
      .run();

    db.insert(connections)
      .values({
        id: "conn_001",
        projectId: "proj_001",
        provider: "googleads",
        composioEntityId: "entity_001",
        status: "active",
        config: JSON.stringify({ accountId: "123-456-7890" }),
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const lessonRow = db.select().from(lessons).where(eq(lessons.id, "lesson_001")).get();
    const connectionRow = db.select().from(connections).where(eq(connections.id, "conn_001")).get();

    expect(JSON.parse(lessonRow?.sourceEventIds ?? "[]")).toEqual(["evt_001", "evt_002"]);
    expect(connectionRow?.provider).toBe("googleads");
    expect(connectionRow?.status).toBe("active");
  });

  it("stores conversation threads, events, and checkpoints", () => {
    const db = createTestDb();
    const now = Date.now();

    db.insert(conversationThreads)
      .values({
        id: "thread_001",
        agentId: "agent_001",
        scope: "primary",
        channelKind: "web",
        title: "Main chat",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .run();

    db.insert(conversationEvents)
      .values({
        id: "evt_msg_001",
        threadId: "thread_001",
        agentId: "agent_001",
        source: "web",
        role: "assistant",
        eventType: "message",
        messageId: "msg_001",
        eventKey: null,
        payload: JSON.stringify({
          messageId: "msg_001",
          parts: [{ type: "text", text: "Persisted answer" }],
        }),
        createdAt: now,
      })
      .run();

    db.insert(conversationCheckpoints)
      .values({
        id: "checkpoint_001",
        threadId: "thread_001",
        kind: "rolling_summary",
        summary: "Earlier conversation summary",
        messageCount: 1,
        estimatedTokens: 42,
        coversThroughMessageId: "msg_001",
        summaryVersion: 2,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const threadRow = db.select().from(conversationThreads).where(eq(conversationThreads.id, "thread_001")).get();
    const eventRow = db.select().from(conversationEvents).where(eq(conversationEvents.id, "evt_msg_001")).get();
    const checkpointRow = db
      .select()
      .from(conversationCheckpoints)
      .where(eq(conversationCheckpoints.id, "checkpoint_001"))
      .get();

    expect(threadRow?.scope).toBe("primary");
    expect(eventRow?.messageId).toBe("msg_001");
    expect(checkpointRow?.messageCount).toBe(1);
    expect(checkpointRow?.estimatedTokens).toBe(42);
    expect(checkpointRow?.summaryVersion).toBe(2);
  });

  it("allows multiple manual conversation threads while keeping one primary thread per agent", () => {
    const db = createTestDb();
    const now = Date.now();

    db.insert(conversationThreads)
      .values({
        id: "thread_primary",
        agentId: "agent_001",
        scope: "primary",
        channelKind: "web",
        title: "Main chat",
        createdAt: now,
        updatedAt: now,
        lastMessageAt: now,
      })
      .run();

    db.insert(conversationThreads)
      .values([
        {
          id: "thread_manual_001",
          agentId: "agent_001",
          scope: "manual",
          channelKind: "web",
          title: "New thread",
          createdAt: now + 1,
          updatedAt: now + 1,
          lastMessageAt: null,
        },
        {
          id: "thread_manual_002",
          agentId: "agent_001",
          scope: "manual",
          channelKind: "web",
          title: "Second thread",
          createdAt: now + 2,
          updatedAt: now + 2,
          lastMessageAt: null,
        },
      ])
      .run();

    expect(() =>
      db
        .insert(conversationThreads)
        .values({
          id: "thread_primary_duplicate",
          agentId: "agent_001",
          scope: "primary",
          channelKind: "web",
          title: "Duplicate main chat",
          createdAt: now + 3,
          updatedAt: now + 3,
          lastMessageAt: null,
        })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);

    const rows = db.select().from(conversationThreads).where(eq(conversationThreads.agentId, "agent_001")).all();
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.scope === "manual")).toHaveLength(2);
    expect(rows.filter((row) => row.scope === "primary")).toHaveLength(1);
  });

  it("runtime reset preserves identity and configuration while clearing old runtime records", () => {
    const dir = mkdtempSync(join(tmpdir(), "nochore-schema-"));
    try {
      const dbPath = join(dir, "project.db");
      const db = createDb(dbPath);
      const now = Date.now();

      db.insert(projects).values({ id: "proj_001", name: "Homescape", createdAt: now }).run();
      db.insert(agents)
        .values({
          id: "agent_001",
          projectId: "proj_001",
          name: "Budget Guardian",
          description: "Protects paid media efficiency",
          instructions: "Watch spend and waste closely.",
          skills: "[]",
          toolConfig: JSON.stringify({
            globalApprovalRequired: false,
            requiredProviders: [],
            tools: {
              spawn_sub_run: {
                toolName: "spawn_sub_run",
                slug: "spawn_sub_run",
                provider: "internal",
                title: "Spawn sub-run",
                description: "Legacy delegation tool",
                mode: "write",
                approvalMode: "auto",
              },
            },
          }),
          notificationConfig: "{}",
          schedule: "manual",
          status: "live",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(connections)
        .values({
          id: "conn_001",
          projectId: "proj_001",
          provider: "googleads",
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      db.insert(lessons)
        .values([
          {
            id: "lesson_durable",
            agentId: "agent_001",
            content: "Keep weekly summaries concise.",
            scope: "memory:preference",
            confidence: "high",
            sourceEventIds: "[]",
            createdAt: now,
          },
          {
            id: "lesson_episode",
            agentId: "agent_001",
            content: "Runtime-only observation.",
            scope: "episode:no-finding",
            confidence: "low",
            sourceEventIds: "[]",
            createdAt: now,
          },
        ])
        .run();
      db.insert(learnedPolicyRules)
        .values({
          id: "rule_001",
          agentId: "agent_001",
          toolName: "spawn_sub_run",
          learnedDecision: "auto",
          evidenceCount: 2,
          consistencyRate: 1,
          status: "accepted",
          suggestedAt: now,
          sourceApprovalIds: "[]",
        })
        .run();
      db.insert(runs)
        .values({ id: "run_001", agentId: "agent_001", triggerType: "manual", status: "completed", startedAt: now })
        .run();
      db.insert(runEvents)
        .values({
          id: "evt_001",
          runId: "run_001",
          agentId: "agent_001",
          timestamp: now,
          type: "run_completed",
          payload: "{}",
        })
        .run();
      db.insert(agentTasks)
        .values({
          id: "task_001",
          parentRunId: "run_001",
          rootRunId: "run_001",
          agentId: "agent_001",
          role: "analyst",
          title: "Old task",
          createdAt: now,
        })
        .run();
      db.insert(approvals)
        .values({
          id: "approval_row_001",
          runId: "run_001",
          agentId: "agent_001",
          approvalId: "approval_001",
          waitTokenId: "wait_001",
          toolName: "googleads_adjust_budget",
          toolInput: "{}",
          status: "pending",
          taskId: "task_001",
          createdAt: now,
        })
        .run();

      const legacy = new Database(dbPath);
      legacy.exec(`
        CREATE TABLE IF NOT EXISTS work_items (id TEXT PRIMARY KEY);
        INSERT INTO work_items (id) VALUES ('work_legacy');
        PRAGMA user_version = 3;
      `);
      legacy.close();

      const migrated = createDb(dbPath);

      expect(migrated.select().from(projects).all()).toHaveLength(1);
      expect(migrated.select().from(agents).all()).toHaveLength(1);
      expect(migrated.select().from(connections).all()).toHaveLength(1);
      expect(migrated.select().from(runs).all()).toHaveLength(0);
      expect(migrated.select().from(runEvents).all()).toHaveLength(0);
      expect(migrated.select().from(agentTasks).all()).toHaveLength(0);
      expect(migrated.select().from(approvals).all()).toHaveLength(0);

      const lessonRows = migrated.select().from(lessons).all();
      expect(lessonRows.map((row) => row.scope)).toEqual(["memory:preference"]);

      const agentRow = migrated.select().from(agents).where(eq(agents.id, "agent_001")).get();
      const toolConfig = JSON.parse(agentRow?.toolConfig ?? "{}") as {
        tools?: Record<string, { toolName?: string }>;
      };
      expect(toolConfig.tools?.delegate_task?.toolName).toBe("delegate_task");
      expect(toolConfig.tools?.spawn_sub_run).toBeUndefined();

      const ruleRow = migrated.select().from(learnedPolicyRules).where(eq(learnedPolicyRules.id, "rule_001")).get();
      expect(ruleRow?.toolName).toBe("delegate_task");

      const sqlite = new Database(dbPath, { readonly: true });
      const legacyTable = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'work_items'")
        .get();
      const approvalColumns = sqlite.prepare("PRAGMA table_info(approvals)").all() as Array<{ name: string }>;
      const version = sqlite.pragma("user_version", { simple: true });
      sqlite.close();

      expect(legacyTable).toBeUndefined();
      expect(approvalColumns.some((column) => column.name === "agent_task_id")).toBe(true);
      expect(approvalColumns.some((column) => column.name === "work_item_id")).toBe(false);
      expect(version).toBe(4);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
