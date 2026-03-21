// ---------------------------------------------------------------------------
// Token budget estimation and section assembly with priority-based truncation
// ---------------------------------------------------------------------------

/**
 * Estimate the number of tokens in a text string.
 * Uses a simple char/4 heuristic (good enough for budget planning).
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * A labeled section of a system prompt with a priority for truncation.
 * Lower priority number = higher importance (truncated last).
 */
export interface Section {
  content: string;
  priority: number;
  label: string;
}

/**
 * Assemble multiple sections into a single system prompt string.
 *
 * 1. Filters out sections with empty content
 * 2. Sorts sections by priority (ascending = highest priority first)
 * 3. Builds combined text with `## Label` headers
 * 4. If maxTokens is specified and the total exceeds the budget:
 *    - Keeps high-priority sections intact
 *    - Truncates lowest-priority sections first (from the end)
 *    - Adds "[truncated]" marker when content is cut
 */
export function assembleSections(
  sections: Section[],
  maxTokens?: number
): string {
  // Filter out empty sections
  const nonEmpty = sections.filter((s) => s.content.length > 0);
  if (nonEmpty.length === 0) return "";

  // Sort by priority (ascending — lower number = higher priority)
  const sorted = [...nonEmpty].sort((a, b) => a.priority - b.priority);

  // Build section blocks
  const blocks = sorted.map((s) => `## ${s.label}\n${s.content}`);

  // If no budget, join and return
  if (maxTokens === undefined) {
    return blocks.join("\n\n");
  }

  // Check if we're within budget
  const combined = blocks.join("\n\n");
  if (estimateTokens(combined) <= maxTokens) {
    return combined;
  }

  // Over budget — truncate from the end (lowest priority)
  // Strategy: work backwards through sorted sections, trimming or removing
  // until we fit within budget. High-priority sections are kept intact.
  const result: string[] = [];
  let usedTokens = 0;

  // Account for separators between sections: (n-1) * "\n\n" = 2 chars each
  const separatorTokens = estimateTokens(
    "\n\n".repeat(Math.max(0, sorted.length - 1))
  );

  const availableTokens = maxTokens - separatorTokens;

  // First pass: calculate token cost of each block
  const blockTokens = blocks.map((b) => estimateTokens(b));
  const totalTokens = blockTokens.reduce((sum, t) => sum + t, 0);

  if (totalTokens <= availableTokens) {
    return blocks.join("\n\n");
  }

  // We need to truncate. Process from highest priority to lowest.
  let remaining = availableTokens;

  for (let i = 0; i < blocks.length; i++) {
    const cost = blockTokens[i];

    if (cost <= remaining) {
      // This section fits entirely
      result.push(blocks[i]);
      remaining -= cost;
    } else if (remaining > 0) {
      // Partial fit — truncate this section's content
      const header = `## ${sorted[i].label}`;
      const headerTokens = estimateTokens(header + "\n");
      const truncateMarker = "\n\n[truncated]";
      const markerTokens = estimateTokens(truncateMarker);

      const contentBudget = Math.max(
        0,
        (remaining - headerTokens - markerTokens) * 4
      );

      if (contentBudget > 0) {
        const truncatedContent = sorted[i].content.slice(0, contentBudget);
        result.push(`${header}\n${truncatedContent}${truncateMarker}`);
      } else {
        result.push(`${header}${truncateMarker}`);
      }
      remaining = 0;
    }
    // else: no room left, skip this section entirely
  }

  return result.join("\n\n");
}
