import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { agents, openProjectDb, projects } from "@nochore/harness";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { clearProjectDeps, getProjectView } from "./deps";

const tempRoots: string[] = [];
const originalProjectRoot = process.env.PROJECT_ROOT;

afterEach(async () => {
  clearProjectDeps("homescape");
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

describe("project dependency recovery", () => {
  it("recovers agent rows from existing workspace directories", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-project-recovery-"));
    tempRoots.push(root);
    process.env.PROJECT_ROOT = root;

    const workspacePath = path.join(root, "apps/web/data/projects/homescape/agents/agent_001");
    await mkdir(path.join(workspacePath, "scratchpad"), { recursive: true });
    await writeFile(path.join(workspacePath, "KNOWLEDGE.md"), "# Existing workspace\n", "utf-8");

    const db = openProjectDb("homescape");
    const now = Date.now();
    db.insert(projects)
      .values({
        id: "homescape",
        name: "Homescape",
        createdAt: now,
      })
      .run();

    const project = await getProjectView("homescape");
    const recoveredRow = db.select().from(agents).where(eq(agents.id, "agent_001")).get();

    expect(project?.agents.map((agent) => agent.id)).toEqual(["agent_001"]);
    expect(project?.agents[0]?.name).toBe("Recovered agent agent_001");
    expect(recoveredRow?.projectId).toBe("homescape");
    expect(recoveredRow?.status).toBe("draft");
  });
});
