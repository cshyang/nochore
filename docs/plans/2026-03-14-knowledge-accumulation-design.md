# Knowledge Accumulation Design

**Date:** 2026-03-14
**Goal:** Give the AI agent a persistent notebook per client so it accumulates knowledge across sessions.

## Architecture Decision

No SQLite, no CLI commands, no schema. Just a markdown file per client that the agent reads and writes directly.

**Why markdown over SQLite:**
- Agent can read/write files natively — no CLI wrapper needed
- Human-readable, git-diffable
- At current scale (2 clients, weekly analysis), one file per client stays small for months
- Zero infrastructure — no migrations, no dependencies

## Storage

One file per client: `data/<client_id>/knowledge.md`

Format:
```markdown
# Knowledge — <Client Name>

## YYYY-MM-DD
- Insight or pattern observed
- Recommendation made
- Outcome of previous recommendation

## YYYY-MM-DD
- Updated: revised understanding of earlier insight
```

Grouped by date. Agent appends new sections, edits existing entries in place.

## CLI Integration

No `knowledge` command group. The CLI surfaces knowledge in existing commands:

1. **`status`** — adds `knowledge_file` path and `knowledge_exists` boolean
2. **`check` / `investigate` / `brief`** — reads knowledge file and includes content in JSON output alongside analysis results

The agent gets context + knowledge + fresh analysis in one call.

## Agent Workflow

1. Agent runs `campaign --format json check <client>` → gets everything in one payload
2. Agent reasons about fresh analysis informed by past knowledge
3. Agent writes/edits `data/<client_id>/knowledge.md` directly via file I/O
4. Next session, step 1 includes the updated knowledge

## Future Scaling

If a client's knowledge file exceeds ~500 lines, archive older entries to `knowledge-archive.md`. Not needed now.

If structured queries become necessary (thousands of entries, cross-client patterns), migrate to SQLite then. YAGNI for now.
