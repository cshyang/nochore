import { eq } from "drizzle-orm";
import { createDb } from "../../../../packages/harness/src/db/client";
import { agents, connections, projects } from "../../../../packages/harness/src/db/schema";
import { AgentRepository } from "../../../../packages/harness/src/repositories/agent";
import { ApprovalRepository } from "../../../../packages/harness/src/repositories/approval";
import { RunEventRepository } from "../../../../packages/harness/src/repositories/event";
import { LessonRepository } from "../../../../packages/harness/src/repositories/lesson";
import { RunRepository } from "../../../../packages/harness/src/repositories/run";
import { listPromptSkills } from "../../../../packages/harness/src/skills";
import type { AgentConfig } from "../../../../packages/harness/src/types";
import { getAgentWorkspacePath, getProjectDbPath, WorkspaceStore } from "../../../../packages/harness/src/workspace";
import { buildAgentView, buildProjectView } from "./models";

const dbCache = new Map<string, ReturnType<typeof createDb>>();

export interface ProjectDeps {
  db: ReturnType<typeof createDb>;
  agentRepository: AgentRepository;
  runRepository: RunRepository;
  runEventRepository: RunEventRepository;
  approvalRepository: ApprovalRepository;
  lessonRepository: LessonRepository;
}

export function getProjectDeps(projectId: string): ProjectDeps {
  const db = getDb(projectId);
  return {
    db,
    agentRepository: new AgentRepository(db),
    runRepository: new RunRepository(db),
    runEventRepository: new RunEventRepository(db),
    approvalRepository: new ApprovalRepository(db),
    lessonRepository: new LessonRepository(db),
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

  const { db, agentRepository, runRepository, lessonRepository } = getProjectDeps(projectId);
  const agentRows = await agentRepository.listByProject(projectId);
  const agents = await Promise.all(
    agentRows.map(async (agent) =>
      buildAgentView({
        agent,
        db,
        runs: await runRepository.getByAgent(agent.id),
        approvals: [],
        lessonsCount: (await lessonRepository.listByAgent(agent.id)).length,
        activeConnections: agent.toolConfig.requiredProviders,
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
    activeConnectionCount,
  });
}

function getDb(projectId: string) {
  if (!dbCache.has(projectId)) {
    dbCache.set(projectId, createDb(getProjectDbPath(projectId)));
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
