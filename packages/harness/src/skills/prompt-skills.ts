import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getRepoRoot } from "../workspace";

export interface PromptSkill {
  id: string;
  name: string;
  description: string;
  path: string;
  knowledgeFiles: string[];
  instructions: string;
  product: boolean;
}

const PRODUCT_MARKER = "product: true";

export function listPromptSkills(options?: { rootDir?: string; productOnly?: boolean }): PromptSkill[] {
  const skillsRoot = options?.rootDir ?? join(getRepoRoot(), ".agents/skills");
  if (!existsSync(skillsRoot)) {
    return [];
  }

  return readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const skillPath = join(skillsRoot, entry.name);
      const markdownPath = join(skillPath, "SKILL.md");
      if (!existsSync(markdownPath)) {
        return null;
      }

      const source = readFileSync(markdownPath, "utf-8");
      const description = extractDescription(source);
      const name = extractName(source) ?? humanize(entry.name);
      const knowledgeDir = join(skillPath, "knowledge");
      const knowledgeFiles = existsSync(knowledgeDir)
        ? readdirSync(knowledgeDir)
            .filter((file) => file.endsWith(".md"))
            .map((file) => join(knowledgeDir, file))
        : [];

      return {
        id: entry.name,
        name,
        description,
        path: markdownPath,
        knowledgeFiles,
        instructions: source,
        product: source.includes(PRODUCT_MARKER),
      } satisfies PromptSkill;
    })
    .filter((skill): skill is PromptSkill => skill !== null)
    .filter((skill) => ((options?.productOnly ?? true) ? skill.product : true))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getPromptSkillById(
  skillId: string,
  options?: { rootDir?: string; productOnly?: boolean },
): PromptSkill | null {
  return listPromptSkills(options).find((skill) => skill.id === skillId) ?? null;
}

function extractName(source: string): string | null {
  const heading = source.match(/^#\s+(.+)$/m);
  if (heading?.[1]) {
    return heading[1].trim();
  }

  const frontmatterName = source.match(/name:\s*["']?(.+?)["']?\s*$/m);
  return frontmatterName?.[1]?.trim() ?? null;
}

function extractDescription(source: string): string {
  const frontmatterDescription = source.match(/description:\s*["']?(.+?)["']?\s*$/m);
  if (frontmatterDescription?.[1]) {
    return frontmatterDescription[1].trim();
  }

  const lines = source
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("#"))
    .filter((line) => !line.startsWith("---"))
    .filter((line) => !line.includes(":") || line.startsWith("Use "));

  return lines[0] ?? "Reusable prompt skill";
}

function humanize(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
