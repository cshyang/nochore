import { tool } from "ai";
import { z } from "zod";
import type { WorkspaceStore } from "../../workspace/store";

export function createGenerateReportTool(workspace: WorkspaceStore) {
  return tool({
    description:
      "Generate a report and save it to the reports directory. Use this when the user asks for a summary, analysis report, or formatted output.",
    parameters: z.object({
      filename: z
        .string()
        .describe("Report filename (e.g., 'weekly-summary.md')"),
      content: z.string().describe("Full report content in markdown"),
    }),
    execute: async ({ filename, content }) => {
      await workspace.writeFile(`reports/${filename}`, content);
      return { written: true as const, path: `reports/${filename}` };
    },
  });
}
