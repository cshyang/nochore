import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

function findRepoRoot(): string {
  let dir = process.cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(resolve(dir, "trigger.config.ts"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();

export function getRepoRoot(): string {
  return REPO_ROOT;
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
