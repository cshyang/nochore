import type { AgentConfig } from "@nochore/harness";
import {
  agents,
  connections,
  createProjectRepositories,
  getAgentWorkspacePath,
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
  return db.select().from(connections).where(eq(connections.projectId, projectId)).all();
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

  const { db, agentRepository, runRepository, approvalRepository, lessonRepository, learnedRuleRepository } =
    getProjectDeps(projectId);
  const agentRows = await agentRepository.listByProject(projectId);
  const agentNameById = new Map(agentRows.map((agent) => [agent.id, agent.name]));
  const agents = await Promise.all(
    agentRows.map(async (agent) =>
      buildAgentView({
        agent,
        db,
        runs: await runRepository.getByAgent(agent.id),
        approvals: await approvalRepository.listByAgent(agent.id, ["pending", "expired"]),
        lessonsCount: (await lessonRepository.listDurableByAgent(agent.id)).length,
        activeConnections: agent.toolConfig.requiredProviders,
        learnedRuleSuggestions: await learnedRuleRepository.listSuggested(agent.id),
        learnedRules: await learnedRuleRepository.listAccepted(agent.id),
      }),
    ),
  );

  const activeConnectionCount = db
    .select()
    .from(connections)
    .where(eq(connections.projectId, projectId))
    .all()
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
