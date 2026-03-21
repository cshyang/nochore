import type { ActionProposal, ExecutionResult } from "../../types/action";
import type { StepOutput } from "../../types/run";
import type { ConnectionManager } from "../../connections/types";

// ---------------------------------------------------------------------------
// executeActions — pipeline step 7: run approved proposals via connections
// ---------------------------------------------------------------------------

/**
 * Sequentially executes approved action proposals via the ConnectionManager.
 *
 * - Checks each proposal's idempotencyKey against executedKeys to prevent
 *   duplicate execution (returns "skipped" status for seen keys)
 * - On success: records the key in executedKeys
 * - On error: catches the exception, records "failed" status, continues
 * - Returns per-proposal results and aggregate counts
 */
export async function executeActions(params: {
  proposals: ActionProposal[];
  connectionManager: ConnectionManager;
  executedKeys?: Set<string>;
}): Promise<{ results: ExecutionResult[]; stepOutput: StepOutput }> {
  const start = performance.now();
  const executedKeys = params.executedKeys ?? new Set<string>();
  const results: ExecutionResult[] = [];

  let executed = 0;
  let failed = 0;
  let skipped = 0;

  for (const proposal of params.proposals) {
    // Idempotency check
    if (executedKeys.has(proposal.idempotencyKey)) {
      results.push({
        proposalId: proposal.id,
        status: "skipped",
        executedAt: new Date(),
      });
      skipped++;
      continue;
    }

    try {
      const cmResult = await params.connectionManager.execute(
        proposal.action,
        proposal.toolCategory,
        proposal.args,
      );

      results.push({
        proposalId: proposal.id,
        status: "executed",
        output: cmResult.output,
        executedAt: new Date(),
      });

      executedKeys.add(proposal.idempotencyKey);
      executed++;
    } catch (err) {
      results.push({
        proposalId: proposal.id,
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        executedAt: new Date(),
      });
      failed++;
    }
  }

  return {
    results,
    stepOutput: {
      step: "execute",
      duration: performance.now() - start,
      data: {
        total: params.proposals.length,
        executed,
        failed,
        skipped,
      },
    },
  };
}
