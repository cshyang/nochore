import { createDb, type HarnessDb } from "../db/client";
import { getProjectDbPath } from "../workspace";

export interface ProjectPersistence {
  kind: "sqlite";
  dbPath: string;
}

export function getProjectPersistence(projectId: string): ProjectPersistence {
  return {
    kind: "sqlite",
    dbPath: getProjectDbPath(projectId),
  };
}

// Concrete sqlite project database opener for the current harness runtime.
export function openProjectDb(projectId: string): HarnessDb {
  return createDb(getProjectPersistence(projectId).dbPath);
}
