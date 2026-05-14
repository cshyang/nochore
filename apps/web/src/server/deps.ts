import { existsSync, readdirSync } from "node:fs";
import type { AgentConfig } from "@nochore/harness";
import {
  agents,
  connections,
  createProjectRepositories,
  getAgentWorkspacePath,
  getProjectDirectory,
  type HarnessDb,
  listPromptSkills,
  openProjectDb,
  projects,
  WorkspaceStore,
} from "@nochore/harness";
import { eq } from "drizzle-orm";
import { buildAgentView, buildProjectView } from "./models";

const dbCache = new Map<string, HarnessDb>();

type ProjectRepositories = ReturnType<typeof createProjectRepositories>;

export type ProjectDeps = { db: HarnessDb } & ProjectRepositories;

export function getProjectDeps(projectId: string): ProjectDeps {
  const db = getDb(projectId);
  recoverMissingAgentRows(projectId, db);
  return {
    db,
    ...createProjectRepositories(db),
  };
}

export function clearProjectDeps(projectId: string): void {
  dbCache.delete(projectId);
}

export function getAgentDeps(projectId: string, agentId: string) {
  const projectDeps = getProjectDeps(projectId);
  return {
    ...projectDeps,
    workspaceStore: new WorkspaceStore(getAgentWorkspacePath(projectId, agentId)),
    skills: listPromptSkills(),
  };
}

export interface AgentRow {
  id: string;
  projectId: string;
  name: string;
  description: string;
  config: AgentConfig;
  createdAt: Date;
  updatedAt: Date;
}

export function listAgentRows(projectId: string): AgentRow[] {
  const { db } = getProjectDeps(projectId);
  return db.select().from(agents).where(eq(agents.projectId, projectId)).all().map(toAgentRow);
}

export function getAgentRow(projectId: string, agentId: string): AgentRow | null {
  const { db } = getProjectDeps(projectId);
  const row = db.select().from(agents).where(eq(agents.id, agentId)).get();
  return row ? toAgentRow(row) : null;
}

export function listProjectConnections(projectId: string) {
  const { db } = getProjectDeps(projectId);
  return db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .all()
    .map(normalizeConnectionRowForRuntime);
}

export function getProjectRow(projectId: string) {
  const { db } = getProjectDeps(projectId);
  return db.select().from(projects).where(eq(projects.id, projectId)).get();
}

export async function getProjectView(projectId: string) {
  const project = getProjectRow(projectId);
  if (!project) {
    return null;
  }

  const {
    db,
    agentRepository,
    runRepository,
    approvalRepository,
    lessonRepository,
    learnedRuleRepository,
    runEventRepository,
    agentConnectionBindingRepository,
  } = getProjectDeps(projectId);
  const agentRows = await agentRepository.listByProject(projectId);
  const agentNameById = new Map(agentRows.map((agent) => [agent.id, agent.name]));
  const agents = await Promise.all(
    agentRows.map(async (agent) => {
      const metricEvents = agent.primaryMetric
        ? (await runEventRepository.listByAgent(agent.id, 500)).filter((e) => e.type === "metric_observed")
        : [];

      return buildAgentView({
        agent,
        db,
        runs: await runRepository.getByAgent(agent.id),
        approvals: await approvalRepository.listByAgent(agent.id, ["pending", "expired"]),
        lessonsCount: (await lessonRepository.listDurableByAgent(agent.id)).length,
        activeConnections: agent.toolConfig.requiredProviders,
        connectionBindings: await agentConnectionBindingRepository.listByAgent(agent.id),
        learnedRuleSuggestions: await learnedRuleRepository.listSuggested(agent.id),
        learnedRules: await learnedRuleRepository.listAccepted(agent.id),
        metricEvents,
      });
    }),
  );

  const activeConnectionCount = db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .all()
    .map(normalizeConnectionRowForRuntime)
    .filter((connection) => connection.status === "active").length;

  return buildProjectView({
    project,
    agents,
    needsInput: (await approvalRepository.listByProject(projectId, ["pending", "expired"])).map((approval) => ({
      id: approval.id,
      agentId: approval.agentId,
      agentName: agentNameById.get(approval.agentId) ?? "Agent",
      runId: approval.runId,
      approval,
    })),
    activeConnectionCount,
  });
}

function getDb(projectId: string) {
  if (!dbCache.has(projectId)) {
    dbCache.set(projectId, openProjectDb(projectId));
  }
  return dbCache.get(projectId)!;
}

function normalizeConnectionRowForRuntime(row: typeof connections.$inferSelect): typeof connections.$inferSelect {
  if (row.provider !== "googleads" || row.status !== "active" || row.composioEntityId) {
    return row;
  }

  const config = parseConnectionConfig(row.config);
  const customerId = config.selectedCustomerId ?? config.customerId;
  if (typeof customerId === "string" && customerId.trim()) {
    return row;
  }

  return { ...row, status: "disconnected" };
}

function parseConnectionConfig(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function recoverMissingAgentRows(projectId: string, db: HarnessDb) {
  const agentsDir = `${getProjectDirectory(projectId)}/agents`;
  if (!existsSync(agentsDir)) {
    return;
  }

  const workspaceIds = readdirSync(agentsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (workspaceIds.length === 0) {
    return;
  }

  const existingIds = new Set(
    db
      .select()
      .from(agents)
      .where(eq(agents.projectId, projectId))
      .all()
      .map((row) => row.id),
  );

  for (const agentId of workspaceIds) {
    if (existingIds.has(agentId)) {
      continue;
    }

    try {
      const now = Date.now();
      db.insert(agents)
        .values({
          id: agentId,
          projectId,
          name: `Recovered agent ${agentId}`,
          description: "Recovered from an existing workspace after the database record was missing.",
          instructions: "",
          skills: "[]",
          toolConfig: JSON.stringify({
            globalApprovalRequired: false,
            requiredProviders: [],
            tools: {},
          }),
          notificationConfig: JSON.stringify({
            inApp: true,
            email: false,
            slack: false,
          }),
          schedule: "manual",
          status: "draft",
          createdAt: now,
          updatedAt: now,
        })
        .run();
      existingIds.add(agentId);
    } catch (error) {
      if (!isDuplicateAgentInsert(error)) {
        throw error;
      }
    }
  }
}

function isDuplicateAgentInsert(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed: agents.id");
}

function toAgentRow(row: typeof agents.$inferSelect): AgentRow {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    config: {
      instructions: row.instructions,
      skills: parseSkills(row.skills),
      toolConfig: JSON.parse(row.toolConfig || "{}") as AgentConfig["toolConfig"],
      notificationConfig: JSON.parse(row.notificationConfig || "{}") as AgentConfig["notificationConfig"],
      schedule: row.schedule as AgentConfig["schedule"],
    } as AgentConfig,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

function parseSkills(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
