import crypto from "node:crypto";
import { rmSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { agents, approvals, connections, lessons, runEvents, runs } from "../../../../packages/harness/src/db/schema";
import type { AgentRecord } from "../../../../packages/harness/src/repositories";
import type { AgentConfig, NotificationConfig, ToolConfig } from "../../../../packages/harness/src/types";
import { getAgentWorkspacePath, initializeWorkspace } from "../../../../packages/harness/src/workspace";
import { getProjectDeps } from "./deps";
import { buildAgentView } from "./models";
import { startAgentRun } from "./orchestration";
import { jsonSafe } from "./serializable";

type AgentStatus = "draft" | "live";
type ProviderRequirement = ToolConfig["requiredProviders"][number];
type ProjectDeps = ReturnType<typeof getProjectDeps>;

type AgentMutationFields = {
  name?: string;
  description?: string;
  instructions?: string;
  skills?: string[];
  toolConfig?: ToolConfig;
  requiredProviders?: ProviderRequirement[];
  notificationConfig?: NotificationConfig;
  schedule?: AgentConfig["schedule"];
  status?: AgentStatus;
};

type CreateAgentInput = AgentMutationFields & {
  projectId: string;
};

type UpdateAgentInput = AgentMutationFields & {
  agentId: string;
  projectId: string;
};

type AgentRecordInput = {
  agentId: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  toolConfig: ToolConfig;
  notificationConfig: NotificationConfig;
  schedule: AgentConfig["schedule"];
  status: AgentStatus;
};

const DEFAULT_NOTIFICATION_CONFIG: NotificationConfig = {
  inApp: true,
  email: false,
  slack: false,
};

export const createAgent = createServerFn({ method: "POST" })
  .inputValidator((input: CreateAgentInput) => input)
  .handler(async ({ data }) => {
    const agentId = crypto.randomUUID().slice(0, 12);
    await createAgentRecord({
      agentId,
      projectId: data.projectId,
      name: data.name ?? "Untitled Agent",
      description: data.description ?? "",
      instructions: data.instructions ?? "",
      skills: data.skills ?? [],
      toolConfig: resolveToolConfig(data.toolConfig, data.requiredProviders),
      notificationConfig: data.notificationConfig ?? DEFAULT_NOTIFICATION_CONFIG,
      schedule: data.schedule ?? "manual",
      status: data.status ?? "draft",
    });
    return jsonSafe({ id: agentId });
  });

export const listAgents = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const view = await loadProjectAgentViews(projectId);
    return jsonSafe(view);
  });

export const getAgent = createServerFn({ method: "GET" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const view = await loadAgentView(projectId, agentId);
    return jsonSafe(view);
  });

export const updateAgentConfig = createServerFn({ method: "POST" })
  .inputValidator((input: UpdateAgentInput) => input)
  .handler(async ({ data }) => {
    await updateAgentRecord(data.projectId, data.agentId, {
      name: data.name,
      description: data.description,
      instructions: data.instructions,
      skills: data.skills,
      toolConfig: resolveToolConfig(data.toolConfig, data.requiredProviders),
      notificationConfig: data.notificationConfig,
      schedule: data.schedule,
      status: data.status,
    });
    return jsonSafe({ updated: true });
  });

export const launchAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const { agentRepository, db } = getProjectDeps(projectId);
    const agent = await agentRepository.getById(agentId);
    if (!agent) {
      throw new Error("Agent not found");
    }

    const activeProviders = new Set(
      db
        .select()
        .from(connections)
        .where(eq(connections.projectId, projectId))
        .all()
        .filter((connection) => connection.status === "active")
        .map((connection) => connection.provider),
    );
    const missingProviders = agent.toolConfig.requiredProviders.filter(
      (provider) => !activeProviders.has(provider.provider),
    );
    if (missingProviders.length > 0) {
      throw new Error(
        `Missing required connections: ${missingProviders.map((provider) => provider.provider).join(", ")}`,
      );
    }

    await agentRepository.update(agentId, { status: "live" });
    const { runId, triggerRunId } = await queueManualRun(projectId, agentId, "launch");

    return jsonSafe({ launched: true, runId, triggerRunId, queued: true });
  });

export const triggerManualRun = createServerFn({ method: "POST" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const { runId, triggerRunId } = await queueManualRun(projectId, agentId, "run_now");

    return jsonSafe({ triggered: true, runId, triggerRunId, status: "queued", ok: true });
  });

export const deleteAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const { db } = getProjectDeps(projectId);
    db.delete(approvals).where(eq(approvals.agentId, agentId)).run();
    db.delete(runEvents).where(eq(runEvents.agentId, agentId)).run();
    db.delete(lessons).where(eq(lessons.agentId, agentId)).run();
    db.delete(runs).where(eq(runs.agentId, agentId)).run();
    db.delete(agents).where(eq(agents.id, agentId)).run();

    try {
      rmSync(getAgentWorkspacePath(projectId, agentId), { recursive: true, force: true });
    } catch {
      // Workspace may not exist yet.
    }

    return jsonSafe({ deleted: true });
  });

async function createAgentRecord(input: AgentRecordInput) {
  const { agentRepository } = getProjectDeps(input.projectId);
  await agentRepository.create({
    id: input.agentId,
    projectId: input.projectId,
    name: input.name,
    description: input.description,
    instructions: input.instructions,
    skills: input.skills,
    toolConfig: input.toolConfig,
    notificationConfig: input.notificationConfig,
    schedule: input.schedule,
    status: input.status,
  });
  await initializeWorkspace(getAgentWorkspacePath(input.projectId, input.agentId));
}

async function updateAgentRecord(projectId: string, agentId: string, updates: AgentMutationFields) {
  const { agentRepository } = getProjectDeps(projectId);
  await agentRepository.update(agentId, updates);
}

function resolveToolConfig(
  toolConfig: ToolConfig | undefined,
  requiredProviders: ProviderRequirement[] | undefined,
): ToolConfig {
  if (toolConfig) {
    return toolConfig;
  }

  // Composio is now the source of truth for available tools.
  // Return a minimal config — tools are discovered at runtime via session.tools().
  return {
    requiredProviders: requiredProviders ?? [],
    tools: {},
  };
}

async function queueManualRun(projectId: string, agentId: string, source: "launch" | "run_now") {
  return startAgentRun({
    agentId,
    projectId,
    trigger: {
      type: "manual",
      timestamp: new Date(),
      metadata: { source },
    },
  });
}

async function loadProjectAgentViews(projectId: string) {
  const deps = getProjectDeps(projectId);
  const projectAgents = await deps.agentRepository.listByProject(projectId);
  return Promise.all(projectAgents.map((agent) => buildAgentViewModel(deps, agent)));
}

async function loadAgentView(projectId: string, agentId: string) {
  const deps = getProjectDeps(projectId);
  const agent = await deps.agentRepository.getById(agentId);
  if (!agent) {
    return null;
  }

  return buildAgentViewModel(deps, agent);
}

async function buildAgentViewModel(deps: ProjectDeps, agent: AgentRecord) {
  return buildAgentView({
    agent,
    db: deps.db,
    runs: await deps.runRepository.getByAgent(agent.id),
    approvals: await deps.approvalRepository.listByAgent(agent.id),
    lessonsCount: (await deps.lessonRepository.listByAgent(agent.id)).length,
    activeConnections: agent.toolConfig.requiredProviders,
  });
}
