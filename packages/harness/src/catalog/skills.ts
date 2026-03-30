import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { getRepoRoot } from "../workspace";
import {
  listCapabilityEntries,
  parseBooleanMetadata,
  parseDescription,
  parseName,
  sortCapabilityEntries,
} from "./shared";
import { getCapabilityKindRoot } from "./paths";
import type { CapabilityLookupOptions, SkillDefinition } from "./types";

export function listSkillDefinitions(options?: CapabilityLookupOptions & { productOnly?: boolean }): SkillDefinition[] {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const capabilityRoot = options?.rootDir ?? getCapabilityKindRoot("skills", repoRoot);

  const capabilities = loadSkillDefinitionsFromRoot(capabilityRoot, "capabilities");

  return sortCapabilityEntries(capabilities).filter((skill) =>
    (options?.productOnly ?? true) ? skill.product : true,
  );
}

export function getSkillDefinitionById(
  skillId: string,
  options?: CapabilityLookupOptions & { productOnly?: boolean },
): SkillDefinition | null {
  return listSkillDefinitions(options).find((skill) => skill.id === skillId) ?? null;
}

function loadSkillDefinitionsFromRoot(rootDir: string, origin: SkillDefinition["origin"]): SkillDefinition[] {
  return listCapabilityEntries(rootDir, "SKILL.md", origin).map((entry) => {
    const knowledgeDir = join(rootDir, entry.id, "knowledge");
    return {
      id: entry.id,
      name: parseName(entry.id, entry.body, entry.metadata),
      description: parseDescription(entry.body, entry.metadata, "Reusable prompt skill."),
      path: entry.path,
      source: entry.source,
      body: entry.body,
      origin: entry.origin,
      knowledgeFiles: listKnowledgeFiles(knowledgeDir),
      instructions: entry.source,
      product: parseBooleanMetadata(entry.metadata, "product", true),
    } satisfies SkillDefinition;
  });
}

function listKnowledgeFiles(knowledgeDir: string): string[] {
  if (!existsSync(knowledgeDir)) {
    return [];
  }

  return readdirSync(knowledgeDir)
    .filter((file) => file.endsWith(".md"))
    .map((file) => join(knowledgeDir, file))
    .sort((a, b) => a.localeCompare(b));
}
