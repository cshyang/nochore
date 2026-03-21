# Harness Layer: Component Specification

> Detailed file-level breakdown with flows and tech stack. Companion to `harness-layer-design.md`.

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **LLM communication + Chat agent** | Vercel AI SDK (`ai`) | Replaces both pi-ai and pi-agent-core. Zod-native tools (eliminates TypeBox), official trigger.dev + TanStack Start integration, 20+ providers. |
| **Pipeline orchestration** | `trigger.dev` v3 | Durable task execution with retry, checkpoint/resume, cron triggers, OpenTelemetry observability, idempotency. |
| **Schema validation** | Zod | Unified — one schema language for types, tool parameters, and skill outputs. No more TypeBox. |
| **Database** | SQLite via Drizzle ORM | Single-file database per project. Events, lessons, agent configs, chat messages. Zero infrastructure. |
| **Frontend** | TanStack Start (React 19, Vite 7) + `@ai-sdk/react` | `useChat()` hook for Chat tab. Server functions import harness directly. |
| **Integrations** | Composio SDK | OAuth flows, 500+ app connections. Wrapped by our Connection Manager. |
| **Sandbox (future)** | E2B | Firecracker microVM sandboxes for marketplace skills. Not needed for MVP. |

### Why trigger.dev?

trigger.dev gives us critical infrastructure we'd otherwise build from scratch:

| Need | Without trigger.dev | With trigger.dev |
|------|-------------------|-----------------|
| Scheduling | node-cron (in-process, no persistence) | Built-in cron triggers (durable) |
| Pipeline orchestration | Custom runner (no crash recovery) | Task + subtask orchestration with CRIU checkpointing |
| Retry logic | Manual implementation | Automatic retry with configurable exponential backoff |
| Human-in-the-loop | Custom approval queue + polling | Checkpoint/suspend → resume on approval (zero idle cost) |
| Observability | Custom logging | OpenTelemetry traces for every step, auto-correlated across subtasks |
| Idempotency | Custom dedup logic | Built-in idempotency keys |
| Parallel execution | Promise.all (fragile) | batchTriggerAndWait (durable, monitored) |

**The checkpoint/resume pattern** is the killer feature for our policy gate. When an action needs user approval, trigger.dev checkpoints the entire run state, suspends the task (releasing compute), and resumes exactly where it left off when the user approves — hours or days later.

### Two Runtimes

The harness has two execution modes, both using Vercel AI SDK for LLM interaction:

```
Mode 1: Triggered Run (schedule/webhook/manual)
  ┌─────────────────────────────────────────────────┐
  │ trigger.dev Task (durable orchestration)        │
  │                                                 │
  │ 0. Load workspace + DB via ContextAssembler     │
  │    (same assembler used by chat Mode 2)         │
  │                                                 │
  │ Step 2 → Step 3 → ... → Step 7a → Step 7b → 8  │
  │    │        │        │       │         │        │
  │  AI SDK   AI SDK   AI SDK  execute  queue +     │
  │ (scope)  (analyze) (plan)  (auto)   waitFor-    │
  │                                     Approval    │
  │ Built-in: retry, tracing, idempotency           │
  └─────────────────────────────────────────────────┘

Mode 2: Chat (user conversation, stateless per-request)
  ┌─────────────────────────────────────────────────┐
  │ Vercel AI SDK streamText (per-request)          │
  │                                                 │
  │ 1. Load workspace files + DB state              │
  │ 2. ContextAssembler merges into system prompt   │
  │    (same assembler used by pipeline Mode 1)     │
  │ 3. Load chat history from SQLite                │
  │ 4. AI SDK agent loop with 9 tools:              │
  │    Domain: run_analysis, query_memory,           │
  │            apply_action, get_insights,            │
  │            explain_decision                       │
  │    Workspace: read_workspace,                     │
  │               write_scratchpad, generate_report   │
  │ 5. Save new messages to SQLite                  │
  │ 6. Stream response via SSE                      │
  └─────────────────────────────────────────────────┘
```

**The progressive path:** As LLMs improve, Mode 1 can gradually shift from trigger.dev task orchestration toward agentic execution. Pipeline steps become tools the LLM calls dynamically. The contracts stay the same.

---

## File Structure

```
packages/
  harness/
    package.json
    tsconfig.json
    src/
      index.ts                    ← Public exports

      types/                      ← CONTRACTS (locked down)
        skill.ts                  ← Skill interface
        action.ts                 ← ActionProposal, ExecutionDecision
        policy.ts                 ← PolicyRule, PolicyContext, PolicyDecision
        memory.ts                 ← AgentEvent, Lesson, MemoryStore interface
        agent-config.ts           ← AgentConfig (the full agent definition)
        data-types.ts             ← DataType declarations + registry
        run.ts                    ← RunContext, RunResult, StepOutput

      pipeline/                   ← PIPELINE TASKS (Mode 1, trigger.dev)
        agent-run.ts              ← Main task: orchestrates steps 1–8
        steps/
          scope.ts                ← Step 2: resolve which skills to run
          fetch.ts                ← Step 3: collect & fetch data
          analyze.ts              ← Step 4: run skills (parallel via batchTriggerAndWait)
          plan.ts                 ← Step 5: unified planner
          policy-gate.ts          ← Step 6: evaluate proposals (inline, deterministic)
          execute.ts              ← Step 7: execute approved actions
          memory-write.ts         ← Step 8: log events + distill lessons
        approval.ts               ← Checkpoint/resume for human-in-the-loop

      chat/                       ← CHAT AGENT (Mode 2, Vercel AI SDK)
        handler.ts                ← Chat request handler (AI SDK streamText)
        tools/                    ← Tools registered with the chat agent
          run-analysis.ts         ← Trigger a pipeline run from chat
          get-insights.ts         ← Query recent skill outputs
          apply-action.ts         ← Execute a pending action proposal
          query-memory.ts         ← Search memory (events + lessons)
          explain-decision.ts     ← Explain why the agent did something
          read-workspace.ts       ← Read .md files from agent workspace
          write-scratchpad.ts     ← Write working notes + agent-learned context to scratchpad/
          generate-report.ts      ← Write reports to reports/

      skills/                     ← SKILL SYSTEM
        registry.ts               ← Load, validate, and resolve skills
        executor.ts               ← Execute a skill (LLM or deterministic)
        built-in/                 ← First-party skills (ported from legacy)
          search-terms.ts
          budget-allocation.ts
          quality-score.ts
          trends.ts
          composition.ts
          web-quality.ts
          organic-search.ts

      policy/                     ← POLICY ENGINE
        engine.ts                 ← Evaluate proposals against rule chain
        rules/                    ← Built-in policy rules
          budget-delta.ts         ← Max % budget change per action
          cooldown.ts             ← Min time between same-type actions
          operational.ts          ← Active hours, daily limits, freeze periods
          global-override.ts      ← "Require approval for everything" switch

      memory/                     ← MEMORY SYSTEM
        store.ts                  ← MemoryStore implementation (SQLite)
        events.ts                 ← Event log (append-only writes, filtered queries)
        lessons.ts                ← Lesson distillation (periodic LLM summarization)

      triggers/                   ← TRIGGER SYSTEM (trigger.dev native)
        cron.ts                   ← Cron trigger definitions (trigger.dev schedules)
        webhook.ts                ← Webhook trigger (trigger.dev HTTP endpoint)
        config.ts                 ← trigger.dev project configuration

      workspace/                  ← WORKSPACE STORE
        store.ts                  ← Read/write .md files with permission model
        templates.ts              ← Default AGENT.md, POLICY.md templates

      context/                    ← CONTEXT ASSEMBLY
        assembler.ts              ← Merges workspace + DB → system prompt
        token-budget.ts           ← Token budget allocation and truncation

      repositories/               ← DB ACCESS LAYER
        run.ts                    ← RunRepository: runs, steps, results
        approval.ts               ← ApprovalRepository: pending actions
        chat-session.ts           ← ChatSessionStore: chat messages (SQLite)
        lesson.ts                 ← LessonRepository: structured lessons

      connections/                ← CONNECTION MANAGER
        manager.ts                ← Registry, health, permission resolver
        resolver.ts               ← DataType → Tool resolution
        composio.ts               ← Composio SDK wrapper

      db/                         ← DATABASE
        schema.ts                 ← Drizzle schema (agents, events, lessons, runs)
        client.ts                 ← Database client factory (SQLite per project)
        migrations/               ← Schema migrations
```

---

## Module Details

### 1. `types/` — Contracts

These are the stable interfaces that everything depends on. They change rarely and with care.

#### `types/skill.ts`

```typescript
import { z } from "zod";

// A skill is EITHER an LLM-powered analyzer OR a deterministic function.
// The harness doesn't care which — the contract is: data in, typed output out.
export interface SkillDefinition<TOutput = unknown> {
  id: string;
  name: string;
  description: string;

  // What data this skill needs (resolved to tools by Connection Manager)
  consumes: DataType[];

  // Output schema (Zod for runtime validation)
  outputSchema: z.ZodType<TOutput>;

  // Option A: LLM-powered (system prompt + output schema)
  systemPrompt?: string;

  // Option B: Deterministic function
  compute?: (data: SkillData, knowledge?: string) => TOutput | Promise<TOutput>;

  // Optional domain knowledge (injected per-client)
  // e.g., "Brand terms: acme, acme corp. Competitor: xyz."
  knowledgeKey?: string;
}

// Data provided to skills, keyed by data type
export type SkillData = Record<string, unknown>;

// Data type declaration (what skills consume)
export interface DataType {
  id: string;          // e.g., "search_terms", "ad_metrics"
  description: string;
  schema: z.ZodType;   // Expected shape of the data
}
```

#### `types/action.ts`

```typescript
export interface ActionProposal {
  id: string;
  action: string;              // e.g., "add_negative_keyword"
  toolCategory: string;        // e.g., "google_ads"
  args: Record<string, unknown>;
  reason: string;              // Human-readable
  confidence: number;          // 0–1
  skillSource: string;         // Which skill generated this
  reversible: boolean;
  idempotencyKey: string;      // Prevents duplicate execution
}

export interface ExecutionResult {
  proposalId: string;
  status: "executed" | "failed" | "skipped";
  output?: Record<string, unknown>;
  error?: string;
  executedAt: Date;
}
```

#### `types/policy.ts`

```typescript
export interface PolicyRule {
  id: string;
  name: string;
  description: string;
  priority: number;   // Lower = evaluated first

  evaluate(
    proposal: ActionProposal,
    context: PolicyContext,
  ): PolicyDecision;
}

export type PolicyDecision =
  | { result: "approved"; reason: string }
  | { result: "needs_review"; reason: string }
  | { result: "blocked"; reason: string };

export interface PolicyContext {
  recentActions: AgentEvent[];
  operationalConstraints: OperationalConstraint[];
  globalOverrideEnabled: boolean;
  currentTime: Date;
}

export interface OperationalConstraint {
  type: "active_hours" | "daily_limit" | "freeze_period";
  config: Record<string, unknown>;
}
```

#### `types/memory.ts`

```typescript
export interface AgentEvent {
  id: string;
  runId: string;
  agentId: string;
  timestamp: Date;
  type:
    | "run_started"
    | "scope_resolved"
    | "data_fetched"
    | "skill_output"
    | "action_proposed"
    | "policy_decision"
    | "action_executed"
    | "user_correction"
    | "lesson_distilled";
  data: Record<string, unknown>;
}

export interface Lesson {
  id: string;
  agentId: string;
  content: string;              // Human-readable insight
  scope: string;                // Which skill/domain this applies to
  confidence: "high" | "medium" | "low";
  sourceEventIds: string[];     // Traceability back to raw events
  createdAt: Date;
  expiresAt?: Date;             // Some lessons are time-bound (e.g., "Q2 budget push")
}

export interface MemoryStore {
  // Layer 1: Event log
  appendEvent(event: Omit<AgentEvent, "id">): Promise<string>;
  queryEvents(filter: EventFilter): Promise<AgentEvent[]>;
  getRecentEvents(agentId: string, limit?: number): Promise<AgentEvent[]>;

  // Layer 2: Distilled lessons
  getLessons(agentId: string, scope?: string): Promise<Lesson[]>;
  saveLessons(lessons: Omit<Lesson, "id">[]): Promise<void>;
  expireLesson(lessonId: string): Promise<void>;
}

export interface EventFilter {
  agentId?: string;
  runId?: string;
  type?: AgentEvent["type"] | AgentEvent["type"][];
  since?: Date;
  limit?: number;
}
```

#### `types/agent-config.ts`

```typescript
export interface AgentConfig {
  id: string;
  projectId: string;
  name: string;
  description: string;

  // Intent — the "why"
  intent: string;

  // Skills — what the agent knows
  skills: string[];               // Skill IDs from registry
  skillKnowledge: Record<string, string>;  // Per-skill knowledge overrides

  // Triggers — when the agent runs
  triggers: TriggerConfig[];

  // Policy — what the agent must/must not do
  policyRules: string[];          // PolicyRule IDs
  policyOverrides: PolicyOverride[];
  globalApprovalRequired: boolean;
  operationalConstraints: OperationalConstraint[];

  // Connections — which tools the agent can use (inherited from project)
  connectionIds: string[];

  // Memory
  memoryEnabled: boolean;
  lessonDistillationInterval: number;  // Every N runs

  // Scope resolution strategy
  scopeStrategy: "static" | "llm";

  // Model preferences
  model?: string;                 // LLM model for this agent
  thinkingLevel?: "off" | "low" | "medium" | "high";
}

export interface TriggerConfig {
  type: "cron" | "webhook" | "manual";
  config: Record<string, unknown>;  // e.g., { cron: "0 9 * * *" } or { path: "/webhook/agent-123" }
  skills?: string[];                // Optional: override which skills run for this trigger
}

export interface PolicyOverride {
  pattern: string;    // Action pattern, e.g., "add_negative_keyword"
  decision: "always_approve" | "always_ask" | "always_block";
}
```

#### `types/run.ts`

```typescript
export interface RunContext {
  runId: string;
  agentId: string;
  config: AgentConfig;
  trigger: TriggerEvent;
  memory: MemoryStore;
  connections: ConnectionManager;
  startedAt: Date;
}

export interface RunResult {
  runId: string;
  agentId: string;
  duration: number;
  steps: StepOutput[];
  proposals: ActionProposal[];
  decisions: PolicyDecision[];
  executions: ExecutionResult[];
  eventsLogged: number;
}

export interface StepOutput {
  step: "scope" | "fetch" | "analyze" | "plan" | "policy" | "execute" | "memory";
  duration: number;
  data: unknown;
  llmUsage?: { inputTokens: number; outputTokens: number; cost: number };
}

export interface TriggerEvent {
  type: "cron" | "webhook" | "manual" | "chat";
  timestamp: Date;
  metadata?: Record<string, unknown>;  // e.g., webhook payload, chat message
}
```

---

### 2. `pipeline/` — Pipeline Tasks (trigger.dev)

Each pipeline step is a trigger.dev task. The main `agentRun` task orchestrates subtasks with durable execution, automatic retry, and checkpoint/resume for human approval.

#### `pipeline/agent-run.ts`

The main trigger.dev task. Orchestrates the 8 steps with built-in durability.

```typescript
import { task, wait } from "@trigger.dev/sdk";
import { resolveScope } from "./steps/scope";
import { fetchData } from "./steps/fetch";
import { analyzeSkill } from "./steps/analyze";
import { planActions } from "./steps/plan";
import { evaluatePolicy } from "./steps/policy-gate";
import { executeActions } from "./steps/execute";
import { writeMemory } from "./steps/memory-write";

export const agentRun = task({
  id: "agent-run",
  retry: { maxAttempts: 2 },
  run: async ({ agentId, trigger }: AgentRunPayload) => {
    const config = await loadAgentConfig(agentId);
    const runId = crypto.randomUUID();

    // Load workspace context (same ContextAssembler used by chat)
    // Both runtimes share one context boundary — no reasoning divergence
    const workspace = await workspaceStore.load(agentId);

    // Step 2: Scope Resolution
    const scopeContext = await contextAssembler.forScopeResolution(agentId, workspace);
    const { skills } = await resolveScope.triggerAndWait({
      runId, config, trigger, context: scopeContext
    });

    // Step 3: Data Fetch (parallel per data type)
    const { data } = await fetchData.triggerAndWait({
      runId, skills, connectionIds: config.connectionIds
    });

    // Step 4: Analyze Skills (parallel via batch)
    // Each skill gets its own context slice via ContextAssembler
    const insights = await analyzeSkill.batchTriggerAndWait(
      skills.map(skillId => ({
        payload: {
          runId, skillId, data,
          context: contextAssembler.forSkillExecution(agentId, skillId, workspace)
        }
      }))
    );

    // Step 5: Plan Actions
    const planContext = await contextAssembler.forPlanning(agentId, insights, workspace);
    const { proposals } = await planActions.triggerAndWait({
      runId, insights, context: planContext
    });

    // Step 6: Policy Gate (inline — deterministic, no subtask needed)
    const decisions = evaluatePolicy(proposals, config);

    // Step 7a: Execute auto-approved actions immediately
    const autoApproved = proposals.filter(p => decisions[p.id].result === "approved");
    let execResults = [];
    if (autoApproved.length > 0) {
      execResults = await executeActions.triggerAndWait({
        runId, proposals: autoApproved
      });
    }

    // Step 7b: Queue needs_review proposals for human approval
    const needsReview = proposals.filter(p => decisions[p.id].result === "needs_review");
    for (const proposal of needsReview) {
      await approvalRepository.queue(runId, agentId, proposal, decisions[proposal.id]);
      // Spawn a durable approval waiter per proposal (runs independently)
      await waitForApproval.trigger({ proposalId: proposal.id, runId, agentId });
    }

    // Step 8: Write memory
    await writeMemory.triggerAndWait({
      runId, agentId, skills, insights, proposals, decisions, execResults
    });

    // Return result for Feed rendering (includes queued proposals for UI)
    return { runId, skills, insights, proposals, decisions, execResults, queued: needsReview };
  },
});
```

#### `pipeline/approval.ts`

Handles the human-in-the-loop flow using trigger.dev checkpoint/resume.

```typescript
import { task, wait } from "@trigger.dev/sdk";

export const waitForApproval = task({
  id: "wait-for-approval",
  run: async ({ proposalId, agentId }: ApprovalPayload) => {
    // Checkpoint: task suspends here, releases compute.
    // Resumes when the frontend calls trigger.dev to resume with the decision.
    // No idle cost — we only pay for active compute.

    // Store pending proposal in DB for the UI to show
    await db.insert(pendingActions).values({ proposalId, agentId, status: "pending" });

    // Wait for user action (trigger.dev webhook resume)
    // The frontend POSTs to trigger.dev when user approves/rejects
    const decision = await wait.forEvent(`approval-${proposalId}`, {
      timeout: "7d",  // Auto-expire after 7 days
    });

    if (decision.approved) {
      return await executeActions.triggerAndWait({
        proposals: [decision.proposal]
      });
    }

    return { status: "rejected", reason: decision.reason };
  },
});
```

**Key implementation details:**
- Each step is a trigger.dev task with its own retry policy
- Steps that fail don't crash the run — trigger.dev retries, then marks as failed
- Every step is traced via OpenTelemetry (visible in trigger.dev dashboard)
- Skill analysis runs in parallel via `batchTriggerAndWait`
- Policy gate is inline (deterministic, fast, no subtask overhead)
- Token usage tracked per LLM call for cost monitoring
- Idempotency keys prevent duplicate action execution across retries

#### `pipeline/steps/scope.ts`

```
Scope Resolution

Input:
  - config.skills: string[]          (all available skills)
  - config.scopeStrategy: "static" | "llm"
  - trigger: TriggerEvent            (what caused this run)
  - context: AssembledContext         (from ContextAssembler — includes AGENT.md intent,
                                       KNOWLEDGE.md domain context, recent lessons from DB)
  - trigger.skills?: string[]        (trigger-specific override)

NOTE: Both pipeline and chat use the same ContextAssembler boundary.
      Pipeline steps receive workspace + DB context via AssembledContext,
      not raw config fields. This ensures Mode 1 and Mode 2 reason
      from identical agent identity and knowledge.

If scopeStrategy === "static":
  Return config.skills (or trigger.skills if set)

If scopeStrategy === "llm":
  Call AI SDK generateObject():
    Model: config.model (default: claude-sonnet)
    System: context.systemPrompt  // assembled from AGENT.md + lessons
    Input: { intent, availableSkills, trigger }
    Schema: z.object({ selectedSkills: z.array(z.string()) })

  Validate: all returned skill IDs exist in registry
  Return: selectedSkills
```

#### `pipeline/steps/fetch.ts`

```
Data Fetching (deterministic, parallel)

Input:
  - selectedSkills: SkillDefinition[]
  - connections: ConnectionManager

Flow:
  1. Collect all data types from selected skills
     Union of skill.consumes across all selected skills
     Deduplicate by data type ID

  2. Resolve data types to tools
     ConnectionManager.resolve(dataType) → { tool, connection }
     e.g., "search_terms" → { tool: "google_ads", connection: conn_123 }

  3. Fetch in parallel
     Promise.all(dataTypes.map(dt => connections.fetch(dt)))

  4. Return: Record<string, unknown>
     { "search_terms": DataFrame, "ad_metrics": DataFrame, ... }

Error handling:
  - If a data type can't be resolved → skip, log warning
  - If a fetch fails → partial result, affected skills get error context
  - Rate limiting → handled by ConnectionManager (retry with backoff)
```

#### `pipeline/steps/analyze.ts`

```
Skill Analysis (parallel, mixed LLM/deterministic)

Input:
  - data: Record<string, unknown>
  - skills: SkillDefinition[]
  - knowledge: Record<string, string>  (per-skill knowledge from config)

Flow:
  For each skill (in parallel via Promise.all):

    If skill.compute exists (deterministic):
      result = await skill.compute(relevantData, knowledge[skill.knowledgeKey])

    If skill.systemPrompt exists (LLM-powered):
      result = await AI SDK generateObject({
        model: agentModel,
        schema: skill.outputSchema,
        system: skill.systemPrompt + "\n\nDomain knowledge:\n" + knowledge,
        prompt: JSON.stringify(relevantData),
      })

    Validate result against skill.outputSchema (Zod)
    Emit "skill_output" event

  Return: SkillOutput[] (array of validated typed outputs)

Error handling:
  - Schema validation failure → retry once, then skip with error event
  - LLM timeout → skip skill, log error, continue with partial results
```

#### `pipeline/steps/plan.ts`

```
Unified Planner (LLM, cross-skill reasoning)

Input:
  - skillOutputs: SkillOutput[]
  - config.intent: string
  - lessons: Lesson[]
  - availableActions: ActionDefinition[]  (from Connection Manager)

Flow:
  If skillOutputs.length === 0:
    Return [] (nothing to plan)

  If single skill, single obvious action:
    Passthrough without LLM call (optimization)

  Otherwise:
    Call AI SDK generateObject({
      model: agentModel,
      schema: z.array(ActionProposalSchema),
      system: "You are a planning agent. Given skill analysis
               results, propose concrete actions. Consider
               dependencies between insights. Respect the
               agent's intent scope. Each proposal must
               reference an available action type.",
      prompt: JSON.stringify({
        intent: config.intent,
        insights: skillOutputs,
        lessons: lessons,
        availableActions: availableActions,
      }),
    })

  For each proposal:
    Generate idempotencyKey (hash of agent + action + args)
    Attach skillSource reference

  Return: ActionProposal[]
```

#### `pipeline/steps/policy-gate.ts`

```
Policy Gate (deterministic, no LLM, ever)

Input:
  - proposals: ActionProposal[]
  - policyRules: PolicyRule[]  (sorted by priority)
  - context: PolicyContext

Flow:
  For each proposal:
    1. Check per-action overrides (config.policyOverrides)
       If match → return override decision immediately

    2. Run policy rule chain (in priority order):
       For each rule:
         decision = rule.evaluate(proposal, context)
         If "blocked" → stop, return blocked
         If "needs_review" → record, continue (might get blocked by later rule)
         If "approved" → continue

    3. Check global override
       If config.globalApprovalRequired → needs_review

    4. Final decision = strictest result from all rules

  Categorize proposals:
    AUTO:   decision === "approved" → execute immediately
    QUEUE:  decision === "needs_review" → queue for user approval
    BLOCK:  decision === "blocked" → reject with reason

  Return: Map<proposalId, PolicyDecision>
```

#### `pipeline/steps/execute.ts`

```
Action Execution (deterministic, tool calls)

Input:
  - approvedProposals: ActionProposal[]  (AUTO-approved only)
  - connections: ConnectionManager

Flow:
  For each proposal (sequentially, not parallel — order may matter):
    1. Check idempotencyKey against recent executions
       If already executed → skip

    2. Resolve tool
       ConnectionManager.getExecutor(proposal.toolCategory, proposal.action)

    3. Execute
       result = await executor.execute(proposal.args)

    4. Emit "action_executed" event

  Return: ExecutionResult[]

Error handling:
  - Execution failure → log error, continue with next proposal
  - Partial failure is normal — report which succeeded/failed
  - Never retry automatically (user should review failures)
```

#### `pipeline/steps/memory-write.ts`

```
Memory Write (events always, lessons periodically)

Input:
  - runResult: full run data (all step outputs)
  - memoryStore: MemoryStore
  - config.lessonDistillationInterval: number

Flow:
  1. Always: write events for every step
     - scope_resolved: which skills were selected
     - data_fetched: what data was pulled (metadata, not raw data)
     - skill_output: each skill's findings
     - action_proposed: each proposal with reasoning
     - policy_decision: each decision with reason
     - action_executed: each execution result

  2. Conditionally: distill lessons (every N runs)
     If runCount % lessonDistillationInterval === 0:
       recentEvents = memoryStore.getRecentEvents(agentId, limit: 50)
       existingLessons = memoryStore.getLessons(agentId)

       newLessons = await AI SDK generateObject({
         model: agentModel,
         schema: z.array(LessonSchema),
         system: "Review these recent agent events. Extract
                  patterns worth remembering: user corrections,
                  recurring outcomes, timing patterns.
                  Mark lessons with confidence and expiry if
                  they're time-bound.",
         prompt: JSON.stringify({ recentEvents, existingLessons }),
       })

       memoryStore.saveLessons(newLessons)
```

---

### 3. `chat/` — Chat Agent (Mode 2)

Uses Vercel AI SDK `streamText` for LLM-driven interaction. Stateless per-request with SQLite message persistence. The Chat LLM has 10 Nochore-specific tools registered (5 domain + 4 workspace + conversation).

#### `chat/handler.ts`

```
Chat request handler using Vercel AI SDK:

- ContextAssembler: merges workspace files + DB state → system prompt
- Tools: 10 total (run-analysis, get-insights, apply-action, query-memory,
  explain-decision, read-workspace, update-knowledge, write-scratchpad,
  generate-report)
- Message history: loaded from SQLite (ChatSessionStore)
- Streaming: SSE via result.toUIMessageStreamResponse()
- Frontend: useChat() hook from @ai-sdk/react

Flow:
  1. User sends message in Chat tab (useChat hook)
  2. Frontend → server function → chat handler
  3. Load workspace files + DB state via ContextAssembler
  4. Load chat history from SQLite
  5. AI SDK streamText agent loop:
     LLM receives: assembled system prompt + tools + history + user message
     LLM decides: respond conversationally OR call a tool
     If tool called: execute, feed result back to LLM
     Loop until LLM responds without tool calls (maxSteps)
  6. Save new messages to SQLite
  7. Stream response via SSE to frontend
```

#### `chat/tools/run-analysis.ts`

```
Registered as an AI SDK tool (Zod schema for parameters).

When the user says "run a fresh analysis on Campaign X":
  1. Chat LLM calls this tool with { scope: "Campaign X" }
  2. Tool creates a TriggerEvent { type: "chat", metadata: { scope } }
  3. Invokes pipeline/runner.ts with scoped config
  4. Returns RunResult summary to the LLM
  5. LLM presents results conversationally
```

#### `chat/tools/apply-action.ts`

```
When the user says "go ahead and add those negatives":
  1. Chat LLM calls this tool with { proposalIds: [...] }
  2. Tool loads pending proposals from ApprovalRepository (not MemoryStore)
  3. Runs them through the SAME policy gate
  4. Executes approved ones via ConnectionManager
  5. Records approval event in ApprovalRepository
  6. Returns execution results to LLM
```

---

### 4. `skills/` — Skill System

#### `skills/registry.ts`

```
Skill Registry

Responsibilities:
  - Load skill definitions (built-in + extensions)
  - Validate skill schemas
  - Resolve skill IDs to definitions
  - List available skills for scope resolution

Interface:
  register(skill: SkillDefinition): void
  get(skillId: string): SkillDefinition
  list(): SkillDefinition[]
  getForAgent(agentConfig: AgentConfig): SkillDefinition[]
```

#### `skills/executor.ts`

```
Skill Executor

Runs a single skill with provided data.

  execute(skill, data, knowledge?):
    If skill.compute → deterministic path (call function)
    If skill.systemPrompt → LLM path (AI SDK generateObject)
    Validate output against skill.outputSchema
    Return typed result

Uses AI SDK generateObject for LLM calls. Model selection from agent config.
```

#### `skills/built-in/search-terms.ts` (example)

```typescript
// Ported from legacy/src/analyzers/search_terms.py
export const searchTermsSkill: SkillDefinition<SearchTermInsight> = {
  id: "search_terms",
  name: "Search Term Analysis",
  description: "Identifies wasteful search terms and missing negative keywords",
  consumes: [{ id: "search_terms", ... }, { id: "ad_metrics", ... }],
  outputSchema: SearchTermInsightSchema,
  systemPrompt: `You are an expert at Google Ads search term optimization.
    Analyze the provided search terms and identify:
    - Wasteful terms (high spend, zero or low conversions)
    - Missing negative keywords (irrelevant queries consuming budget)
    - High-intent terms to protect
    Consider the client's knowledge context for brand terms and business rules.
    Be specific: name exact terms, cite spend and conversion numbers.`,
  knowledgeKey: "search_terms",
};
```

---

### 5. `policy/` — Policy Engine

#### `policy/engine.ts`

```
Policy Engine

Pure function: evaluate(proposals, rules, context) → decisions

No LLM. No network calls. No side effects.
Rules are sorted by priority and evaluated sequentially.
Strictest result wins.

Implementation: ~80 lines. Direct port of legacy canary policy pattern.
```

#### `policy/rules/budget-delta.ts` (example)

```typescript
export const budgetDeltaRule: PolicyRule = {
  id: "budget_delta",
  name: "Budget Change Limit",
  description: "Limits the percentage a budget can change in one action",
  priority: 10,

  evaluate(proposal, context) {
    if (proposal.action !== "adjust_budget") {
      return { result: "approved", reason: "Not a budget action" };
    }
    const deltaPct = Math.abs(proposal.args.deltaPct as number);
    if (deltaPct <= 5) return { result: "approved", reason: "Under 5% threshold" };
    if (deltaPct <= 20) return { result: "needs_review", reason: `${deltaPct}% change requires approval` };
    return { result: "blocked", reason: `${deltaPct}% exceeds maximum 20% change` };
  },
};
```

---

### 6. `memory/` — Memory System

#### `memory/store.ts`

```
MemoryStore implementation backed by SQLite (Drizzle ORM).

Tables:
  agent_events:
    id TEXT PRIMARY KEY
    run_id TEXT
    agent_id TEXT
    timestamp INTEGER
    type TEXT
    data TEXT (JSON)
    INDEX(agent_id, timestamp)
    INDEX(run_id)

  lessons:
    id TEXT PRIMARY KEY
    agent_id TEXT
    content TEXT
    scope TEXT
    confidence TEXT
    source_event_ids TEXT (JSON array)
    created_at INTEGER
    expires_at INTEGER (nullable)
    INDEX(agent_id, scope)

Query patterns:
  - Recent events for an agent (last N, or since date)
  - Events for a specific run
  - Active lessons for an agent (not expired, optionally by scope)
```

---

### 7. `triggers/` — Trigger System (trigger.dev native)

#### `triggers/cron.ts`

```typescript
import { schedules } from "@trigger.dev/sdk";
import { agentRun } from "../pipeline/agent-run";

// Cron triggers are defined declaratively.
// When an agent is created/updated, we register/update its schedule.

export const dailyAgentRun = schedules.task({
  id: "daily-agent-run",
  run: async (payload) => {
    // payload.externalId = agentId (set during schedule creation)
    const agentId = payload.externalId;
    await agentRun.trigger({ agentId, trigger: { type: "cron" } });
  },
});

// Register a schedule for an agent:
// await schedules.create({
//   task: "daily-agent-run",
//   cron: "0 9 * * *",          // Daily at 9am
//   externalId: agentId,        // Links schedule to agent
//   deduplicationKey: agentId,  // One schedule per agent
// });
```

#### `triggers/webhook.ts`

```typescript
// Webhook triggers use trigger.dev's HTTP endpoint feature.
// Each agent with a webhook trigger gets a unique URL.
// trigger.dev handles validation, dedup, and routing.

import { task } from "@trigger.dev/sdk";
import { agentRun } from "../pipeline/agent-run";

export const webhookTrigger = task({
  id: "webhook-trigger",
  run: async ({ agentId, payload }: WebhookPayload) => {
    await agentRun.trigger({
      agentId,
      trigger: { type: "webhook", metadata: payload },
    });
  },
});
```

**No custom scheduler needed.** trigger.dev manages cron persistence, webhook endpoints, and job deduplication. Schedules survive server restarts.

---

### 8. `connections/` — Connection Manager

#### `connections/manager.ts`

```
Connection Manager

Wraps Composio SDK. Responsibilities:
  - Registry: which connections exist for a project
  - Resolve: which tool provides which data type
  - Fetch: pull data from connected tools
  - Execute: perform actions via connected tools
  - Health: check connection status (token expiry, rate limits)

For MVP:
  - Hardcoded resolution (Google Ads → search_terms, ad_metrics, etc.)
  - Direct Composio SDK calls for fetch/execute
  - Health check on startup + before each run
```

---

### 9. `db/` — Database

#### `db/schema.ts`

```
Drizzle ORM schema for SQLite.

Tables:
  projects        (id, name, icon, color, created_at)
  agents          (id, project_id, config JSON, created_at, updated_at)
  connections     (id, project_id, provider, composio_entity_id, status, config JSON)
  agent_events    (see memory/store.ts)
  lessons         (see memory/store.ts)
  runs            (id, agent_id, trigger_type, started_at, completed_at, result JSON)
  pending_actions (id, run_id, agent_id, proposal JSON, status, created_at)

SQLite file per project: data/<projectId>/nochore.db
Mirrors the legacy Parquet-per-client pattern but with SQL.
```

---

## Data Flow: End-to-End Example

**Triggered run: "Ad Spend Guardian" daily at 9am**

```
09:00 node-cron fires
  │
  ▼
triggers/scheduler.ts → pipeline/runner.ts
  │
  ├─ RunContext created (runId: "run_047")
  │
  ├─ Step 2: scope.ts
  │   AI SDK call: "Which skills matter today?"
  │   Input: intent + 5 skills + 3 lessons
  │   Output: ["search_terms", "budget_allocation"]
  │   Tokens: ~800 in, ~50 out
  │
  ├─ Step 3: fetch.ts
  │   DataTypes needed: search_terms, ad_metrics, budget_data
  │   All from Google Ads → 1 Composio connection
  │   Parallel fetch: 3 API calls → 2.1s
  │
  ├─ Step 4: analyze.ts (parallel)
  │   ┌─ search_terms skill (AI SDK)
  │   │  System: "You are an expert at..."
  │   │  Data: 200 search terms + ad metrics
  │   │  Output: SearchTermInsight (validated)
  │   │  Tokens: ~4000 in, ~800 out
  │   │
  │   └─ budget_allocation skill (AI SDK)
  │      System: "You are a budget analyst..."
  │      Data: campaign budgets + ad metrics
  │      Output: BudgetInsight (validated)
  │      Tokens: ~2000 in, ~400 out
  │
  ├─ Step 5: plan.ts
  │   AI SDK call: "Propose actions"
  │   Input: 2 skill outputs + intent + lessons
  │   Output: [
  │     { add_negative: "free wallpaper", confidence: 0.92 },
  │     { reduce_budget: Campaign X -15%, confidence: 0.78 }
  │   ]
  │   Tokens: ~3000 in, ~500 out
  │
  ├─ Step 6: policy-gate.ts (no LLM)
  │   Proposal 1: add_negative → budget_delta N/A → approved (AUTO)
  │   Proposal 2: reduce_budget 15% → tier: needs_review (QUEUE)
  │
  ├─ Step 7: execute.ts
  │   Proposal 1: Composio → Google Ads API → negative added
  │   Proposal 2: queued for user approval
  │
  └─ Step 8: memory-write.ts
     7 events logged
     No lesson distillation this run (not every-N yet)

Total: 4 LLM calls, ~10K input tokens, ~1.8K output tokens
Est. cost: ~$0.04 (Sonnet pricing)
Duration: ~8 seconds
```

---

## Integration with Frontend

TanStack Start server functions import directly from `@nochore/harness`:

```typescript
// apps/web/src/routes/$projectId.agents.$agentId.tsx

import { createServerFn } from "@tanstack/react-start";
import { getRunHistory, getAgent } from "@nochore/harness";

const loadAgent = createServerFn("GET", async (agentId: string) => {
  const agent = await getAgent(agentId);
  const runs = await getRunHistory(agentId, { limit: 20 });
  return { agent, runs };
});
```

```typescript
// Chat endpoint (AI SDK + TanStack Start)
import { handleChat } from "@nochore/harness/chat";

const chatFn = createServerFn("POST", async ({ agentId, message }) => {
  return handleChat(agentId, message);
  // Returns SSE stream via result.toUIMessageStreamResponse()
});
```

---

## Progressive Evolution Path

```
2026 Q2 (MVP):
  Pipeline:     trigger.dev tasks + AI SDK at seams
  Chat:         AI SDK streamText with 9 tools (5 domain + 3 workspace)
  Skills:       7 built-in (ported from legacy)
  Policy:       4 built-in rules
  Memory:       SQLite event log + lesson distillation
  Triggers:     trigger.dev cron + webhook
  Observability: trigger.dev dashboard (OpenTelemetry)

2026 Q4:
  Pipeline:     scope resolution always LLM-decided
  Skills:       marketplace (third-party skill definitions)
  Sandbox:      E2B for marketplace skill execution
  Policy:       user-configurable thresholds via UI
  Connections:  dynamic data type → tool resolution

2027+:
  Pipeline:     gradually shift to agentic execution
                trigger.dev tasks become LLM tool calls
                deterministic-driven → LLM-driven transition
  Skills:       fully agentic (reason freely over data)
  Memory:       primary competitive moat
  Contracts:    unchanged — same Skill, PolicyRule, MemoryStore
```

---

## Deployment Constraint

**Explicit assumption: single-host MVP.**

This architecture assumes the TanStack Start web server, trigger.dev worker, and SQLite database all run on the same machine with access to the same filesystem (for workspace .md files) and the same SQLite database.

This works for:
- Local development (everything on laptop)
- Single Fly.io instance with a persistent volume
- Single VPS / EC2 instance

This does NOT work for:
- Split web/worker deployment (trigger.dev Cloud workers on separate machines cannot access the local filesystem)
- Vercel (ephemeral filesystem, no persistent SQLite)
- Horizontal scaling (multiple web servers competing for SQLite writes)

**When this constraint breaks:** If trigger.dev Cloud workers need workspace file access, options are:
1. Bundle workspace files into the trigger.dev task payload (simple, adds latency)
2. Use object storage (R2/S3) for workspace files instead of local filesystem
3. Self-host trigger.dev on the same machine as the web server

For MVP, option 1 (payload bundling) is sufficient — workspace files are small (.md, typically < 10KB total per agent). The ContextAssembler already serializes workspace content into `AssembledContext`, which can be passed as a task payload.
