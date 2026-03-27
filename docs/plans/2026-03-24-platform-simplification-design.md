# Platform Simplification: Composio-First Architecture

**Date:** 2026-03-24
**Status:** Approved (brainstormed and validated in session)
**Approach:** Clean up first, then rebuild

## Thesis

The current Nochore architecture over-engineers what the SDKs already provide. A custom 6-step pipeline, skill executor, policy engine, and context assembler (~5,000 LOC in the harness) can be replaced by leveraging Vercel AI SDK's tool loop + Composio's tool ecosystem + Trigger.dev's durability. Our code should only exist at the intersection: tool config, approval flow, and agent scaffolding.

**Validated by:** composio-test prototype (https://github.com/cshyang/composio-test), which achieves ~80% of the functionality with ~20% of the code.

## Architecture Decisions

### 1. Agent Model — Hybrid (DB + Workspace Files)

An agent is:
- **DB record:** name, instructions (text), tool config (JSON), notification config (JSON), schedule
- **Workspace files:** `KNOWLEDGE.md` (human-curated domain knowledge), `scratchpad/` (agent working notes)

Workspace files feed into the system prompt at runtime. No separate ContextAssembler — concatenate instructions + skills + KNOWLEDGE.md into the system prompt directly.

### 2. Execution — Trigger.dev Tasks Only

All agent execution (scheduled + on-demand) goes through a single Trigger.dev task. The task contains a manual tool loop using Vercel AI SDK v6:

```
Trigger.dev task:
  1. Build system prompt (instructions + skills + KNOWLEDGE.md)
  2. Build tool set from Composio (filtered by tool config)
  3. Mark approval-required tools with needsApproval flag
  4. generateText() with tools
  5. SDK auto-executes auto-approved tools
  6. SDK returns tool-approval-request parts for approval-needed tools
  7. For each approval request:
     - evaluatePolicy() — deterministic checks (budget, cooldown, etc.)
     - If policy blocks → deny, feed result back to LLM
     - If policy allows but needs human → wait.forToken() + notify user
     - If policy auto-approves → execute, feed result back to LLM
  8. Loop until LLM returns final text (no more tool calls)
  9. Save run summary to DB
```

**Key:** All Vercel AI SDK usage is contained in this one file (`services/worker/src/triggers/agent-run.ts`). If we swap SDKs later, we rewrite this file only.

### 3. Skills — Reusable Prompt Modules

A skill is a markdown file with instructions. Not code, not an executor.

```
.agents/skills/search-term-analysis/
  SKILL.md        # Instructions for analyzing search terms
  knowledge/      # Optional domain knowledge files
```

At runtime: selected skill prompts are concatenated into the system prompt. The agent reasons with the instructions and uses Composio tools to act.

Skills are:
- Composable (plug into any agent)
- Shareable (global library, per-project, or per-agent)
- Tool-aware (can reference Composio tools by name: "use GOOGLEADS_LIST_CAMPAIGNS to...")

**No SkillRegistry, no SkillExecutor, no execution modes.** Just prompt injection.

### 4. Policy — Separate Testable Function

Policy logic lives in a pure function `evaluatePolicy()`, called from the tool loop:

```typescript
evaluatePolicy(toolCall, agentConfig, runContext) → "auto" | "approval" | "blocked"
```

Checks (in order):
1. Tool-level config (auto vs approval toggle from blueprint)
2. Budget threshold (if action has cost implications)
3. Cooldown (rate limiting — don't pause 100 keywords in one run)
4. Global overrides (if any)

**No LLM in policy. Ever.** Deterministic, fast, testable.

### 5. SDK Containment — No Abstraction Layer

All Vercel AI SDK imports live in the Trigger.dev task file. The agent model, UI, and database schema have zero SDK dependencies. This makes SDK swaps a single-file rewrite, not a migration.

### 6. Database — Fresh Schema

Drop everything, redesign. New tables:

| Table | Purpose |
|---|---|
| `projects` | Workspace roots |
| `agents` | Agent config (instructions, tool_config, notification_config, schedule) |
| `runs` | Execution history (status, summary, started_at, completed_at) |
| `run_events` | Append-only event log per run (tool calls, approvals, findings) |
| `approvals` | Pending/resolved approval requests |
| `lessons` | Accumulated agent learnings (distilled from runs) |

Removed: `skills` table, `pending_actions`, `action_executions`, `chat_messages` (chat is now part of the timeline/run events).

### 7. Connections — Composio Direct

Remove the `ConnectionManager` abstraction, capability maps, and factory. Use Composio SDK directly:

- `composio.tools.get()` — fetch available tools for connected apps
- Tool execution happens through the Vercel AI SDK tool loop (Composio tools are registered as AI SDK tools)
- `composio.tools.execute()` — for infrastructure calls (notifications)

The tool config (enabled/disabled, auto/approval per tool) lives in the agent's DB record, not in Composio.

## UX Design

### Agent Creation — Briefing Flow

**Phase 1: Intent Capture**

Minimal screen. One input field:

> "What should this agent keep an eye on?"

Below: 3-4 example chips (not templates — phrasing examples):
- "Monitor my Google Ads for wasted spend"
- "Summarize team Slack activity every morning"
- "Alert me when campaign CPL exceeds threshold"

**If input is vague**, the system agent asks 2-3 focused clarifying questions (multiple choice preferred, free text for "something else"). Exit condition: enough signal to generate a reasonable blueprint.

Example:
```
User: "Help me with my Google Ads"

Agent: "What's your biggest concern right now?"
  - Wasted ad spend (paying for clicks that don't convert)
  - Missing opportunities (campaigns that could perform better)
  - Reporting (keeping clients/team informed)
  - Something else

User: picks "Wasted ad spend"

Agent: "How should waste be handled when found?"
  - Just alert me
  - Recommend changes, I'll approve
  - Fix it automatically

→ generates blueprint
```

Max 2-3 clarifying questions. The blueprint doesn't need to be perfect — just good enough that the user sees it and thinks "roughly right, let me adjust."

**Phase 2: AI-Generated Blueprint**

The system generates a complete, editable configuration:
- Agent name and description (generated)
- Connections needed (inferred from intent)
- Tool list with smart defaults (reads = auto, writes = approval)
- Draft instructions (generated)
- Suggested skills (matched from library)
- Schedule suggestion

This is the "aha" moment — one sentence of intent becomes a fully configured agent.

**Phase 3: Connect and Launch**

User walks through OAuth for needed connections. As each connects, capabilities visually expand (the "capability bloom" — tools fade in one-by-one, terminal-style wipe animation).

"Launch" button becomes available once required connections are complete.

### Craft Moments

1. **Capability Bloom** — OAuth completion triggers staggered reveal of new capabilities (80ms delay between items, left-to-right wipe). The agent is discovering what it can access.

2. **Single-Sentence Launch** — The transition from empty input to populated blueprint. Subtle pulsing purple glow on "Launch" button (2s interval, stops after 5s).

3. **Trust Dial** — Per action category: `[Full auto | Ask above threshold | Always ask]`. Below all dials: plain-English summary sentence that updates live.

4. **Skill as Briefing** — When enabled, skill introduces itself in first person: "I'll review your search terms daily for waste patterns..." Teaching, not toggling.

5. **Living Overview** — Agent config rendered as a readable dossier paragraph (generated from actual config, updates live). Settings cards are drill-down details below it.

### Agent Detail Page — Two Tabs

**Timeline (default)**
- Unified surface replacing Feed + Chat
- Agent-initiated cards: findings, actions taken, approval requests (structured cards, not chat bubbles)
- "Go Deeper" on any card: contextual slide-over for follow-up questions scoped to that finding
- Input bar at bottom: ad-hoc questions and commands (secondary interaction)
- Compact status header: last run, next run, actions this week
- Agent posts in first person ("I found 12 wasteful keywords") — consistent voice

**Settings**
- Instructions editor (the agent's briefing)
- Tool config panel (toggle tools, set auto/approval per tool)
- Trust dials (per action category)
- Connections (OAuth status, connect/disconnect)
- Skills (toggle on/off, each introduces itself when enabled)
- Schedule (cron picker)
- Notification config (which channels for approvals)
- Living overview dossier at the top

### Interaction Model

The agent leads, the user reacts. This is "contextual over conversational":

- **Agent-initiated:** Findings, actions, approval requests appear as cards in the timeline
- **User-initiated (contextual):** Tap "Go Deeper" on a card to ask follow-up questions
- **User-initiated (ad-hoc):** Type in the input bar for commands ("run now") or open questions ("what's our CPL trend this month?")
- **Approvals:** Inline cards with Approve / Reject / Ask More. "Ask More" opens a contextual thread.

Chat is NOT a parallel execution engine. The timeline input can trigger a run or ask about past runs, but it doesn't independently use Composio tools. The Trigger.dev task is the only execution path.

## Clean-Up Plan

### Phase 0: Preserve (tag current state)
```
git tag v0-harness-archive
```

### Phase 1: Gut the Harness

**Delete:**
- `packages/harness/src/pipeline/` — 6-step runner, all steps, execution layer
- `packages/harness/src/skills/` — registry, executor, built-in skills
- `packages/harness/src/context/` — assembler, token budget
- `packages/harness/src/chat/tools/` — all 10 domain tools
- `packages/harness/src/policy/` — engine (will be rebuilt as a single function)
- All corresponding test files

**Simplify:**
- `packages/harness/src/connections/` — remove capability maps, factory, keep Composio client only
- `packages/harness/src/chat/handler.ts` — strip down, will be rebuilt
- `packages/harness/src/types/` — new agent model (instructions + tool config)
- `packages/harness/src/db/schema.ts` — new schema (6 tables)
- `packages/harness/src/repositories/` — simplify to match new schema

**Keep:**
- `packages/harness/src/workspace/` — path-secured .md file access
- `packages/harness/src/db/client.ts` — Drizzle setup
- Monorepo structure, TanStack Start shell, design system, Trigger.dev config

### Phase 2: Rebuild Core

1. **New agent model** — Zod schemas for AgentConfig (instructions, toolConfig, notificationConfig, schedule, skills)
2. **Tool config system** — auto-classify read vs write, per-tool toggle, stored in agent DB record
3. **Policy function** — `evaluatePolicy()` pure function with budget/cooldown/override checks
4. **Trigger.dev task** — manual tool loop with Vercel AI SDK v6 `generateText` + `needsApproval` + `wait.forToken()`
5. **Notification sender** — Composio tools (GMAIL_SEND_EMAIL, SLACK_SEND_MESSAGE, etc.) for approval notifications
6. **Blueprint generator** — AI function that takes user intent → generates full agent config

### Phase 3: Rebuild UI

1. **Agent creation flow** — intent capture → clarifying questions → blueprint → connect → launch
2. **Agent detail: Timeline tab** — unified feed with agent cards, "Go Deeper" slide-over, input bar
3. **Agent detail: Settings tab** — instructions, tool config, trust dials, connections, skills, schedule
4. **Living overview** — dossier paragraph generated from config
5. **Approval cards** — inline in timeline with approve/reject/ask-more

### Phase 4: Polish

1. **Capability bloom** — connection animation
2. **Trust dial** — slider with plain-English summary
3. **Skill briefing** — first-person introduction on toggle
4. **Status header** — compact run stats on timeline

## What This Removes

- ~5,000 LOC harness core (pipeline, skills, policy engine, context assembler)
- ~8,800 LOC tests for removed code
- 10 custom chat domain tools
- ConnectionManager abstraction + capability maps
- 3 execution modes for skills
- Token budget algorithm
- Step-aware context assembly

## What This Keeps

- Workspace concept (.md files as agent identity)
- Deterministic policy (rebuilt as a function, not an engine)
- Memory/lessons concept (simplified, in DB)
- Design system and brand (dark-first, purple accent, Raycast/Arc energy)
- TanStack Start + Trigger.dev + Drizzle infrastructure
- Composio integration (elevated to primary, not wrapped)

## What This Adds

- Briefing-first agent creation UX
- Tool-level auto/approval config
- AI-generated blueprints from natural language intent
- Unified timeline (replaces Feed + Chat)
- Contextual "Go Deeper" interaction
- Trust dials with plain-English summaries
- Capability bloom animation
- Living overview dossier

## Open Questions (Deferred)

- **Event-driven runs** — webhooks/Composio triggers (Phase 2+)
- **Skill marketplace** — discovery, sharing, community (Phase 2+)
- **Thinking Space** — dedicated sandbox for exploratory analysis (if users demonstrate the need)
- **Progressive trust automation** — "you've approved this 20 times, want to make it auto?" (Phase 2)
- **Multi-agent coordination** — agents that trigger other agents (Phase 3)
