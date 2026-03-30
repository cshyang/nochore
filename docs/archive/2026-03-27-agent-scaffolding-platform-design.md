# Agent Platform Design

**Date:** 2026-03-27
**Status:** Draft (revised after 5 rounds of advisory debate)
**Supersedes:** Previous pipeline architecture (8-step harness), original scaffolding design

## Core Thesis

Nochore is an **agent platform with delegated autonomy**. Users create an agent, give it instructions and tool access via Composio, and let it work. When a single agent hits its limits — context pollution, parallel I/O, tool namespace collision — it delegates to subagents dynamically. The agent decides when it needs help and what kind. The user watches it work, not configures it.

**Key principle:** Delegation is the product. Topology is an emergent property of a user who keeps telling their agent "no, do it this way."

## Mental Model

```
User → creates Agent → gives it instructions + Composio connections + policy
Agent → works autonomously → delegates when it hits limits → synthesizes results
User → watches via Live Run view → intervenes only when stakes are high
```

**The agent's job is to think and do. When the job is too big, it recruits help.**

## Architecture

### Stack

| Layer | Technology | Responsibility |
|---|---|---|
| **Web app** | TanStack Start + Vercel AI SDK | UI, config, chat streaming, Live Run view |
| **Manager orchestration** | Vercel AI SDK `generateText` + trigger.dev | Agent loop, approval checkpoints, event capture |
| **Subagent runtime** | pi-coding-agent (`createAgentSession`) | Ephemeral workers with bash/file/code tools |
| **Tool access** | Composio SDK | OAuth + API tools, scoped per agent/subagent |
| **State** | SQLite (Drizzle) + workspace filesystem | DB for operational state, filesystem for agent workspace |
| **Policy** | Deterministic engine (no LLM) | Approval gates, delegation constraints, budget limits |

### Key Design Decisions

1. **Manager stays on generateText + trigger.dev.** This preserves the battle-tested approval flow (`wait.forToken` checkpoints the container for free during human review). The manager orchestration loop is ours — permanently. It never gets handed to a third-party runtime.

2. **pi-coding-agent is subagent-only.** Subagents are ephemeral workers (in-memory sessions) that execute focused tasks and return results. They get coding tools (bash, file read/write), Composio API tools, or both — scoped per role.

3. **Dynamic delegation, not predefined topology.** The agent decides at runtime whether to spawn help. No fixed DAGs, no workflow builders, no Zapier-style node-and-wire editors. The policy engine constrains what delegation is allowed.

4. **Topology emerges from accumulated preferences.** When a user observes their agent always delegating in the same pattern, they can pin that pattern as a constraint. This is not a separate mode — it's the policy layer getting more specific over time.

5. **One execution primitive: `triggerAndWait`.** Both dynamic delegation and topology compile down to the same operation. Topology is just delegation with a stricter policy (predefined graph edges as allowlist). No second execution engine.

6. **Live Run view is the primary UX.** The manager emits events at every step. The UI narrates the run in real-time: what the agent is doing, when it recruits help, what subagents find, when approvals are needed. Trust is built through visibility, not configuration.

## Agent Model

### Agent

What the user creates and interacts with. Defined by:

- **Instructions** — what this agent is responsible for (natural language)
- **Connections** — Composio OAuth integrations (the tool ceiling)
- **Policy** — approval rules, budget limits, cooldowns, delegation constraints (deterministic, no LLM)
- **Schedule** — when it runs autonomously (manual / hourly / daily / weekly)
- **Delegation config** — optional constraints on subagent spawning

### Delegation Config

```typescript
// Dynamic (default) — agent decides, policy constrains
delegation: {
  mode: "dynamic",
  allowedRoles: ["researcher", "analyst", "executor", "reporter"],
  maxSpawns: 5,         // Per run
  maxConcurrent: 2,     // Parallel subagents
}

// Topology (pinned pattern) — config decides, policy enforces graph
delegation: {
  mode: "topology",
  graph: [
    { role: "researcher", then: ["analyst"] },
    { role: "analyst", then: ["reporter"] },
  ]
}
```

Both modes use the same execution path. Topology is just dynamic delegation with a stricter policy — the graph edges become the allowlist per role.

### Agent Roles (Templates)

Pre-built specialist roles for subagent delegation. A role defines:

- **Name** — what this specialist does (e.g., "researcher", "analyst")
- **Instructions** — focused system prompt for the specialist's narrow job
- **Required connections** — which Composio providers this role needs
- **Default tools** — which specific tools from those providers to enable
- **Default approval mode** — auto-approve reads, require approval for writes

Roles live as files: `.agents/roles/<name>/ROLE.md` with YAML frontmatter.

```markdown
---
name: researcher
description: Fetch and analyze data from connected platforms
tools: read, bash, grep, find
model: claude-sonnet-4-6
---

You are a research specialist. Fetch data using the provided API tools
and write structured findings to the workspace.

Always write outputs to workspace files: workspace/research/<topic>.md
```

**Starter library:**
- `researcher` — fetches data via API tools, writes findings
- `analyst` — processes data locally (bash/file tools), identifies patterns
- `executor` — takes actions via API tools (writes), policy-gated
- `reporter` — generates reports from workspace data

## Permission Model

Three-layer scoping with progressive trust:

```
Agent connections (ceiling)
  └── Role defaults (sensible subset)
       └── Per-spawn override (agent can further restrict, never expand)
```

1. **Agent connections** — hard ceiling set by user via OAuth in the UI
2. **Role defaults** — each role declares what it needs and at what access level
3. **Per-spawn override** — agent can restrict when delegating

**Policy still gates everything.** The deterministic policy engine can:
- Require human approval for mutations
- Enforce delegation constraints (allowlist, graph edges, spawn budget)
- Set cooldowns and budget thresholds
- Gate edges in topology mode ("analyst cannot trigger reporter unless confidence threshold met")

## Execution Flow

### How a Run Works

```
1. Trigger
   → User clicks "Run" in UI, or cron schedule fires
   → Web app calls trigger.dev agentRunTask

2. Agent loop (generateText + trigger.dev)
   → Load agent config from DB (instructions, connections, policy, delegation)
   → Enter generateText cycle with Composio tools + spawn_subagent tool
   → For each tool call:
     → Policy engine evaluates (deterministic, no LLM)
     → If approved: execute tool
     → If needs approval: wait.forToken() → checkpoint → resume when human approves
     → If spawn_subagent: launch pi-coding-agent child session (see below)
   → Events emitted at every step → Live Run view updates in real-time
   → Agent synthesizes results, decides next steps or completes

3. Subagent delegation (when agent decides it needs help)
   → Agent calls spawn_subagent tool with role + task + optional tool restrictions
   → Harness validates: connections available? Policy allows? Within spawn budget?
   → pi-coding-agent child session created in-process:
     → Fresh context (no pollution from parent)
     → Scoped tools (role defaults, restricted by parent)
     → Shared workspace filesystem
   → Child executes, writes outputs to workspace
   → Parent receives structured summary (not full reasoning trace)
   → Child session disposed

4. Completion
   → Results persisted to DB (events, lessons, run status)
   → Container checkpointed / exits
   → UI updates via trigger.dev realtime or DB polling
```

### When One Agent Isn't Enough

Three concrete scenarios that trigger delegation:

1. **Parallel I/O** — need to fetch Google Ads + Meta + Analytics simultaneously. Sequential is too slow.
2. **Context pollution** — agent carrying 200K tokens of mixed-domain data performs worse than a fresh agent with focused 15K tokens.
3. **Tool namespace collision** — after ~15-20 tools, models confuse which to use. Scoping subagents to 5-7 tools each is more reliable.

The agent recognizes these situations and delegates. Most runs, a single agent with good tools is sufficient.

### Subagent Spawning

The agent has a `spawn_subagent` tool:

```typescript
spawn_subagent({
  role: "researcher",
  task: "Fetch Google Ads campaign performance for last 7 days",
  tools: ["GOOGLEADS_GET_CAMPAIGNS", "GOOGLEADS_GET_KEYWORDS"],  // optional restrict
})
```

The harness validates against policy, then creates a pi-coding-agent child session:

```typescript
const { session: child } = await createAgentSession({
  model, thinkingLevel: "off",
  tools: codingTools,          // bash, read, edit, write
  customTools: scopedComposioTools,
  sessionManager: SessionManager.inMemory(),
  cwd: sharedWorkspacePath,
});
child.systemPrompt = roleInstructions;
await child.prompt(taskDescription);
// Capture output via subscribe() on message_end events
child.dispose();
```

## Hybrid Architecture Rationale

### Why not pi-coding-agent for everything?

The team debated putting everything on pi-coding-agent. Three problems:

1. **Approval deadlock.** pi-coding-agent's agent loop blocks the container while waiting for human approval (potentially 24h). trigger.dev's `wait.forToken` checkpoints the container for free — zero cost during the wait.

2. **Narration control.** The Live Run view requires fine-grained control over what events are emitted and when. `generateText` gives us control over every cycle. pi's event subscription gives post-hoc events that are harder to narrate.

3. **Platform dependency.** pi-coding-agent is the entire brain layer. If it changes API, we're rebuilding. By keeping the manager on our own orchestration loop, we own the most critical code path. Subagent runtimes are pluggable — abstract behind a `SubagentRuntime` interface.

### SubagentRuntime Interface

```typescript
interface SubagentRuntime {
  spawn(config: {
    role: RoleConfig;
    task: string;
    tools: ScopedTool[];
    workspacePath: string;
  }): Promise<SubagentResult>;
}

interface SubagentResult {
  output: string;           // Structured summary for parent
  events: RunEvent[];       // Tool calls, findings, errors
  tokensUsed: number;
  durationMs: number;
}
```

Today this wraps pi-coding-agent's `createAgentSession`. Tomorrow it could wrap any agent framework without changing the manager loop.

### pi-coding-agent API Notes (from spike)

- **System prompt:** `session.systemPrompt` is a read-only getter. Set custom instructions via `session._baseSystemPrompt = "..."` — the LLM sees this on the next `prompt()` call.
- **Tools:** Pass `tools: []` to disable defaults, use `customTools: [...]` for Composio wrappers. Or use `tools: createCodingTools(cwd)` for bash/read/edit/write.
- **Session lifecycle:** Always call `session.dispose()` after completion.
- **Structured output:** Use tool `details` as side-channel (not sent to LLM). Capture via `subscribe()` on `tool_execution_end` events.

## Live Run View

The highest-impact UX investment. A real-time narrated timeline during active runs:

```
"Analyzing Google Ads campaigns for ACME Corp..."
"Found 3 campaigns, 847 keywords. Checking for waste patterns..."
"Recruiting Researcher — need to fetch Meta Ads data for cross-channel comparison"
  └── Researcher: "Fetching Meta campaign data... 2 campaigns, 156 ad sets pulled."
"Cross-referencing channels... Found 12 keywords with zero conversions across both platforms"
"Drafting optimization report..."
[Approval needed] "Pause 3 keywords with $450/month spend and 0 conversions?"
```

Each step is a card that expands to show detail. Approval cards appear inline with full context. The architecture already captures these events — this is purely a presentation layer.

## Data Model

### What Stays
- `agents` table — add optional `delegation` config field
- `runs` table — unchanged (each run is one row, including subagent runs)
- `events` table — add `subagentRole` field to distinguish delegation events
- `approvals` table — unchanged (policy gates work at both levels)
- `lessons` table — unchanged

### What's New
- `roles` — stored as files (`.agents/roles/*/ROLE.md`), not DB rows
- Delegation policy rules in the policy engine (~30 lines: `canDelegate(fromAgent, toRole, currentDepth)`)

## What Changes From Current Codebase

### Stays (most of the system)
- **`agentRunTask`** — stays as generateText + trigger.dev loop. Add `spawn_subagent` tool.
- **trigger.dev** — still orchestration layer, scheduling, durability
- **Composio** — still provides OAuth + API tools, `ConnectionManager` stays
- **Policy engine** — still deterministic. Add delegation constraint rules.
- **DB schema** — runs, events, approvals, lessons (minor additions)
- **Web app** — TanStack Start, project/agent CRUD, monitoring UI
- **Vercel AI SDK** — stays for manager orchestration AND chat UI

### What's New
- **`spawn_subagent` tool** — wraps pi-coding-agent child session creation (~50 lines)
- **`SubagentRuntime` interface** — abstraction over pi-coding-agent (swap-friendly)
- **Delegation policy rule** — `delegation-constraint` (~30 lines)
- **Role files** — `.agents/roles/*/ROLE.md` with frontmatter
- **Live Run view** — real-time event stream in the UI
- **pi-coding-agent dependency** — for subagent sessions only

### What's Removed
- Remaining pipeline step logic (already mostly deleted)

## Sequencing

### Phase 1: Single Agent (now)
Ship the current single-agent loop with the Live Run view. No delegation, no subagents. Prove that one agent with good tools and real-time visibility builds user trust.

**Build:**
- Live Run view (event stream → narrated timeline UI)
- Polish the generateText + trigger.dev loop
- Composio tool integration

### Phase 1.5: pi-coding-agent Spike (before Phase 2)

Before committing to pi-coding-agent as the subagent runtime, run a time-boxed spike (2-3 days) with explicit pass/fail gates. Do not write production integration code until the spike passes.

**Spike question:** Can pi-coding-agent run headlessly in a trigger.dev container, invoked programmatically via `createAgentSession()`, returning structured output, without TUI assumptions or interactive hacks?

**Pass/fail gates:**

| Gate | Pass criteria | Fail action |
|---|---|---|
| **Headless execution** | `createAgentSession()` runs to completion with `SessionManager.inMemory()`, no TTY required, no interactive prompts | Kill hybrid path; stay Vercel AI SDK only |
| **Structured output** | Tool results and final text can be captured programmatically via `subscribe()` events and returned as typed data | Kill hybrid path |
| **Container compatibility** | Runs inside a trigger.dev task container (Node.js process, no special system deps beyond what trigger.dev provides) | Evaluate subprocess mode (`pi --mode json`) as fallback |
| **Composio tool wrapping** | Composio tools can be wrapped as pi `ToolDefinition` objects and executed successfully | Evaluate effort; may be acceptable with adapter layer |
| **Bash baseline comparison** | Benchmark the same 3-5 code/file tasks against a Vercel AI SDK agent with a simple bash tool. pi must demonstrably outperform on at least 2/5 tasks. | Stay Vercel AI SDK only; bash baseline is good enough |

**Spike deliverable:** A standalone script in `scripts/spike-pi-subagent.ts` that:
1. Creates an in-memory pi session with custom tools
2. Runs a code/file task (e.g., "read package.json, list all dependencies, write a summary to workspace/deps.md")
3. Captures structured output
4. Reports success/failure against each gate

**If spike fails:** The SubagentRuntime interface still exists. Implement it with Vercel AI SDK `generateText` + bash/read/write tools instead of pi. The manager loop, delegation model, and Live Run view are unaffected — only the worker inside the subagent changes.

### Phase 2: Dynamic Delegation (when limits hit)
When users hit concrete limits (parallel I/O, context pollution, tool collision) AND the pi spike passes, add the `spawn_subagent` primitive.

**Build:**
- `SubagentRuntime` interface + implementation (pi-coding-agent if spike passed, or Vercel AI SDK + bash if not)
- `spawn_subagent` tool on the agent
- Delegation policy rules (allowlist, spawn budget, depth limit)
- Starter role library (researcher, analyst, executor, reporter)
- Live Run view: nested subagent cards

### Phase 3: Pinned Patterns (when topology emerges)
When users observe their agents delegating in the same patterns repeatedly, let them pin those patterns as topology constraints.

**Build:**
- Topology delegation mode (graph-based policy constraints)
- "Pin this pattern" UX in the Live Run view
- Saved delegation configs per agent

### Never
- DAG editor / visual workflow builder
- Zapier-style node-and-wire UI
- Two separate "modes" at onboarding

## Token Economics

A typical single-agent run (Phase 1):
- System prompt + instructions: ~3K tokens
- Multi-cycle reasoning + tool calls: ~8-15K tokens
- **Total: ~$0.05-0.10 per run** (Sonnet pricing)

A delegation run with 3 subagents (Phase 2):
- Manager: ~11K tokens
- Each subagent: ~9K tokens (2K system + 1K task + 4K tool results + 2K output)
- **Total: ~$0.15-0.25 per run**
- Daily schedule = ~$5-8/month per agent. Manageable.

**Cost guardrails:** Policy engine enforces spawn budgets. Maximum spawns per run, maximum concurrent subagents, maximum token spend per delegation.

## Open Questions

- **Workspace persistence** — between runs, does the workspace persist or reset? Likely: persist for continuity, with cleanup policy.
- **Subagent approval flow** — subagents are ephemeral and shouldn't trigger long human waits. Likely: subagents only get auto-approved tools, or escalate to parent which handles the approval via trigger.dev checkpoint.
- **Model routing** — different models per role (Haiku for simple fetching, Sonnet for analysis). Cost optimization for Phase 2.
- **Bash baseline viability** — if the pi spike fails, how good is `generateText` + a bash tool for code/file tasks? May be sufficient for most early use cases.

## Design Provenance

This design emerged from 5 rounds of structured debate between three advisory perspectives:

1. **Round 1-2:** Established hybrid architecture (manager on generateText, subagents on pi-coding-agent). Unanimous agreement that manager orchestration must stay owned, not delegated to third-party runtime.
2. **Round 3:** Initial consensus on topology over scaffold — predictable, debuggable, cost-controlled.
3. **Round 4:** Founder challenged: "when does one agent genuinely fail?" Team flipped to dynamic delegation — topology is a local maximum that loses value as models improve.
4. **Round 5:** Founder asked: "why not both?" Team unified: they're the same primitive (`triggerAndWait`) with different policy constraints. Topology emerges from pinned delegation patterns.

### Cross-validation (2026-03-27)

Architecture independently validated by Codex 5.4 analysis. Key alignment:
- Vercel AI SDK as core orchestration layer (confirmed)
- pi-coding-agent as candidate subagent runtime only (confirmed)
- SubagentRuntime interface for swap-ability (confirmed)

Codex added one discipline our debate missed: **spike-with-gates before adoption.** The critical uncertainty — "can pi run headlessly in a container?" — is a testable question, not a strategy debate. This led to adding Phase 1.5 (pi spike) with explicit pass/fail criteria. Decision framework: *measure immediately, productize only on evidence.*
