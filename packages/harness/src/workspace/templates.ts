import * as fs from "fs/promises";
import * as path from "path";

export function defaultKnowledgeMd(): string {
  return `# Knowledge

_Human-curated context for this agent. Add domain rules, business constraints, definitions, and useful references here._

## Context

## Business Rules

## References
`;
}

export async function initializeWorkspace(basePath: string): Promise<void> {
  await fs.mkdir(basePath, { recursive: true });
  await fs.mkdir(path.join(basePath, "scratchpad"), { recursive: true });
  await writeIfMissing(path.join(basePath, "KNOWLEDGE.md"), defaultKnowledgeMd());
}

async function writeIfMissing(filePath: string, content: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, content, "utf-8");
  }
}
