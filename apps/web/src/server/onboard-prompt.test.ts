import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildOnboardingSystemPrompt } from "./onboard-prompt";

const tempDirs: string[] = [];
const previousProjectRoot = process.env.PROJECT_ROOT;

afterEach(async () => {
  process.env.PROJECT_ROOT = previousProjectRoot;
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

describe("buildOnboardingSystemPrompt", () => {
  it("loads the onboarding template from capabilities and interpolates runtime values", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "nochore-onboard-"));
    tempDirs.push(root);
    process.env.PROJECT_ROOT = root;

    const templatePath = path.join(root, "capabilities/prompts/onboard-agent");
    await mkdir(templatePath, { recursive: true });
    await writeFile(
      path.join(templatePath, "PROMPT.md"),
      [
        "Alpha {{toolkitList}}",
        "Skills: {{skillsList}}",
        "Connections: {{existingConnections}}",
      ].join("\n"),
      "utf-8",
    );

    const prompt = buildOnboardingSystemPrompt({
      availableSkills: [{ id: "campaign-analysis", name: "Campaign Analysis", description: "Analyze" }],
      existingConnections: ["slack"],
      toolkitSummaries: [{ slug: "googleads", name: "Google Ads", description: "Ads", categories: [], logo: null }],
    });

    expect(prompt).toContain("Alpha");
    expect(prompt).toContain("Google Ads");
    expect(prompt).toContain("campaign-analysis");
    expect(prompt).toContain("Slack");
  });
});
