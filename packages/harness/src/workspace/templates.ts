import * as fs from "fs/promises";
import * as path from "path";

// ---------------------------------------------------------------------------
// Default templates for agent workspace files
// ---------------------------------------------------------------------------

/**
 * Default AGENT.md template with agent name and intent.
 */
export function defaultAgentMd(name: string, intent: string): string {
  return `# ${name}

## Intent

${intent}

## Personality

Concise, direct, and data-driven. Report findings with confidence.

## Notes

_Add agent-specific notes here._
`;
}

/**
 * Default POLICY.md template with basic policy structure.
 */
export function defaultPolicyMd(): string {
  return `# Policy

## Approval Requirements

- All destructive actions require human approval
- Budget changes above 10% require review

## Operational Constraints

- Respect active hours and freeze periods
- Do not exceed daily action limits

## Guardrails

- Never delete campaigns without explicit instruction
- Always provide reasoning with proposals
`;
}

/**
 * Default KNOWLEDGE.md template (placeholder for human curation).
 */
export function defaultKnowledgeMd(): string {
  return `# Knowledge

_This file is human-curated. Add domain knowledge, brand terms, business context, and other information the agent should know._

## Domain Context

## Brand Terms

## Business Rules
`;
}

// ---------------------------------------------------------------------------
// Workspace initialization
// ---------------------------------------------------------------------------

/** Directories created during workspace initialization. */
const WORKSPACE_DIRS = ["scratchpad", "reports", "skills"];

/** Default files and their template generators. */
const DEFAULT_FILES: Array<{ name: string; content: () => string }> = [
  // AGENT.md uses name/intent — handled separately
  { name: "POLICY.md", content: defaultPolicyMd },
  { name: "KNOWLEDGE.md", content: defaultKnowledgeMd },
];

/**
 * Create the workspace directory structure and write default files.
 * Does not overwrite existing files.
 */
export async function initializeWorkspace(
  basePath: string,
  name: string,
  intent: string
): Promise<void> {
  // Create base directory and subdirectories
  await fs.mkdir(basePath, { recursive: true });
  for (const dir of WORKSPACE_DIRS) {
    await fs.mkdir(path.join(basePath, dir), { recursive: true });
  }

  // Write AGENT.md (uses name and intent)
  await writeIfMissing(
    path.join(basePath, "AGENT.md"),
    defaultAgentMd(name, intent)
  );

  // Write remaining default files
  for (const file of DEFAULT_FILES) {
    await writeIfMissing(path.join(basePath, file.name), file.content());
  }
}

/**
 * Write a file only if it does not already exist.
 */
async function writeIfMissing(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await fs.access(filePath);
    // File exists — do not overwrite
  } catch {
    // File does not exist — write it
    await fs.writeFile(filePath, content, "utf-8");
  }
}
