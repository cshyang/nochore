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
