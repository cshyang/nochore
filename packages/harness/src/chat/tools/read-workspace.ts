import { tool } from "ai";
import { z } from "zod";
import type { WorkspaceStore } from "../../workspace/store";

export function createReadWorkspaceTool(workspace: WorkspaceStore) {
  return tool({
    description:
      "Read a file from the agent workspace. Use this to check AGENT.md, KNOWLEDGE.md, POLICY.md, or any .md file in the workspace.",
    parameters: z.object({
      path: z
        .string()
        .describe(
          "Relative path to the .md file (e.g., 'AGENT.md', 'scratchpad/notes.md')"
        ),
    }),
    execute: async ({ path }) => {
      const content = await workspace.readFile(path);
      if (content === null) return { found: false as const, path };
      return { found: true as const, path, content };
    },
  });
}
