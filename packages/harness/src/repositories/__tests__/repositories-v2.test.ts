import { describe, expect, it } from "vitest";
import { createTestDb } from "../../db/client";
import { projects } from "../../db/schema";
import { AgentRepository } from "../agent";
import { ApprovalRepository } from "../approval";
import { RunEventRepository } from "../event";
import { LessonRepository } from "../lesson";
import { RunRepository } from "../run";

describe("simplified repositories", () => {
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

  it("returns only active lessons for an agent", async () => {
    const db = createTestDb();
    const repo = new LessonRepository(db);
    const now = new Date();

    await repo.create({
      agentId: "agent_001",
      content: "Exclude coupon-seeking traffic.",
      scope: "search_terms",
      confidence: "high",
      sourceRunEventIds: ["evt_001"],
      createdAt: now,
    });
    await repo.create({
      agentId: "agent_001",
      content: "Old pacing observation",
      scope: "budget",
      confidence: "low",
      sourceRunEventIds: ["evt_002"],
      createdAt: now,
      expiresAt: new Date(now.getTime() - 60_000),
    });

    const lessons = await repo.listByAgent("agent_001");
    expect(lessons).toHaveLength(1);
    expect(lessons[0]?.scope).toBe("search_terms");
  });
});
