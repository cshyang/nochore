import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createTestDb } from "../client";
import { agents, approvals, connections, lessons, projects, runEvents, runs } from "../schema";

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
        sourceRunEventIds: JSON.stringify(["evt_001", "evt_002"]),
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

    expect(JSON.parse(lessonRow?.sourceRunEventIds ?? "[]")).toEqual(["evt_001", "evt_002"]);
    expect(connectionRow?.provider).toBe("googleads");
    expect(connectionRow?.status).toBe("active");
  });
});
