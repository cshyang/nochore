import { getRepoRoot } from "../workspace";
import {
  listCapabilityEntries,
  parseDescription,
  parseName,
  sortCapabilityEntries,
} from "./shared";
import { getCapabilityKindRoot } from "./paths";
import type { CapabilityLookupOptions, PromptDefinition } from "./types";

export function listPromptDefinitions(options?: CapabilityLookupOptions): PromptDefinition[] {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const capabilityRoot = options?.rootDir ?? getCapabilityKindRoot("prompts", repoRoot);

  const capabilities = loadPromptDefinitionsFromRoot(capabilityRoot, "capabilities");

  return sortCapabilityEntries(capabilities);
}

export function getPromptDefinitionById(
  promptId: string,
  options?: CapabilityLookupOptions,
): PromptDefinition | null {
  return listPromptDefinitions(options).find((prompt) => prompt.id === promptId) ?? null;
}

function loadPromptDefinitionsFromRoot(rootDir: string, origin: PromptDefinition["origin"]): PromptDefinition[] {
  return listCapabilityEntries(rootDir, "PROMPT.md", origin).map((entry) => ({
    id: entry.id,
    name: parseName(entry.id, entry.body, entry.metadata),
    description: parseDescription(entry.body, entry.metadata, "Reusable prompt template."),
    path: entry.path,
    source: entry.source,
    body: entry.body,
    origin: entry.origin,
    template: entry.body.trim(),
  }));
}
