import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { initializeWorkspace } from "../templates";
import { WorkspaceStore } from "../store";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirs.map(async (dir) => {
      try {
        await import("node:fs/promises").then((fs) =>
          fs.rm(dir, { recursive: true, force: true }),
        );
      } catch {
        // ignore cleanup failures in temp dirs
      }
    }),
  );
  tempDirs.length = 0;
});

describe("simplified workspace", () => {
  it("initializes only durable workspace files and directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "autoad-workspace-"));
    tempDirs.push(dir);

    await initializeWorkspace(dir);

    const knowledge = await readFile(path.join(dir, "KNOWLEDGE.md"), "utf-8");
    const scratchpadStat = await stat(path.join(dir, "scratchpad"));

    expect(knowledge).toContain("# Knowledge");
    expect(scratchpadStat.isDirectory()).toBe(true);
    await expect(stat(path.join(dir, "reports"))).rejects.toThrow();
  });

  it("reads knowledge, writes scratchpad notes, and lists markdown files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "autoad-workspace-"));
    tempDirs.push(dir);
    await initializeWorkspace(dir);

    const store = new WorkspaceStore(dir);
    await store.writeFile("scratchpad/findings.md", "# Findings");

    const identity = await store.loadIdentity();
    const files = await store.listFiles();

    expect(identity.knowledgeMd).toContain("# Knowledge");
    expect(identity.agentMd).toBeNull();
    expect(identity.policyMd).toBeNull();
    expect(files).toEqual(["KNOWLEDGE.md", "scratchpad/findings.md"]);
  });

  it("rejects writes outside scratchpad and blocks unsafe paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "autoad-workspace-"));
    tempDirs.push(dir);
    await initializeWorkspace(dir);

    const store = new WorkspaceStore(dir);

    await expect(store.writeFile("reports/out.md", "nope")).rejects.toThrow(
      /not writable/i,
    );
    await expect(store.readFile("../secrets.md")).rejects.toThrow(/Invalid path/);
  });
});
