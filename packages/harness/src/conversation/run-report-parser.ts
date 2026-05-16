import { generateObject, type LanguageModel } from "ai";
import { z } from "zod";
import type { RunFinding, RunFindingSeverity } from "../types";

const StructuredReportSchema = z.object({
  headline: z.string().min(1).max(160),
  overallSeverity: z.enum(["critical", "warning", "watch", "winner", "info", "success"]),
  findings: z
    .array(
      z.object({
        severity: z.enum(["critical", "warning", "watch", "winner", "info", "success"]),
        title: z.string().min(1).max(140),
        body: z.string().max(2000),
      }),
    )
    .max(8),
});

const EXTRACTION_PROMPT = `You are extracting structured findings from an agent's run report.

Severity rules:
- "critical": blockers, urgent actions, errors, things that prevent further work
- "warning": items needing attention, regressions, anomalies
- "watch": items to monitor over time but not urgent
- "winner": top performers, successes worth scaling
- "success": healthy/baseline-positive states
- "info": neutral observations, context

Rules:
- The headline must be one line (max 140 chars) capturing the most important signal
- overallSeverity matches the headline's severity
- Findings are concise — title is one line, body is up to a paragraph of markdown
- Skip purely structural content (table of contents, navigational headers)
- Order findings by severity (critical first), then by impact

Report:
---
{report}
---`;

/**
 * LLM-based structured extraction. Returns null on failure; caller should fall
 * back to {@link parseRunReport}.
 */
export async function extractStructuredReport(
  model: LanguageModel,
  reportText: string,
): Promise<{
  headline: string;
  overallSeverity: RunFindingSeverity;
  findings: RunFinding[];
} | null> {
  if (!reportText.trim()) return null;

  try {
    const result = await generateObject({
      model,
      schema: StructuredReportSchema,
      prompt: EXTRACTION_PROMPT.replace("{report}", reportText),
    });
    return result.object;
  } catch {
    return null;
  }
}

const SEVERITY_MARKERS: Array<{ severity: RunFindingSeverity; tokens: RegExp }> = [
  { severity: "critical", tokens: /(🛑|🚨|❌|CRITICAL|URGENT|BLOCKER)/i },
  { severity: "warning", tokens: /(⚠️|WATCH|WARNING|CAUTION|ALERT)/i },
  { severity: "winner", tokens: /(🏆|🎉|WINNER|BEST|TOP)/i },
  { severity: "success", tokens: /(✅|🟢|SUCCESS|HEALTHY|GOOD|SOLID)/i },
  { severity: "watch", tokens: /(👀|MONITOR|REVIEW|CHECK)/i },
];

function inferSeverity(text: string): RunFindingSeverity {
  for (const { severity, tokens } of SEVERITY_MARKERS) {
    if (tokens.test(text)) return severity;
  }
  return "info";
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/;

interface Section {
  level: number;
  title: string;
  body: string[];
}

/**
 * Parses freeform agent report markdown into a structured findings list.
 *
 * Heuristic only — looks for markdown headings and groups paragraphs underneath
 * each heading into a section. Severity is inferred from emoji/keyword markers
 * in the heading text. If no headings are present, returns an empty findings
 * array (caller should fall back to `finalText`).
 */
export function parseRunReport(text: string): {
  headline: string;
  overallSeverity: RunFindingSeverity;
  findings: RunFinding[];
} {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let current: Section | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const headingMatch = HEADING_RE.exec(line);
    if (headingMatch?.[1] && headingMatch[2]) {
      if (current) sections.push(current);
      current = { level: headingMatch[1].length, title: headingMatch[2].trim(), body: [] };
    } else if (current) {
      current.body.push(rawLine);
    }
  }
  if (current) sections.push(current);

  if (sections.length === 0) {
    const firstLine =
      text
        .split(/\r?\n/)
        .find((line) => line.trim().length > 0)
        ?.trim() ?? "";
    return {
      headline: firstLine.slice(0, 140),
      overallSeverity: inferSeverity(firstLine),
      findings: [],
    };
  }

  const top = sections[0];
  if (!top) {
    return { headline: "", overallSeverity: "info", findings: [] };
  }

  const findings: RunFinding[] = sections.map((section) => ({
    severity: inferSeverity(section.title),
    title: section.title.replace(/^[\s#]+/, "").trim(),
    body: section.body.join("\n").trim(),
  }));

  return {
    headline: top.title
      .replace(/^[\s#]+/, "")
      .trim()
      .slice(0, 140),
    overallSeverity: inferSeverity(top.title),
    findings,
  };
}
