import { resolve } from "node:path";

export function getRepoRoot(): string {
  return process.env.PROJECT_ROOT ?? process.cwd();
}

export function getWebDataRoot(): string {
  return resolve(getRepoRoot(), "apps/web");
}

export function getProjectDirectory(projectId: string): string {
  return resolve(getWebDataRoot(), "data/projects", projectId);
}

export function getProjectDbPath(projectId: string): string {
  return resolve(getProjectDirectory(projectId), "nochore.db");
}

export function getAgentWorkspacePath(projectId: string, agentId: string): string {
  return resolve(getProjectDirectory(projectId), "agents", agentId);
}
