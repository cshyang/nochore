import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";
import { WorkspaceStore } from "../../workspace/store";
import { createReadWorkspaceTool } from "../tools/read-workspace";
import { createWriteScratchpadTool } from "../tools/write-scratchpad";
import { createGenerateReportTool } from "../tools/generate-report";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

async function createTmpWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chat-tools-test-"));
  await fs.mkdir(path.join(dir, "scratchpad"), { recursive: true });
  await fs.mkdir(path.join(dir, "reports"), { recursive: true });
  return dir;
}

async function writeFixture(
  basePath: string,
  relativePath: string,
  content: string
): Promise<void> {
  const fullPath = path.join(basePath, relativePath);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, "utf-8");
}

// ---------------------------------------------------------------------------
// read-workspace tool
// ---------------------------------------------------------------------------
describe("createReadWorkspaceTool", () => {
  beforeEach(async () => {
    tmpDir = await createTmpWorkspace();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("has description and parameters properties (valid AI SDK tool shape)", () => {
    const workspace = new WorkspaceStore(tmpDir);
    const readTool = createReadWorkspaceTool(workspace);

    expect(readTool).toHaveProperty("description");
    expect(readTool).toHaveProperty("parameters");
    expect(readTool).toHaveProperty("execute");
    expect(typeof readTool.description).toBe("string");
    expect(readTool.description!.length).toBeGreaterThan(0);
  });

  it("reads existing AGENT.md and returns { found: true, content }", async () => {
    await writeFixture(tmpDir, "AGENT.md", "# Test Agent\nIntent: monitor ads");
    const workspace = new WorkspaceStore(tmpDir);
    const readTool = createReadWorkspaceTool(workspace);

    const result = await readTool.execute!(
      { path: "AGENT.md" },
      { toolCallId: "test-1", messages: [], abortSignal: undefined as any }
    );

    expect(result).toEqual({
      found: true,
      path: "AGENT.md",
      content: "# Test Agent\nIntent: monitor ads",
    });
  });

  it("reads missing file and returns { found: false }", async () => {
    const workspace = new WorkspaceStore(tmpDir);
    const readTool = createReadWorkspaceTool(workspace);

    const result = await readTool.execute!(
      { path: "NONEXISTENT.md" },
      { toolCallId: "test-2", messages: [], abortSignal: undefined as any }
    );

    expect(result).toEqual({
      found: false,
      path: "NONEXISTENT.md",
    });
  });

  it("reads files in subdirectories", async () => {
    await writeFixture(tmpDir, "scratchpad/notes.md", "some notes here");
    const workspace = new WorkspaceStore(tmpDir);
    const readTool = createReadWorkspaceTool(workspace);

    const result = await readTool.execute!(
      { path: "scratchpad/notes.md" },
      { toolCallId: "test-3", messages: [], abortSignal: undefined as any }
    );

    expect(result).toEqual({
      found: true,
      path: "scratchpad/notes.md",
      content: "some notes here",
    });
  });
});

// ---------------------------------------------------------------------------
// write-scratchpad tool
// ---------------------------------------------------------------------------
describe("createWriteScratchpadTool", () => {
  beforeEach(async () => {
    tmpDir = await createTmpWorkspace();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("has description and parameters properties (valid AI SDK tool shape)", () => {
    const workspace = new WorkspaceStore(tmpDir);
    const writeTool = createWriteScratchpadTool(workspace);

    expect(writeTool).toHaveProperty("description");
    expect(writeTool).toHaveProperty("parameters");
    expect(writeTool).toHaveProperty("execute");
    expect(typeof writeTool.description).toBe("string");
    expect(writeTool.description!.length).toBeGreaterThan(0);
  });

  it("writes file and content appears on disk", async () => {
    const workspace = new WorkspaceStore(tmpDir);
    const writeTool = createWriteScratchpadTool(workspace);

    await writeTool.execute!(
      { filename: "observations.md", content: "# Observations\nSpend is up 20%" },
      { toolCallId: "test-4", messages: [], abortSignal: undefined as any }
    );

    const onDisk = await fs.readFile(
      path.join(tmpDir, "scratchpad/observations.md"),
      "utf-8"
    );
    expect(onDisk).toBe("# Observations\nSpend is up 20%");
  });

  it("returns { written: true, path }", async () => {
    const workspace = new WorkspaceStore(tmpDir);
    const writeTool = createWriteScratchpadTool(workspace);

    const result = await writeTool.execute!(
      { filename: "notes.md", content: "some notes" },
      { toolCallId: "test-5", messages: [], abortSignal: undefined as any }
    );

    expect(result).toEqual({
      written: true,
      path: "scratchpad/notes.md",
    });
  });
});

// ---------------------------------------------------------------------------
// generate-report tool
// ---------------------------------------------------------------------------
describe("createGenerateReportTool", () => {
  beforeEach(async () => {
    tmpDir = await createTmpWorkspace();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("has description and parameters properties (valid AI SDK tool shape)", () => {
    const workspace = new WorkspaceStore(tmpDir);
    const reportTool = createGenerateReportTool(workspace);

    expect(reportTool).toHaveProperty("description");
    expect(reportTool).toHaveProperty("parameters");
    expect(reportTool).toHaveProperty("execute");
    expect(typeof reportTool.description).toBe("string");
    expect(reportTool.description!.length).toBeGreaterThan(0);
  });

  it("writes to reports/ and content appears on disk", async () => {
    const workspace = new WorkspaceStore(tmpDir);
    const reportTool = createGenerateReportTool(workspace);

    await reportTool.execute!(
      { filename: "weekly-summary.md", content: "# Weekly Summary\n\nAll good." },
      { toolCallId: "test-6", messages: [], abortSignal: undefined as any }
    );

    const onDisk = await fs.readFile(
      path.join(tmpDir, "reports/weekly-summary.md"),
      "utf-8"
    );
    expect(onDisk).toBe("# Weekly Summary\n\nAll good.");
  });

  it("returns { written: true, path }", async () => {
    const workspace = new WorkspaceStore(tmpDir);
    const reportTool = createGenerateReportTool(workspace);

    const result = await reportTool.execute!(
      { filename: "analysis.md", content: "# Analysis\nFindings here." },
      { toolCallId: "test-7", messages: [], abortSignal: undefined as any }
    );

    expect(result).toEqual({
      written: true,
      path: "reports/analysis.md",
    });
  });
});
