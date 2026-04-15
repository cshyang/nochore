import type { RunView } from "./types";

// Approximate USD cost of LLM inference per token, per model.
// Source: Anthropic pricing page for Claude Sonnet 4 (as of 2026-04).
// Displayed with a tilde prefix so users see these are estimates, not billed
// amounts. Replace with per-model lookup when we run multiple models.
const COST_PER_INPUT_TOKEN = 3 / 1_000_000; // $3 / 1M tokens
const COST_PER_OUTPUT_TOKEN = 15 / 1_000_000; // $15 / 1M tokens

export interface RunStats {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costEstimate: number; // USD, approximate
  durationMs: number; // 0 if the run is still in progress
  turns: number; // LLM turns that issued tool calls (approximated by tool_called events)
  toolCalls: number;
  subagents: number; // work items representing child runs
}

export function estimateCost(inputTokens: number, outputTokens: number): number {
  return inputTokens * COST_PER_INPUT_TOKEN + outputTokens * COST_PER_OUTPUT_TOKEN;
}

// Handles placeholder/empty runs gracefully — missing events/workItems arrays
// fall through to zeros without throwing. AgentWorkspace synthesizes runs
// before the SSE snapshot catches up, so this must stay tolerant.
export function summarizeRun(run: RunView): RunStats {
  const workItems = run.workItems ?? [];
  const events = run.events ?? [];

  let inputTokens = 0;
  let outputTokens = 0;
  let subagents = 0;
  for (const wi of workItems) {
    if (wi.kind === "worker_run") subagents += 1;
    inputTokens += wi.inputTokens ?? 0;
    outputTokens += wi.outputTokens ?? 0;
  }

  const toolCalls = events.filter((e) => e.type === "tool_called").length;

  const durationMs =
    run.completedAt && run.startedAt
      ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
      : 0;

  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costEstimate: estimateCost(inputTokens, outputTokens),
    durationMs: Math.max(0, durationMs),
    // Approximation: we don't emit turn boundaries today; each tool call
    // rounds to ~1 turn. Good enough for "N turns" copy.
    turns: toolCalls,
    toolCalls,
    subagents,
  };
}

export interface RunsAggregate {
  runCount: number;
  totalCost: number;
  totalTokens: number;
  pendingApprovals: number;
  failedCount: number;
}

// Sum across runs that started within the last `windowDays`.
// Caller owns the time window; this is a pure fold.
export function summarizeRuns(runs: RunView[], windowDays = 7): RunsAggregate {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;

  let runCount = 0;
  let totalCost = 0;
  let totalTokens = 0;
  let pendingApprovals = 0;
  let failedCount = 0;

  for (const run of runs) {
    if (new Date(run.startedAt).getTime() < cutoff) continue;
    runCount += 1;
    if (run.status === "failed") failedCount += 1;
    pendingApprovals += (run.approvals ?? []).filter((a) => a.status === "pending").length;
    const stats = summarizeRun(run);
    totalCost += stats.costEstimate;
    totalTokens += stats.totalTokens;
  }

  return { runCount, totalCost, totalTokens, pendingApprovals, failedCount };
}

export interface OutOfRangeResult {
  flagged: boolean;
  observed: number;
  typicalMedian: number;
  priorCount: number;
  ratio: number; // observed / typicalMedian, or 0 if no history / zero median
}

const MIN_HISTORY_FOR_FLAG = 5;

// Flag a run's metric as out-of-range when we have at least 5 prior completed
// runs AND observed > threshold × median of priors. Zero-valued priors are
// skipped so a backlog of empty runs doesn't drag the median to 0.
export function isOutOfRange(
  run: RunView,
  priorRuns: RunView[],
  metric: "tokens" | "cost" | "durationMs" = "tokens",
  threshold = 3,
): OutOfRangeResult {
  const pick = (s: RunStats): number => {
    if (metric === "tokens") return s.totalTokens;
    if (metric === "cost") return s.costEstimate;
    return s.durationMs;
  };

  const observed = pick(summarizeRun(run));

  const priorValues = priorRuns
    .filter((r) => r.status === "completed" && r.id !== run.id)
    .map((r) => pick(summarizeRun(r)))
    .filter((v) => v > 0);

  if (priorValues.length < MIN_HISTORY_FOR_FLAG) {
    return { flagged: false, observed, typicalMedian: 0, priorCount: priorValues.length, ratio: 0 };
  }

  const typicalMedian = median(priorValues);
  const ratio = typicalMedian > 0 ? observed / typicalMedian : 0;
  return {
    flagged: ratio > threshold,
    observed,
    typicalMedian,
    priorCount: priorValues.length,
    ratio,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// ---------------------------------------------------------------------------
// Presentation helpers — strings the UI renders directly
// ---------------------------------------------------------------------------

export function formatTokens(tokens: number): string {
  if (tokens === 0) return "0 tokens";
  if (tokens < 1000) return `${tokens} tokens`;
  if (tokens < 100_000) return `${(tokens / 1000).toFixed(1)}k tokens`;
  return `${Math.round(tokens / 1000).toLocaleString()}k tokens`;
}

// Tilde prefix signals approximation. Prevents trust erosion when the final
// bill doesn't match this string to the penny.
export function formatCost(cost: number): string {
  if (cost === 0) return "~$0.00";
  if (cost < 0.01) return "~<$0.01";
  if (cost < 100) return `~$${cost.toFixed(2)}`;
  return `~$${Math.round(cost).toLocaleString()}`;
}
