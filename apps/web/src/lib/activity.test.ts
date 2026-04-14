import { describe, expect, it } from "vitest";
import {
  formatAgentActivitySummary,
  mergeAgentViewWithActivity,
  mergeProjectViewWithActivity,
} from "./activity";
import type { AgentActivityStateView, AgentView, ProjectActivityStateView, ProjectView } from "./types";

const baseAgent: AgentView = {
  id: "agent_1",
  projectId: "project_1",
  name: "Optimizer",
  description: "Optimizes campaigns",
  instructions: "Watch performance",
  skills: ["analyze"],
  schedule: "manual",
  lifecycleStatus: "live",
  status: "idle",
  lastRunAt: null,
  lastRunRelative: null,
  nextRunAt: null,
  pendingCount: 0,
  activeRunCount: 0,
  lessonCount: 2,
  runCount: 1,
  connections: [],
  createdAt: 0,
};

describe("activity view helpers", () => {
  it("formats combined approval and active run counts", () => {
    expect(formatAgentActivitySummary({ pendingApprovalCount: 1, activeRunCount: 2 })).toBe(
      "1 approval, 2 active runs",
    );
    expect(formatAgentActivitySummary({ pendingApprovalCount: 0, activeRunCount: 0 })).toBeNull();
  });

  it("merges dynamic agent activity into the static agent view", () => {
    const activity: AgentActivityStateView = {
      agentId: "agent_1",
      version: 1,
      primaryStatus: "attention",
      activeRunCount: 2,
      pendingApprovalCount: 1,
      activeRunId: "run_2",
      runs: [
        {
          id: "run_2",
          agentId: "agent_1",
          triggerType: "manual",
          status: "waiting_for_approval",
          hasActionableApprovals: false,
          startedAt: new Date(Date.now() - 30_000).toISOString(),
          events: [],
          approvals: [],
          workItems: [],
        },
      ],
    };

    const merged = mergeAgentViewWithActivity(baseAgent, activity);

    expect(merged.status).toBe("attention");
    expect(merged.activeRunCount).toBe(2);
    expect(merged.pendingCount).toBe(1);
    expect(merged.runCount).toBe(1);
    expect(merged.lastRunAt).not.toBeNull();
  });

  it("merges live project activity into the project shell view", () => {
    const project: ProjectView = {
      id: "project_1",
      name: "Homescape",
      icon: "🏠",
      color: "#123456",
      agents: [baseAgent],
      needsInput: [],
      connectionCount: 2,
      attentionCount: 0,
      createdAt: 0,
    };

    const activity: ProjectActivityStateView = {
      projectId: "project_1",
      version: 2,
      agents: [
        {
          id: "agent_1",
          primaryStatus: "running",
          activeRunCount: 2,
          pendingApprovalCount: 0,
          lastRunAt: 123,
          lastRunRelative: "Just now",
        },
      ],
      needsInput: [
        {
          id: "approval_1",
          agentId: "agent_1",
          agentName: "Optimizer",
          runId: "run_2",
          approval: {
            id: "approval_1",
            runId: "run_2",
            agentId: "agent_1",
            proposal: {
              id: "approval_1",
              toolName: "gmail_send_email",
              toolInput: {},
              reason: "Needs approval",
            },
            status: "pending",
            createdAt: new Date().toISOString(),
          },
        },
      ],
    };

    const merged = mergeProjectViewWithActivity(project, activity);

    expect(merged.agents[0]?.status).toBe("running");
    expect(merged.agents[0]?.activeRunCount).toBe(2);
    expect(merged.needsInput).toHaveLength(1);
  });
});
