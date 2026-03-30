import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getAgentDefinitionById,
  getPromptDefinitionById,
  listSkillDefinitions,
} from "..";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("capability catalog", () => {
  it("loads skills from capabilities only", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-catalog-"));
    tempDirs.push(root);

    const capabilitiesSkillDir = path.join(root, "capabilities/skills/scout");
    await mkdir(capabilitiesSkillDir, { recursive: true });

    await writeFile(
      path.join(capabilitiesSkillDir, "SKILL.md"),
      ["---", 'name: "Scout"', 'description: "Capability version"', "---", "", "# Scout"].join("\n"),
      "utf-8",
    );

    const skills = listSkillDefinitions({ repoRoot: root });
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe("Scout");
    expect(skills[0]?.origin).toBe("capabilities");
  });

  it("loads prompt and agent definitions from capabilities", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-catalog-"));
    tempDirs.push(root);

    const promptDir = path.join(root, "capabilities/prompts/onboard-agent");
    const agentDir = path.join(root, "capabilities/agents/analyst");
    await mkdir(promptDir, { recursive: true });
    await mkdir(agentDir, { recursive: true });

    await writeFile(
      path.join(promptDir, "PROMPT.md"),
      ["---", 'name: "Onboard"', 'description: "Prompt"', "---", "", "Hello {{name}}"].join("\n"),
      "utf-8",
    );
    await writeFile(
      path.join(agentDir, "AGENT.md"),
      ["---", 'name: "Analyst"', 'description: "Agent"', "---", "", "Analyze carefully."].join("\n"),
      "utf-8",
    );

    expect(getPromptDefinitionById("onboard-agent", { repoRoot: root })?.template).toBe("Hello {{name}}");
    expect(getAgentDefinitionById("analyst", { repoRoot: root })?.instructions).toBe("Analyze carefully.");
  });

  it("never reads .claude capability content", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-catalog-"));
    tempDirs.push(root);

    const claudeSkillDir = path.join(root, ".claude/skills/hidden-skill");
    await mkdir(claudeSkillDir, { recursive: true });
    await writeFile(path.join(claudeSkillDir, "SKILL.md"), "# Hidden Skill\n\nShould not be read.", "utf-8");

    const skills = listSkillDefinitions({ repoRoot: root });
    expect(skills).toHaveLength(0);
  });
});
