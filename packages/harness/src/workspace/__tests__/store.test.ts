import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WorkspaceStore } from "../store";
import { initializeWorkspace } from "../templates";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

async function createTmpWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-test-"));
  return dir;
}

async function writeFixture(basePath: string, relativePath: string, content: string): Promise<void> {
  const fullPath = path.join(basePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// WorkspaceStore
// ---------------------------------------------------------------------------
describe("WorkspaceStore", () => {
  beforeEach(async () => {
    tmpDir = await createTmpWorkspace();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // readFile
  // -------------------------------------------------------------------------
  describe("readFile", () => {
    it("reads an existing .md file and returns its content", async () => {
      await writeFixture(tmpDir, "AGENT.md", "# My Agent\nIntent: do stuff");
      const store = new WorkspaceStore(tmpDir);
      const content = await store.readFile("AGENT.md");
      expect(content).toBe("# My Agent\nIntent: do stuff");
    });

    it("returns null for a non-existent file", async () => {
      const store = new WorkspaceStore(tmpDir);
      const content = await store.readFile("MISSING.md");
      expect(content).toBeNull();
    });

    it("throws for a non-.md file", async () => {
      await writeFixture(tmpDir, "config.yaml", "key: value");
      const store = new WorkspaceStore(tmpDir);
      await expect(store.readFile("config.yaml")).rejects.toThrow(/only .md files/i);
    });

    it("reads .md files in subdirectories", async () => {
      await writeFixture(tmpDir, "scratchpad/notes.md", "some notes");
      const store = new WorkspaceStore(tmpDir);
      const content = await store.readFile("scratchpad/notes.md");
      expect(content).toBe("some notes");
    });

    it("throws on path traversal with '..'", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.readFile("../secret.md")).rejects.toThrow(/invalid path/i);
    });

    it("throws on absolute path starting with '/'", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.readFile("/etc/passwd.md")).rejects.toThrow(/invalid path/i);
    });

    it("throws on path containing null bytes", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.readFile("file\0.md")).rejects.toThrow(/invalid path/i);
    });
  });

  // -------------------------------------------------------------------------
  // writeFile
  // -------------------------------------------------------------------------
  describe("writeFile", () => {
    it("writes to scratchpad/ subdirectory", async () => {
      await fs.mkdir(path.join(tmpDir, "scratchpad"), { recursive: true });
      const store = new WorkspaceStore(tmpDir);
      await store.writeFile("scratchpad/notes.md", "# Notes\nSome content");
      const content = await fs.readFile(path.join(tmpDir, "scratchpad/notes.md"), "utf-8");
      expect(content).toBe("# Notes\nSome content");
    });

    it("writes to reports/ subdirectory", async () => {
      await fs.mkdir(path.join(tmpDir, "reports"), { recursive: true });
      const store = new WorkspaceStore(tmpDir);
      await store.writeFile("reports/weekly.md", "# Weekly Report");
      const content = await fs.readFile(path.join(tmpDir, "reports/weekly.md"), "utf-8");
      expect(content).toBe("# Weekly Report");
    });

    it("creates parent directories if they do not exist", async () => {
      const store = new WorkspaceStore(tmpDir);
      await store.writeFile("scratchpad/deep/nested/file.md", "content");
      const content = await fs.readFile(path.join(tmpDir, "scratchpad/deep/nested/file.md"), "utf-8");
      expect(content).toBe("content");
    });

    it("throws when writing to root (e.g. KNOWLEDGE.md)", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("KNOWLEDGE.md", "hacked")).rejects.toThrow(/not writable/i);
    });

    it("throws when writing to AGENT.md at root", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("AGENT.md", "hacked")).rejects.toThrow(/not writable/i);
    });

    it("throws when writing to an arbitrary subdirectory", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("skills/config.md", "hacked")).rejects.toThrow(/not writable/i);
    });

    it("throws on path traversal with '..'", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("scratchpad/../AGENT.md", "hacked")).rejects.toThrow(/invalid path/i);
    });

    it("throws on absolute path starting with '/'", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("/tmp/evil.md", "hacked")).rejects.toThrow(/invalid path/i);
    });

    it("throws on path containing null bytes", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("scratchpad/\0evil.md", "hacked")).rejects.toThrow(/invalid path/i);
    });

    it("throws for non-.md files", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.writeFile("scratchpad/data.json", "{}")).rejects.toThrow(/only .md files/i);
    });
  });

  // -------------------------------------------------------------------------
  // listFiles
  // -------------------------------------------------------------------------
  describe("listFiles", () => {
    it("returns all .md files recursively", async () => {
      await writeFixture(tmpDir, "AGENT.md", "agent");
      await writeFixture(tmpDir, "KNOWLEDGE.md", "knowledge");
      await writeFixture(tmpDir, "POLICY.md", "policy");
      await writeFixture(tmpDir, "scratchpad/notes.md", "notes");
      await writeFixture(tmpDir, "reports/weekly.md", "weekly");
      // Non-.md file should be excluded
      await writeFixture(tmpDir, "scratchpad/data.json", "{}");

      const store = new WorkspaceStore(tmpDir);
      const files = await store.listFiles();

      expect(files).toContain("AGENT.md");
      expect(files).toContain("KNOWLEDGE.md");
      expect(files).toContain("POLICY.md");
      expect(files).toContain("scratchpad/notes.md");
      expect(files).toContain("reports/weekly.md");
      expect(files).not.toContain("scratchpad/data.json");
      expect(files).toHaveLength(5);
    });

    it("returns empty array for empty workspace", async () => {
      const store = new WorkspaceStore(tmpDir);
      const files = await store.listFiles();
      expect(files).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // exists
  // -------------------------------------------------------------------------
  describe("exists", () => {
    it("returns true for existing file", async () => {
      await writeFixture(tmpDir, "AGENT.md", "content");
      const store = new WorkspaceStore(tmpDir);
      expect(await store.exists("AGENT.md")).toBe(true);
    });

    it("returns false for non-existent file", async () => {
      const store = new WorkspaceStore(tmpDir);
      expect(await store.exists("MISSING.md")).toBe(false);
    });

    it("returns true for files in subdirectories", async () => {
      await writeFixture(tmpDir, "scratchpad/notes.md", "notes");
      const store = new WorkspaceStore(tmpDir);
      expect(await store.exists("scratchpad/notes.md")).toBe(true);
    });

    it("throws on path traversal", async () => {
      const store = new WorkspaceStore(tmpDir);
      await expect(store.exists("../outside.md")).rejects.toThrow(/invalid path/i);
    });
  });

  // -------------------------------------------------------------------------
  // loadIdentity
  // -------------------------------------------------------------------------
  describe("loadIdentity", () => {
    it("returns all files when all are present", async () => {
      await writeFixture(tmpDir, "AGENT.md", "# Agent");
      await writeFixture(tmpDir, "KNOWLEDGE.md", "# Knowledge");
      await writeFixture(tmpDir, "POLICY.md", "# Policy");

      const store = new WorkspaceStore(tmpDir);
      const identity = await store.loadIdentity();

      expect(identity.agentMd).toBe("# Agent");
      expect(identity.knowledgeMd).toBe("# Knowledge");
      expect(identity.policyMd).toBe("# Policy");
    });

    it("returns null for missing files", async () => {
      const store = new WorkspaceStore(tmpDir);
      const identity = await store.loadIdentity();

      expect(identity.agentMd).toBeNull();
      expect(identity.knowledgeMd).toBeNull();
      expect(identity.policyMd).toBeNull();
    });

    it("returns partial results when some files exist", async () => {
      await writeFixture(tmpDir, "AGENT.md", "# Agent only");

      const store = new WorkspaceStore(tmpDir);
      const identity = await store.loadIdentity();

      expect(identity.agentMd).toBe("# Agent only");
      expect(identity.knowledgeMd).toBeNull();
      expect(identity.policyMd).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// initializeWorkspace
// ---------------------------------------------------------------------------
describe("initializeWorkspace", () => {
  beforeEach(async () => {
    tmpDir = await createTmpWorkspace();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("creates directory structure and default files", async () => {
    const wsPath = path.join(tmpDir, "agent_workspace");
    await initializeWorkspace(wsPath, "Ad Guardian", "Monitor wasted ad spend");

    // Check directories exist
    const scratchpadStat = await fs.stat(path.join(wsPath, "scratchpad"));
    expect(scratchpadStat.isDirectory()).toBe(true);

    const reportsStat = await fs.stat(path.join(wsPath, "reports"));
    expect(reportsStat.isDirectory()).toBe(true);

    const skillsStat = await fs.stat(path.join(wsPath, "skills"));
    expect(skillsStat.isDirectory()).toBe(true);

    // Check default files exist and have content
    const agentMd = await fs.readFile(path.join(wsPath, "AGENT.md"), "utf-8");
    expect(agentMd).toContain("Ad Guardian");
    expect(agentMd).toContain("Monitor wasted ad spend");

    const policyMd = await fs.readFile(path.join(wsPath, "POLICY.md"), "utf-8");
    expect(policyMd.length).toBeGreaterThan(0);

    const knowledgeMd = await fs.readFile(path.join(wsPath, "KNOWLEDGE.md"), "utf-8");
    expect(knowledgeMd.length).toBeGreaterThan(0);
  });

  it("can be read by WorkspaceStore after initialization", async () => {
    const wsPath = path.join(tmpDir, "agent_workspace");
    await initializeWorkspace(wsPath, "Test Agent", "Test intent");

    const store = new WorkspaceStore(wsPath);
    const identity = await store.loadIdentity();

    expect(identity.agentMd).toContain("Test Agent");
    expect(identity.agentMd).toContain("Test intent");
    expect(identity.policyMd).not.toBeNull();
    expect(identity.knowledgeMd).not.toBeNull();
  });

  it("does not overwrite existing files", async () => {
    const wsPath = path.join(tmpDir, "agent_workspace");
    await fs.mkdir(wsPath, { recursive: true });
    await fs.writeFile(path.join(wsPath, "AGENT.md"), "# Custom Agent", "utf-8");

    await initializeWorkspace(wsPath, "New Name", "New intent");

    const agentMd = await fs.readFile(path.join(wsPath, "AGENT.md"), "utf-8");
    expect(agentMd).toBe("# Custom Agent");
  });
});
