import { access, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projects } from "../../db/schema";
import { getProjectPersistence, openProjectDb } from "../index";

const tempRoots: string[] = [];
const originalProjectRoot = process.env.PROJECT_ROOT;

afterEach(async () => {
  process.env.PROJECT_ROOT = originalProjectRoot;
  await Promise.all(
    tempRoots.map(async (root) => {
      try {
        await rm(root, { recursive: true, force: true });
      } catch {
        // Ignore temp cleanup failures.
      }
    }),
  );
  tempRoots.length = 0;
});

describe("project persistence", () => {
  it("opens a project database at the derived project path", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-project-db-"));
    tempRoots.push(root);
    process.env.PROJECT_ROOT = root;

    await mkdir(path.join(root, "apps/web/data/projects/proj_001"), { recursive: true });

    const db = openProjectDb("proj_001");
    const now = Date.now();
    db.insert(projects)
      .values({
        id: "proj_001",
        name: "Project One",
        createdAt: now,
      })
      .run();

    const row = db.select().from(projects).get();
    expect(row?.id).toBe("proj_001");
    await expect(access(getProjectPersistence("proj_001").dbPath)).resolves.toBeUndefined();
  });
});
