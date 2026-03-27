import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getPromptSkillById, listPromptSkills } from "../prompt-skills";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("prompt skill discovery", () => {
  it("lists only product skills by default and includes knowledge files", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "autoad-skills-"));
    tempDirs.push(root);

    const productSkillDir = path.join(root, "campaign-analysis");
    const internalSkillDir = path.join(root, "internal-helper");
    await mkdir(path.join(productSkillDir, "knowledge"), { recursive: true });
    await mkdir(internalSkillDir, { recursive: true });

    await writeFile(
      path.join(productSkillDir, "SKILL.md"),
      [
        "---",
        'name: "Campaign Analysis"',
        'description: "Analyze paid media performance."',
        "product: true",
        "---",
        "",
        "# Campaign Analysis",
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      path.join(productSkillDir, "knowledge", "heuristics.md"),
      "# Heuristics\n",
      "utf-8",
    );
    await writeFile(
      path.join(internalSkillDir, "SKILL.md"),
      "# Internal Helper\n\nInternal only.",
      "utf-8",
    );

    const skills = listPromptSkills({ rootDir: root });
    expect(skills).toHaveLength(1);
    expect(skills[0]?.id).toBe("campaign-analysis");
    expect(skills[0]?.knowledgeFiles[0]).toContain("heuristics.md");
  });

  it("can return non-product skills and load a skill by id", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "autoad-skills-"));
    tempDirs.push(root);

    const skillDir = path.join(root, "ops-playbook");
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      path.join(skillDir, "SKILL.md"),
      "# Ops Playbook\n\nUse for internal operations.",
      "utf-8",
    );

    const allSkills = listPromptSkills({ rootDir: root, productOnly: false });
    const skill = getPromptSkillById("ops-playbook", {
      rootDir: root,
      productOnly: false,
    });

    expect(allSkills).toHaveLength(1);
    expect(skill?.name).toBe("Ops Playbook");
    expect(skill?.description).toBe("Use for internal operations.");
  });
});
