import { join } from "node:path";
import { getRepoRoot } from "../workspace";

export type CapabilityKind = "skills" | "agents" | "prompts";

export function getCapabilitiesRoot(repoRoot = getRepoRoot()): string {
  return join(repoRoot, "capabilities");
}

export function getCapabilityKindRoot(kind: CapabilityKind, repoRoot = getRepoRoot()): string {
  return join(getCapabilitiesRoot(repoRoot), kind);
}
