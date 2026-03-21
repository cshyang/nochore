import { tool } from "ai";
import { z } from "zod";
import type { ApprovalRepository } from "../../repositories/approval";
import type { ConnectionManager } from "../../connections/types";

export interface ApplyActionDeps {
  approvalRepository: ApprovalRepository;
  connectionManager: ConnectionManager;
  agentId: string;
}

interface ActionResult {
  id: string;
  status: "executed" | "not_found_or_already_resolved" | "failed";
  error?: string;
}

export function createApplyActionTool(deps: ApplyActionDeps) {
  return tool({
    description:
      "Approve and execute pending action proposals. Takes a list of proposal IDs, executes them via the connection manager, and marks them as approved.",
    parameters: z.object({
      proposalIds: z
        .array(z.string())
        .describe("List of pending action IDs to approve and execute"),
    }),
    execute: async ({ proposalIds }) => {
      const results: ActionResult[] = [];

      for (const id of proposalIds) {
        try {
          const pending = await deps.approvalRepository.getById(id);

          if (!pending || pending.status !== "pending") {
            results.push({ id, status: "not_found_or_already_resolved" });
            continue;
          }

          const proposal = pending.proposal;

          await deps.connectionManager.execute(
            proposal.action,
            proposal.toolCategory,
            proposal.args
          );

          await deps.approvalRepository.resolve(id, "approved", "Approved via chat");

          results.push({ id, status: "executed" });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          results.push({ id, status: "failed", error: message });
        }
      }

      return { results };
    },
  });
}
