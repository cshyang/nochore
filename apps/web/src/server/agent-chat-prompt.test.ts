import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAgentChatSystemPrompt } from "./agent-chat-prompt";

const tempDirs: string[] = [];
const previousProjectRoot = process.env.PROJECT_ROOT;

afterEach(async () => {
  process.env.PROJECT_ROOT = previousProjectRoot;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("buildAgentChatSystemPrompt", () => {
  it("loads the chat template from capabilities and interpolates agent data", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-chat-"));
    tempDirs.push(root);
    process.env.PROJECT_ROOT = root;

    const templatePath = path.join(root, "capabilities/prompts/agent-chat");
    await mkdir(templatePath, { recursive: true });
    await writeFile(
      path.join(templatePath, "PROMPT.md"),
      [
        "Agent: {{agentName}}",
        "Desc: {{agentDescription}}",
        "Instructions: {{agentInstructions}}",
        "Skills: {{skills}}",
        "Schedule: {{schedule}}",
      ].join("\n"),
      "utf-8",
    );

    const prompt = buildAgentChatSystemPrompt({
      name: "Watcher",
      description: "Tracks campaign changes.",
      instructions: "Stay precise.",
      schedule: "daily",
      skills: ["campaign-analysis", "campaign-reviewer"],
    });

    expect(prompt).toContain("Watcher");
    expect(prompt).toContain("Tracks campaign changes.");
    expect(prompt).toContain("Stay precise.");
    expect(prompt).toContain("daily");
    expect(prompt).toContain("campaign-analysis, campaign-reviewer");
  });
});
