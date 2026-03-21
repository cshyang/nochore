# Harness Layer Design

> The runtime where agents live. Designed March 2026.

## Thesis

**One agent. One pipeline. Graduated intelligence.**

The Harness Layer is a typed pipeline runner that executes the same eight-step sequence for every agent — from a simple invoice processor to a complex ad spend optimizer. Simpler agents degenerate naturally: fewer skills means trivial scope resolution, no memory means empty context, auto-approve policy means a passthrough gate. The pipeline doesn't branch for complexity; it absorbs it.

The user sees one concept: **an agent that does a job.** The runtime decides how much intelligence each step requires. The contracts are locked; the execution model evolves.

### The Architectural Bet

We bet on **typed contracts with flexible runtime** rather than a fixed execution model:

- **Lock down:** Skill interfaces, policy schema, memory format, action contracts — these are stable because they model real domain boundaries.
- **Keep flexible:** How scope resolution works, whether skills use deterministic code or LLM reasoning, how the planner synthesizes, data-type-to-tool resolution — these evolve as LLMs improve.

Today's ratio might be 70% deterministic / 30% LLM reasoning. In two years it could be 20/80. The user never notices the shift. They see the same Feed, the same Monitor, the same Chat.

### What This Is NOT

- **Not a workflow engine.** There are no user-visible "steps" or "sequences." The pipeline is internal.
- **Not an agent framework.** We don't expose orchestration primitives. Each agent is self-contained.
- **Not an AI wrapper.** Most of the pipeline is deterministic code. LLM reasoning is injected at specific, bounded seams.

---

## The Pipeline

Every agent run — triggered by schedule, webhook, chat command, or manual — walks this pipeline:

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT RUN PIPELINE                     │
│                                                             │
│  ┌─────────────┐                                            │
│  │ 1. TRIGGER   │  cron / webhook / chat / manual           │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐  ┌────────────┐                            │
│  │ 2. SCOPE    │◄─│  Memory    │  Resolve which skills      │
│  │  RESOLUTION │  │ (lessons)  │  matter for this run.      │
│  └──────┬──────┘  └────────────┘  Static OR LLM-decided.   │
│         │ skills: [A, B, ...]                               │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 3. FETCH    │  Deterministic. Collect data types from    │
│  │             │  selected skills, resolve to tools,        │
│  │             │  fetch in parallel via Connection Manager. │
│  └──────┬──────┘                                            │
│         │ { dataType: DataFrame }                           │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 4. ANALYZE  │  Run skills in parallel. Each skill is     │
│  │             │  a system prompt + data → typed output.    │
│  │             │  OR a deterministic function. The skill    │
│  │             │  contract is the same either way.          │
│  └──────┬──────┘                                            │
│         │ SkillOutput[]                                     │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 5. PLAN     │  Synthesize all skill outputs + intent +   │
│  │             │  memory into concrete ActionProposals.     │
│  │             │  Single LLM call for cross-skill reasoning.│
│  │             │  Passthrough if only one obvious action.   │
│  └──────┬──────┘                                            │
│         │ ActionProposal[]                                  │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 6. POLICY   │  Deterministic rule engine. No LLM. Ever. │
│  │    GATE     │  Per-action overrides → threshold tiers →  │
│  │             │  operational constraints → global switch.  │
│  └──────┬──────┘                                            │
│    ┌────┼────┐                                              │
│    ▼    ▼    ▼                                              │
│  AUTO  QUEUE  BLOCK                                         │
│    │    │                                                   │
│    ▼    ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 7. EXECUTE  │  Deterministic. Tool calls via Connection  │
│  │             │  Manager. Only for AUTO-approved and       │
│  │             │  user-approved actions.                    │
│  └──────┬──────┘                                            │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────┐                                            │
│  │ 8. MEMORY   │  Layer 1: Event log (always, append-only). │
│  │    WRITE    │  Layer 2: Lesson distillation (periodic).  │
│  └─────────────┘                                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### LLM Injection Points

| Step | Deterministic? | LLM? | Notes |
|------|---------------|-------|-------|
| 1. Trigger | Always | Never | Cron, webhook, or explicit invocation |
| 2. Scope Resolution | Can be | Can be | Static config for simple agents, LLM-decided for complex ones |
| 3. Fetch | Always | Never | API calls via Connection Manager |
| 4. Analyze | Can be | Can be | Skill contract is the same regardless of implementation |
| 5. Plan | — | Usually | Passthrough for single-action agents |
| 6. Policy Gate | Always | Never | Safety path is always deterministic |
| 7. Execute | Always | Never | Tool calls, not reasoning |
| 8. Memory Write | Events: always | Lessons: LLM | Event log is mechanical; lesson distillation uses LLM |

### Graduated Intelligence (Degeneration)

The same pipeline handles vastly different agents. Complexity is not a mode — it's a consequence of configuration:

| Configuration | Simple Agent (invoice) | Complex Agent (ad spend) |
|--------------|----------------------|------------------------|
| Skills | 1 (extract_invoice) | 5 (search_terms, budget, QS, trends, composition) |
| Scope resolution | Static (always run the one skill) | LLM-decided (picks relevant skills per run) |
| Data sources | 1 (email attachment) | 4 (Google Ads, Meta, GA4, Search Console) |
| Analyze step | Deterministic extraction | Structured LLM reasoning |
| Plan step | Passthrough (one action) | Cross-skill LLM planner |
| Policy | Auto-approve all | Threshold tiers + approval gates |
| Memory | Event log only | Events + distilled lessons |
| LLM calls per run | 0–1 | 5–7 |

---

## Chat Mode

Chat mode shares the pipeline but is driven by conversation. The agent is the same entity in interactive mode — not a separate system.

```
User message
    │
    ▼
Chat LLM (conversational)
  Context: intent, recent insights, memory, conversation history
    │
    ├── RESPOND (from existing context)
    │     "Based on last analysis, CPL spiked because..."
    │
    └── TRIGGER PIPELINE (user asks for action)
          "Run fresh analysis" → Steps 2–8
          "Apply those changes" → Steps 6–7
          Results shown in chat thread
          Same policy gate applies
```

Chat-triggered runs are scoped. "Check Campaign X" narrows the pipeline to Campaign X only.

### Chat Architecture: Stateless Per-Request

Chat uses ADK-style session injection via Vercel AI SDK. No persistent agent process.

Per-request flow:
1. Load agent config from DB
2. Load workspace files (AGENT.md, KNOWLEDGE.md, POLICY.md)
3. Load recent chat messages from `chat_messages` table
4. Load active lessons from DB
5. ContextAssembler merges all sources into system prompt + messages array (same assembler used by pipeline Mode 1)
6. Create AI SDK agent with 9 tools (5 domain + 3 workspace-scoped)
7. Process message, stream response via SSE
8. Save new messages to `chat_messages` table

**Workspace tools** give the chat agent file access scoped to its directory:
- `read-workspace`: Read any .md in agent directory
- `write-scratchpad`: Write working notes + agent-learned context to scratchpad/
- `generate-report`: Write reports to reports/

**KNOWLEDGE.md is human-curated only.** Agent-learned context goes to scratchpad/ or structured lessons in the DB. This prevents prompt injection persistence and maintains separation between authored workspace files and machine-learned memory.

---

## Contracts (Locked Down)

These interfaces are stable because they model real domain boundaries proven in the legacy CLI.

### Skill

```typescript
interface Skill<TOutput> {
  id: string;
  name: string;
  description: string;

  // What data this skill needs — NOT which tool provides it
  consumes: DataType[];

  // Typed output schema
  produces: Schema<TOutput>;

  // Domain expertise (for LLM-powered skills)
  systemPrompt?: string;

  // OR deterministic implementation
  compute?: (data: SkillData) => TOutput;

  // Optional domain knowledge (client-specific context)
  knowledge?: string;
}
```

A skill is EITHER a structured LLM call (systemPrompt + output schema) OR a deterministic function (compute). The harness doesn't care which — the contract is: data in, typed output out.

### ActionProposal

```typescript
interface ActionProposal {
  id: string;
  action: string;           // e.g., "add_negative_keyword"
  toolCategory: string;     // e.g., "google_ads"
  args: Record<string, unknown>;
  reason: string;           // Human-readable explanation
  confidence: number;       // 0–1
  skillSource: string;      // Which skill generated this
  reversible: boolean;
}
```

### PolicyRule

```typescript
interface PolicyRule {
  id: string;
  name: string;
  priority: number;  // Lower = evaluated first

  evaluate(
    proposal: ActionProposal,
    context: PolicyContext
  ): PolicyDecision;
}

type PolicyDecision =
  | { result: "approved"; reason: string }
  | { result: "needs_review"; reason: string }
  | { result: "blocked"; reason: string };

interface PolicyContext {
  recentActions: ActionEvent[];
  operationalConstraints: Constraint[];
  globalOverride: boolean;
}
```

Policy evaluation is a pure function chain. The strictest result wins. No LLM involvement.

### MemoryStore

```typescript
interface MemoryStore {
  // Layer 1: Event log (append-only, never edited)
  appendEvent(event: AgentEvent): void;
  queryEvents(filter: EventFilter): AgentEvent[];

  // Layer 2: Distilled lessons (periodic LLM summarization)
  getLessons(scope?: string): Lesson[];
  distillLessons(recentEvents: AgentEvent[]): Lesson[];
}

interface AgentEvent {
  id: string;
  runId: string;
  timestamp: Date;
  type: "skill_output" | "proposal" | "policy_decision"
       | "execution" | "user_correction";
  data: Record<string, unknown>;
}

interface Lesson {
  id: string;
  content: string;          // Human-readable lesson
  scope: string;            // Which skill/domain this applies to
  confidence: "high" | "medium" | "low";
  sourceEventIds: string[]; // Traceability
  createdAt: Date;
  expiresAt?: Date;         // Some lessons are time-bound
}
```

---

## Flexible Runtime (Evolves Over Time)

These aspects are deliberately NOT locked down:

### Scope Resolution Strategy

Today: LLM-decided for complex agents (reads intent + trigger context + lessons, picks relevant skills). Static config for simple agents.

Future: As LLMs improve, scope resolution could become more dynamic — adapting not just which skills to run, but how to parameterize them based on recent events.

### Data Type → Tool Resolution

Today: Hardcoded mapping (Google Ads provides `search_terms`, Meta provides `campaigns`). Sufficient for launch.

Future: Configurable resolution when multiple tools provide the same data type. This becomes necessary when the second integration demands it — not before.

### Skill Execution Model

Today: Structured LLM call (system prompt + data → typed output) OR deterministic function. The skill interface is the same.

Future: Skills could become fully agentic — reasoning freely over data with tool access. The `Skill` contract doesn't change; the implementation does.

---

## The Feed: Transparency Without Leaking Abstraction

Every pipeline step produces events. The Feed renders them as a decision log — not a trace log.

```
┌─────────────────────────────────────────────────────────┐
│ Today, 9:00 AM                                          │
│                                                         │
│ 🔍 Analyzed search terms and budget allocation          │
│    Found 5 wasteful terms burning $340/day              │
│    Campaign X overspending by 18% vs target             │
│                                                         │
│ 📋 Proposed actions                                     │
│    ✅ Added 3 negative keywords (auto-approved)         │
│    ⏳ Reduce Campaign X budget by 15% (needs approval)  │
│    ⛔ Pausing Campaign Y blocked (under 7-day minimum)  │
│                                                         │
│ 💡 Learned                                              │
│    "Client prefers Campaign X budget maintained during  │
│     Q2 push" (from your correction on March 15)         │
└─────────────────────────────────────────────────────────┘
```

The Feed reads like a competent colleague's decision log. It communicates judgment, not implementation. Users never see "LLM Call #3" or "scope resolution selected 2 skills."

---

## Agent Setup: Conversational Configuration

How does a user go from "I want to monitor my ad spend" to a running agent? A conversational setup flow — not a form wizard, not a blank canvas.

### Phase 1 (MVP): Platform Feature

The setup flow is an LLM-powered conversational UI that produces agent configurations. It is NOT an agent itself — no memory, no pipeline, no persistence. Just a smart form.

```
User: "I want to stop wasting budget on
       irrelevant search terms in Google Ads"

Setup UI:
  1. Understands intent (LLM)
  2. Suggests skills from catalog
     ✅ Search Term Analysis
     ✅ Budget Allocation
     ○  Trend Forecasting (optional)
  3. Shows required connections
     🔌 Google Ads [Connect →]
  4. Suggests policy defaults
     "Budget changes < 5%: auto-approve
      Budget changes 5–20%: ask you first
      Budget changes > 20%: block"
  5. User reviews and adjusts
  6. Agent config saved → pipeline starts running
```

### Phase 2 (When Earned): Setup Agent

When we have 50+ agent setups and can observe patterns worth learning, the setup flow graduates to a proper agent with memory:

- Learns common configurations per industry/role
- Remembers user preferences ("this user always wants conservative policy")
- Suggests better defaults based on what worked for similar agents
- Same pipeline, different domain: its "skills" are intent parsing and config matching

This follows the principle: **extract the abstraction when the second use case forces your hand.**

---

## Implementation Plan (3 Months)

### Month 1: Harness Core

Port the legacy pipeline patterns to TypeScript. Three core interfaces:

- `Skill<TOutput>` — generalization of the 7 existing analyzers
- `PolicyRule` — generalization of the canary policy chain
- `MemoryStore` — generalization of the JSONL event log

Plus the pipeline runner: `runAgent(config, trigger) → RunResult`

### Month 2: Runtime + Frontend

- Event-driven trigger system (cron via node-cron, webhook receiver)
- Pipeline execution with typed step outputs
- Wire to TanStack frontend: Feed (decision log), Monitor (health), approval flow
- Chat mode: Vercel AI SDK streamText with 10 tools (5 domain + 4 workspace-scoped), stateless per-request

### Month 3: First Live Agent

- Legacy CLI → "Ad Spend Guardian" agent on the platform
- Five skills: search terms, impression share, quality score, trends, composition
- Configurable policy (graduated from hardcoded canary)
- Real money. Real consequences. Proof the architecture works.

---

## Design Decisions Log

| Decision | Choice | Why |
|----------|--------|-----|
| Execution model | Hybrid: event-driven + chat | UX has both Monitor (event results) and Chat tabs |
| Skill routing | LLM-decided (complex) or static (simple) | Agents pursue objectives, not follow scripts |
| Data fetching | Eager: fetch all, then analyze | Clean separation; fetch is deterministic and parallelizable |
| Skill runtime | Structured LLM call OR deterministic function | Same contract, flexible implementation |
| Planning | Unified planner (cross-skill LLM reasoning) | One place for cross-skill synthesis |
| Policy gate | Deterministic rule engine, no LLM ever | Safety path must be auditable and predictable |
| Memory | Event log (append-only) + distilled lessons | Lossless truth + efficient context injection |
| Chat scope | Can trigger pipeline steps | Natural interaction without bypassing safety |
| Architecture pattern | Pattern 3 surface + Pattern 4 internals | One agent per job (simple UX), flexible runtime (evolves) |
| Workflow vs agent | No separate concept | Pipeline degenerates naturally for simple tasks |
| GTM | Vertical-first: ad spend management | Ship the product, build the platform underneath |
| Agent setup | Platform feature first, agent later | Ship smart form for MVP; graduate to learning agent at 50+ setups |
| Pipeline orchestration | trigger.dev v3 | Durable execution, retry, checkpoint/resume for approval, OpenTelemetry, idempotency — all built-in |
| LLM SDK | Vercel AI SDK (`ai` package) | Replaces both pi-ai and pi-agent-core. Zod-native tools, official trigger.dev + TanStack Start integration, 20+ providers. No lock-in |
| Chat runtime | Vercel AI SDK (`ToolLoopAgent` / `streamText`) | Same library for pipeline LLM calls and chat agent loop. Stateless per-request, ADK-style session injection from SQLite |
| Sandbox (future) | E2B | Marketplace skills run in isolated Firecracker microVMs. Not needed for MVP |
| Storage split | Files (identity) + SQLite (operational) | Files own authored context (.md), DB owns machine state (runs, events, chat). Validated by Codex, ADK, Anthropic patterns |
| Agent workspace | Directory per agent with scoped permissions | Agent can read all workspace files, write to scratchpad/ and reports/. KNOWLEDGE.md and POLICY.md are human-curated only |
| Chat persistence | SQLite chat_messages table | Not sessions.jsonl. Unified queryability, lesson distillation sees chat corrections, trigger.dev workers can access |
| Context assembly | Step-aware ContextAssembler, shared by both runtimes | Pipeline and chat use the same assembler — no reasoning divergence between Mode 1 and Mode 2 |
| Agent tools | 5 domain + 3 workspace (scoped) | read-workspace, write-scratchpad, generate-report. No update-knowledge (KNOWLEDGE.md is human-curated, agent learning goes to scratchpad or structured DB lessons) |
| Approval control plane | ApprovalRepository, not MemoryStore | Pending actions are control-plane state, not memory. Pipeline wires needs_review proposals to waitForApproval tasks |
| Deployment constraint | Single-host MVP (explicit) | Web server, trigger.dev worker, SQLite, and workspace files must share filesystem. For split deployment, workspace content is bundled into task payloads via ContextAssembler |

---

## Open Questions (Resolved by This Design)

- [x] How does scope resolution work? → LLM-decided for complex agents, static for simple ones
- [x] What are the LLM injection points? → Steps 2 (scope), 4 (analyze), 5 (plan), 8 (lesson distillation)
- [x] How do simple workflows fit? → Same pipeline, degenerate naturally
- [x] What's the user mental model? → One agent per job. Feed shows decisions. Chat for interaction.

## Open Questions (Still to Resolve)

- [x] SDK contracts: Vercel AI SDK with Zod tool schemas. Extension builders define SkillDefinition with Zod outputSchema
- [x] Memory schema: Three-layer split — .md files (authored context), SQLite (operational truth), JSONL (optional debug mirror). Chat messages in DB, not sessions.jsonl
- [ ] Data type → tool resolution: Configurable mapping when multiple tools exist (Tier 2)
- [ ] Policy composition: Conflict resolution when multiple policies disagree (Tier 2)
- [ ] Connection Manager health protocol: Polling, failure modes, token expiry (Tier 2)
