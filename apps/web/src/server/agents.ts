import crypto from "node:crypto";
import { rmSync } from "node:fs";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { buildDefaultToolConfig } from "../../../../packages/harness/src/connections";
import { agents, approvals, connections, lessons, runEvents, runs } from "../../../../packages/harness/src/db/schema";
import { initializeWorkspace } from "../../../../packages/harness/src/workspace";
import { getAgentWorkspacePath } from "../../../../packages/harness/src/workspace";
import type {
  AgentConfig,
  NotificationConfig,
  ToolConfig,
} from "../../../../packages/harness/src/types";
import { buildAgentView } from "./models";
import { getProjectDeps } from "./deps";
import { jsonSafe } from "./serializable";
import { startAgentRun } from "./orchestration";

export const createBlankAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const agentId = crypto.randomUUID().slice(0, 12);
    await createAgentRecord({
      agentId,
      projectId,
      name: "Untitled Agent",
      description: "",
      instructions: "",
      skills: [],
      toolConfig: buildDefaultToolConfig([]),
      notificationConfig: {
        inApp: true,
        email: false,
        slack: false,
      },
      schedule: "manual",
      status: "draft",
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

export const createAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: string;
      name: string;
      description?: string;
      instructions?: string;
      skills?: string[];
      toolConfig?: ToolConfig;
      requiredProviders?: Array<{ provider: string; reason: string }>;
      notificationConfig?: NotificationConfig;
      schedule?: AgentConfig["schedule"];
      status?: "draft" | "live";
    }) => input,
  )
  .handler(async ({ data }) => {
    const agentId = crypto.randomUUID().slice(0, 12);
    await createAgentRecord({
      agentId,
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? "",
      instructions: data.instructions ?? "",
      skills: data.skills ?? [],
      toolConfig: resolveToolConfig(data.toolConfig, data.requiredProviders),
      notificationConfig: data.notificationConfig ?? {
        inApp: true,
        email: false,
        slack: false,
      },
      schedule: data.schedule ?? "manual",
      status: data.status ?? "live",
    });
    return jsonSafe({ id: agentId });
  });

export const createDraftAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      projectId: string;
      name: string;
      description?: string;
      instructions?: string;
      skills?: string[];
      toolConfig?: ToolConfig;
      requiredProviders?: Array<{ provider: string; reason: string }>;
      notificationConfig?: NotificationConfig;
      schedule?: AgentConfig["schedule"];
    }) => input,
  )
  .handler(async ({ data }) => {
    const agentId = crypto.randomUUID().slice(0, 12);
    await createAgentRecord({
      agentId,
      projectId: data.projectId,
      name: data.name,
      description: data.description ?? "",
      instructions: data.instructions ?? "",
      skills: data.skills ?? [],
      toolConfig: resolveToolConfig(data.toolConfig, data.requiredProviders),
      notificationConfig: data.notificationConfig ?? {
        inApp: true,
        email: false,
        slack: false,
      },
      schedule: data.schedule ?? "manual",
      status: "draft",
    });
    return jsonSafe({ id: agentId });
  });

export const updateDraftAgent = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      agentId: string;
      projectId: string;
      name?: string;
      description?: string;
      instructions?: string;
      skills?: string[];
      toolConfig?: ToolConfig;
      requiredProviders?: Array<{ provider: string; reason: string }>;
      notificationConfig?: NotificationConfig;
      schedule?: AgentConfig["schedule"];
      status?: "draft" | "live";
    }) => input,
  )
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

export const updateAgentConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      agentId: string;
      projectId: string;
      name?: string;
      description?: string;
      instructions?: string;
      skills?: string[];
      toolConfig?: ToolConfig;
      requiredProviders?: Array<{ provider: string; reason: string }>;
      notificationConfig?: NotificationConfig;
      schedule?: AgentConfig["schedule"];
      status?: "draft" | "live";
    }) => input,
  )
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
    const { runId, triggerRunId } = await startAgentRun({
      agentId,
      projectId,
      trigger: {
        type: "manual",
        timestamp: new Date(),
        metadata: { source: "launch" },
      },
    });

    return jsonSafe({ launched: true, runId, triggerRunId, queued: true });
  });

export const triggerManualRun = createServerFn({ method: "POST" })
  .inputValidator((input: { agentId: string; projectId: string }) => input)
  .handler(async ({ data: { agentId, projectId } }) => {
    const { runId, triggerRunId } = await startAgentRun({
      agentId,
      projectId,
      trigger: {
        type: "manual",
        timestamp: new Date(),
        metadata: { source: "run_now" },
      },
    });

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

async function createAgentRecord(input: {
  agentId: string;
  projectId: string;
  name: string;
  description: string;
  instructions: string;
  skills: string[];
  toolConfig: ToolConfig;
  notificationConfig: NotificationConfig;
  schedule: AgentConfig["schedule"];
  status: "draft" | "live";
}) {
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

async function updateAgentRecord(
  projectId: string,
  agentId: string,
  updates: Partial<{
    name: string;
    description: string;
    instructions: string;
    skills: string[];
    toolConfig: ToolConfig;
    notificationConfig: NotificationConfig;
    schedule: AgentConfig["schedule"];
    status: "draft" | "live";
  }>,
) {
  const { agentRepository } = getProjectDeps(projectId);
  await agentRepository.update(agentId, updates);
}

function resolveToolConfig(
  toolConfig: ToolConfig | undefined,
  requiredProviders: Array<{ provider: string; reason: string }> | undefined,
): ToolConfig {
  if (toolConfig) {
    return toolConfig;
  }

  return buildDefaultToolConfig(
    requiredProviders?.map((provider) => provider.provider) ?? [],
    requiredProviders ?? [],
  );
}

async function loadProjectAgentViews(projectId: string) {
  const { agentRepository, runRepository, approvalRepository, lessonRepository, db } = getProjectDeps(projectId);
  const agents = await agentRepository.listByProject(projectId);
  return Promise.all(
    agents.map(async (agent) =>
      buildAgentView({
        agent,
        db,
        runs: await runRepository.getByAgent(agent.id),
        approvals: await approvalRepository.listByAgent(agent.id),
        lessonsCount: (await lessonRepository.listByAgent(agent.id)).length,
        activeConnections: agent.toolConfig.requiredProviders,
      }),
    ),
  );
}

async function loadAgentView(projectId: string, agentId: string) {
  const { agentRepository, runRepository, approvalRepository, lessonRepository, db } = getProjectDeps(projectId);
  const agent = await agentRepository.getById(agentId);
  if (!agent) {
    return null;
  }

  return buildAgentView({
    agent,
    db,
    runs: await runRepository.getByAgent(agent.id),
    approvals: await approvalRepository.listByAgent(agent.id),
    lessonsCount: (await lessonRepository.listByAgent(agent.id)).length,
    activeConnections: agent.toolConfig.requiredProviders,
  });
}
