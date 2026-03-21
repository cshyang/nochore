import { tool } from "ai";
import { z } from "zod";
import type { WorkspaceStore } from "../../workspace/store";

export function createWriteScratchpadTool(workspace: WorkspaceStore) {
  return tool({
    description:
      "Write working notes or agent-learned context to the scratchpad directory. Use this to record observations, patterns, or temporary findings.",
    parameters: z.object({
      filename: z
        .string()
        .describe("Filename within scratchpad/ (e.g., 'observations.md')"),
      content: z.string().describe("Content to write"),
    }),
    execute: async ({ filename, content }) => {
      await workspace.writeFile(`scratchpad/${filename}`, content);
      return { written: true as const, path: `scratchpad/${filename}` };
    },
  });
}
