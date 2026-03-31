import crypto from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createDb } from "../../../../packages/harness/src/db/client";
import { connections, projects } from "../../../../packages/harness/src/db/schema";
import { getProjectPersistence } from "../../../../packages/harness/src/persistence";
import { getProjectDirectory, getWebDataRoot } from "../../../../packages/harness/src/workspace";
import { clearProjectDeps, getProjectDeps } from "./deps";
import { buildAgentView, buildProjectView } from "./models";
import { jsonSafe } from "./serializable";

const DEFAULT_PROJECT_ICON = "briefcase";
const DEFAULT_PROJECT_COLOR = "#5A7ACD";

export const listProjects = createServerFn({ method: "GET" }).handler(async () => {
  const projectsRoot = join(getWebDataRoot(), "data/projects");
  if (!existsSync(projectsRoot)) {
    return jsonSafe([]);
  }

  const projectDirs = readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  const result: any[] = [];
  for (const projectId of projectDirs) {
    const project = await loadProjectView(projectId);
    if (project) {
      result.push(project);
    }
  }

  return jsonSafe(result);
});

export const getProject = createServerFn({ method: "GET" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const project = await loadProjectView(projectId);
    return jsonSafe(project);
  });

export const createProject = createServerFn({ method: "POST" })
  .inputValidator((input: { name: string; icon?: string; color?: string }) => input)
  .handler(async ({ data }) => {
    const projectId = slugify(data.name) || crypto.randomUUID().slice(0, 8);
    const projectDir = getProjectDirectory(projectId);
    if (existsSync(projectDir)) {
      throw new Error(`A project named "${data.name}" already exists`);
    }

    mkdirSync(projectDir, { recursive: true });
    createDb(getProjectPersistence(projectId).dbPath);

    const { db } = getProjectDeps(projectId);
    const now = Date.now();
    db.insert(projects)
      .values({
        id: projectId,
        name: data.name,
        icon: data.icon ?? DEFAULT_PROJECT_ICON,
        color: data.color ?? DEFAULT_PROJECT_COLOR,
        createdAt: now,
      })
      .run();

    return jsonSafe({
      id: projectId,
      name: data.name,
      icon: resolveIcon(data.icon ?? DEFAULT_PROJECT_ICON),
      color: data.color ?? DEFAULT_PROJECT_COLOR,
      agents: [],
      needsInput: [],
      connectionCount: 0,
      attentionCount: 0,
      createdAt: now,
    });
  });

export const deleteProject = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const projectDir = getProjectDirectory(projectId);
    try {
      rmSync(projectDir, { recursive: true, force: true });
    } finally {
      clearProjectDeps(projectId);
    }
    return jsonSafe({ deleted: true });
  });

async function loadProjectView(projectId: string) {
  const projectDir = getProjectDirectory(projectId);
  const { dbPath } = getProjectPersistence(projectId);
  if (!existsSync(projectDir) || !existsSync(dbPath)) {
    return null;
  }

  try {
    const { db, agentRepository, runRepository, approvalRepository, lessonRepository, learnedRuleRepository } =
      getProjectDeps(projectId);
    let projectRow = db.select().from(projects).get();
    if (!projectRow) {
      // Self-heal: directory exists but no DB row (created by older version)
      const now = Date.now();
      db.insert(projects)
        .values({
          id: projectId,
          name: projectId.charAt(0).toUpperCase() + projectId.slice(1),
          icon: DEFAULT_PROJECT_ICON,
          color: DEFAULT_PROJECT_COLOR,
          createdAt: now,
        })
        .run();
      projectRow = db.select().from(projects).get();
      if (!projectRow) return null;
    }

    const agentRows = await agentRepository.listByProject(projectId);
    const agentNameById = new Map(agentRows.map((agent) => [agent.id, agent.name]));
    const agentViews = await Promise.all(
      agentRows.map(async (agent) => {
        const runs = await runRepository.getByAgent(agent.id);
        const lessons = await lessonRepository.listByAgent(agent.id);
        return buildAgentView({
          agent,
          db,
          runs,
          approvals: await approvalRepository.listByAgent(agent.id, ["pending", "expired"]),
          lessonsCount: lessons.length,
          activeConnections: agent.toolConfig.requiredProviders,
          learnedRuleSuggestions: await learnedRuleRepository.listSuggested(agent.id),
          learnedRules: await learnedRuleRepository.listAccepted(agent.id),
        });
      }),
    );

    const activeConnectionCount = db
      .select()
      .from(connections)
      .where(eq(connections.projectId, projectId))
      .all()
      .filter((connection) => connection.status === "active").length;

    return buildProjectView({
      project: {
        id: projectRow.id,
        name: projectRow.name,
        icon: projectRow.icon,
        color: projectRow.color,
        createdAt: projectRow.createdAt,
      },
      agents: agentViews,
      needsInput: (await approvalRepository.listByProject(projectId, ["pending", "expired"])).map((approval) => ({
        id: approval.id,
        agentId: approval.agentId,
        agentName: agentNameById.get(approval.agentId) ?? "Agent",
        runId: approval.runId,
        approval,
      })),
      activeConnectionCount,
    });
  } catch {
    return null;
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function resolveIcon(icon: string | null): string {
  if (!icon) return "📁";
  if (icon.codePointAt(0)! > 255) return icon;

  const map: Record<string, string> = {
    building: "🏢",
    hospital: "🏥",
    gear: "⚙️",
    rocket: "🚀",
    chart: "📈",
    star: "⭐",
    briefcase: "💼",
    globe: "🌐",
    shield: "🛡️",
    lightning: "⚡",
  };

  return map[icon] ?? "📁";
}
