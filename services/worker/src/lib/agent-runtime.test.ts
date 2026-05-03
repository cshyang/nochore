import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgentTaskPrompt } from "./agent-runtime";

const tempDirs: string[] = [];
const previousProjectRoot = process.env.PROJECT_ROOT;

afterEach(async () => {
  process.env.PROJECT_ROOT = previousProjectRoot;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("buildAgentTaskPrompt", () => {
  it("loads specialist role definitions from capabilities", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-specialist-"));
    tempDirs.push(root);
    process.env.PROJECT_ROOT = root;

    const rolePath = path.join(root, "capabilities/agents/analyst");
    await mkdir(rolePath, { recursive: true });
    await writeFile(
      path.join(rolePath, "AGENT.md"),
      ["# Analyst", "", "Catalog-backed analyst prompt."].join("\n"),
      "utf-8",
    );

    const prompt = buildAgentTaskPrompt({
      role: "analyst",
      task: "Summarize the numbers.",
      agentInstructions: "Keep the response concise.",
      context: "Use recent data only.",
    });

    expect(prompt).toContain("Catalog-backed analyst prompt.");
    expect(prompt).toContain("Keep the response concise.");
    expect(prompt).toContain("Summarize the numbers.");
    expect(prompt).toContain("Use recent data only.");
  });
});
