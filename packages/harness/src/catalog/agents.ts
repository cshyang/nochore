import { getRepoRoot } from "../workspace";
import {
  listCapabilityEntries,
  parseDescription,
  parseName,
  parseStringMetadata,
  sortCapabilityEntries,
} from "./shared";
import { getCapabilityKindRoot } from "./paths";
import type { AgentDefinition, CapabilityLookupOptions } from "./types";

export function listAgentDefinitions(options?: CapabilityLookupOptions): AgentDefinition[] {
  const repoRoot = options?.repoRoot ?? getRepoRoot();
  const capabilityRoot = options?.rootDir ?? getCapabilityKindRoot("agents", repoRoot);

  const capabilities = loadAgentDefinitionsFromRoot(capabilityRoot, "capabilities");

  return sortCapabilityEntries(capabilities);
}

export function getAgentDefinitionById(
  agentId: string,
  options?: CapabilityLookupOptions,
): AgentDefinition | null {
  return listAgentDefinitions(options).find((definition) => definition.id === agentId) ?? null;
}

function loadAgentDefinitionsFromRoot(rootDir: string, origin: AgentDefinition["origin"]): AgentDefinition[] {
  return listCapabilityEntries(rootDir, "AGENT.md", origin).map((entry) => ({
    id: entry.id,
    name: parseName(entry.id, entry.body, entry.metadata),
    description: parseDescription(entry.body, entry.metadata, "Reusable agent definition."),
    path: entry.path,
    source: entry.source,
    body: entry.body,
    origin: entry.origin,
    instructions: entry.body.trim(),
    icon: parseStringMetadata(entry.metadata, "icon"),
    model: parseStringMetadata(entry.metadata, "model"),
    role: parseStringMetadata(entry.metadata, "role"),
    sourceType: parseStringMetadata(entry.metadata, "source"),
  }));
}
