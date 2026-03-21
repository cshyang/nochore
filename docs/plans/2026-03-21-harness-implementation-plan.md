# Harness Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Nochore Harness Layer — a typed pipeline runner where AI agents execute an 8-step observe-reason-act cycle, with trigger.dev for durable orchestration and pi-ai for LLM communication.

**Architecture:** Monorepo package (`packages/harness/`) imported by TanStack Start server functions. Two runtimes: trigger.dev tasks for scheduled/triggered runs (Mode 1), pi-agent-core Agent for interactive chat (Mode 2). Contracts (Skill, PolicyRule, MemoryStore) are locked; execution model evolves.

**Tech Stack:** TypeScript, pi-ai (LLM), pi-agent-core (chat), trigger.dev v3 (pipeline orchestration), Zod (validation), Drizzle ORM + SQLite (database), Composio SDK (integrations), TanStack Start (frontend)

**Reference docs:**
- `docs/plans/2026-03-21-harness-layer-design.md` — Design decisions and pipeline architecture
- `docs/plans/2026-03-21-harness-components.md` — File structure, flows, tech stack details
- `docs/plans/2026-03-21-harness-architecture-expansion.md` — Runtime topology, deployment, memory, and missing subcomponents
- `docs/philosophy.md` — Product philosophy and four pillars
- `docs/ux-moments.md` — UX design (Setup, Found Something, Getting Smarter)

---

## Phase 1: Foundation (Week 1–2)

> Monorepo setup, contracts, database schema. Everything downstream depends on these.

### Task 1: Monorepo Package Scaffold

**Files:**
- Create: `packages/harness/package.json`
- Create: `packages/harness/tsconfig.json`
- Create: `packages/harness/src/index.ts`
- Modify: root `package.json` (add workspaces if not already configured)

- [ ] **Step 1: Create package directory structure**

```bash
mkdir -p packages/harness/src/{types,pipeline/steps,chat/tools,skills/built-in,policy/rules,memory,triggers,connections,db/migrations}
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "@nochore/harness",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate"
  }
}
```

- [ ] **Step 3: Install core dependencies**

```bash
cd packages/harness
npm install @mariozechner/pi-ai @mariozechner/pi-agent-core @trigger.dev/sdk zod drizzle-orm better-sqlite3 @sinclair/typebox
npm install -D vitest typescript drizzle-kit @types/better-sqlite3
```

- [ ] **Step 4: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create empty index.ts barrel export**

```typescript
// packages/harness/src/index.ts
// Public API — re-exports from each module
export * from "./types/skill";
export * from "./types/action";
export * from "./types/policy";
export * from "./types/memory";
export * from "./types/agent-config";
export * from "./types/run";
```

- [ ] **Step 6: Verify setup**

```bash
cd packages/harness && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add packages/harness/
git commit -m "feat: scaffold packages/harness monorepo package"
```

---

### Task 2: Type Contracts — Skill, Action, Policy

**Files:**
- Create: `packages/harness/src/types/skill.ts`
- Create: `packages/harness/src/types/action.ts`
- Create: `packages/harness/src/types/policy.ts`
- Create: `packages/harness/src/types/data-types.ts`
- Test: `packages/harness/src/types/__tests__/contracts.test.ts`

- [ ] **Step 1: Write contract validation tests**

```typescript
// packages/harness/src/types/__tests__/contracts.test.ts
import { describe, it, expect } from "vitest";
import { ActionProposalSchema } from "../action";
import { PolicyDecisionSchema } from "../policy";

describe("ActionProposal", () => {
  it("validates a well-formed proposal", () => {
    const proposal = {
      id: "prop_001",
      action: "add_negative_keyword",
      toolCategory: "google_ads",
      args: { term: "free wallpaper", matchType: "EXACT" },
      reason: "High spend, zero conversions",
      confidence: 0.92,
      skillSource: "search_terms",
      reversible: true,
      idempotencyKey: "hash_abc123",
    };
    expect(ActionProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it("rejects proposal with confidence > 1", () => {
    const bad = { confidence: 1.5, /* ... other fields */ };
    expect(ActionProposalSchema.safeParse(bad).success).toBe(false);
  });
});

describe("PolicyDecision", () => {
  it("validates approved decision", () => {
    const decision = { result: "approved" as const, reason: "Under threshold" };
    expect(PolicyDecisionSchema.safeParse(decision).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd packages/harness && npx vitest run src/types/__tests__/contracts.test.ts
```
Expected: FAIL (modules don't exist yet)

- [ ] **Step 3: Implement types/skill.ts**

Write the `SkillDefinition`, `SkillData`, and `DataType` interfaces with Zod schemas. Reference: `docs/plans/2026-03-21-harness-components.md` section "types/skill.ts".

- [ ] **Step 4: Implement types/action.ts**

Write `ActionProposal`, `ActionProposalSchema`, `ExecutionResult` with Zod schemas.

- [ ] **Step 5: Implement types/policy.ts**

Write `PolicyRule`, `PolicyDecision`, `PolicyDecisionSchema`, `PolicyContext`, `OperationalConstraint`.

- [ ] **Step 6: Implement types/data-types.ts**

Write `DataType` interface and `DataTypeRegistry` for mapping data type IDs to schemas.

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd packages/harness && npx vitest run src/types/__tests__/contracts.test.ts
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/harness/src/types/
git commit -m "feat: add core type contracts (Skill, Action, Policy, DataType)"
```

---

### Task 3: Type Contracts — Memory, AgentConfig, Run

**Files:**
- Create: `packages/harness/src/types/memory.ts`
- Create: `packages/harness/src/types/agent-config.ts`
- Create: `packages/harness/src/types/run.ts`
- Test: `packages/harness/src/types/__tests__/memory.test.ts`

- [ ] **Step 1: Write memory type tests**

Test that `AgentEvent`, `Lesson`, and `EventFilter` schemas validate correctly. Test edge cases: expired lessons, events with various types.

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement types/memory.ts**

Write `AgentEvent`, `AgentEventSchema`, `Lesson`, `LessonSchema`, `MemoryStore` interface, `EventFilter`. Reference: component spec "types/memory.ts" section.

- [ ] **Step 4: Implement types/agent-config.ts**

Write `AgentConfig`, `TriggerConfig`, `PolicyOverride`. This is the full agent definition — intent, skills, triggers, policy, connections, memory settings, scope strategy.

- [ ] **Step 5: Implement types/run.ts**

Write `RunContext`, `RunResult`, `StepOutput`, `TriggerEvent`. These are the pipeline's input/output types.

- [ ] **Step 6: Run tests — verify passes**

- [ ] **Step 7: Update index.ts exports and commit**

```bash
git commit -m "feat: add Memory, AgentConfig, Run type contracts"
```

---

### Task 4: Database Schema

**Files:**
- Create: `packages/harness/src/db/schema.ts`
- Create: `packages/harness/src/db/client.ts`
- Test: `packages/harness/src/db/__tests__/schema.test.ts`

- [ ] **Step 1: Write database tests**

Test that tables can be created, rows inserted, and queried. Use an in-memory SQLite instance.

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../client";
import { agents, agentEvents, lessons, runs } from "../schema";

describe("Database schema", () => {
  it("inserts and queries an agent", async () => {
    const db = createTestDb();
    await db.insert(agents).values({ id: "agent_1", projectId: "proj_1", config: "{}", createdAt: Date.now() });
    const result = await db.select().from(agents).where(eq(agents.id, "agent_1"));
    expect(result).toHaveLength(1);
  });

  it("inserts and queries events with filters", async () => {
    // Insert 3 events, query by agentId and type
  });
});
```

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement db/schema.ts**

Drizzle schema with tables: `projects`, `agents`, `agent_events`, `lessons`, `runs`, `pending_actions`, `connections`.

```typescript
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  color: text("color"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull().references(() => projects.id),
  config: text("config", { mode: "json" }).notNull(),  // AgentConfig JSON
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

export const agentEvents = sqliteTable("agent_events", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  agentId: text("agent_id").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull(),
  type: text("type").notNull(),
  data: text("data", { mode: "json" }).notNull(),
});

// ... lessons, runs, pending_actions, connections
```

- [ ] **Step 4: Implement db/client.ts**

Factory for creating Drizzle clients. `createDb(projectId)` returns a client pointed at `data/<projectId>/nochore.db`. `createTestDb()` returns in-memory SQLite.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Generate initial migration**

```bash
cd packages/harness && npx drizzle-kit generate
```

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add database schema (Drizzle + SQLite)"
```

---

## Phase 2: Core Engine (Week 3–4)

> Memory store, policy engine, skill system. The three pillars that power the pipeline.

### Task 5: Memory Store

**Files:**
- Create: `packages/harness/src/memory/store.ts`
- Create: `packages/harness/src/memory/events.ts`
- Test: `packages/harness/src/memory/__tests__/store.test.ts`

- [ ] **Step 1: Write memory store tests**

Test `appendEvent`, `queryEvents`, `getRecentEvents`, `getLessons`, `saveLessons`, `expireLesson`. Use in-memory SQLite.

Key tests:
- Append event and query it back
- Query events filtered by agentId, type, and date range
- Save lesson and retrieve by scope
- Expire a lesson and verify it's excluded from `getLessons`

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement memory/events.ts**

Event log: append-only writes, filtered queries via Drizzle. Generates UUIDs for event IDs.

- [ ] **Step 4: Implement memory/store.ts**

`MemoryStore` class implementing the interface from `types/memory.ts`. Wraps `events.ts` for Layer 1 and provides lesson CRUD for Layer 2.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add MemoryStore (event log + lessons)"
```

---

### Task 6: Policy Engine

**Files:**
- Create: `packages/harness/src/policy/engine.ts`
- Create: `packages/harness/src/policy/rules/budget-delta.ts`
- Create: `packages/harness/src/policy/rules/cooldown.ts`
- Create: `packages/harness/src/policy/rules/operational.ts`
- Create: `packages/harness/src/policy/rules/global-override.ts`
- Test: `packages/harness/src/policy/__tests__/engine.test.ts`

- [ ] **Step 1: Write policy engine tests**

Test the full evaluation chain:
- Proposal that passes all rules → approved
- Budget change > 20% → blocked
- Budget change 5–20% → needs_review
- Budget change < 5% → approved
- Same campaign changed within cooldown window → blocked
- Outside active hours → blocked
- Global override enabled → everything needs_review
- Per-action override "always_approve" → approved regardless of other rules
- Strictest result wins when multiple rules fire

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement policy/engine.ts**

`evaluatePolicy(proposals, rules, context)` — pure function. Sorts rules by priority, evaluates sequentially, returns strictest result per proposal. ~80 lines. Direct port of legacy `evaluate_action_plan` pattern.

- [ ] **Step 4: Implement the four built-in rules**

Each rule implements the `PolicyRule` interface. Reference: component spec "policy/rules" section. Port logic from `legacy/src/engine/policy/service.py` and `legacy/src/engine/policy/canary.py`.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add policy engine with 4 built-in rules"
```

---

### Task 7: Skill Registry & Executor

**Files:**
- Create: `packages/harness/src/skills/registry.ts`
- Create: `packages/harness/src/skills/executor.ts`
- Test: `packages/harness/src/skills/__tests__/executor.test.ts`

- [ ] **Step 1: Write skill executor tests**

Test both paths:
- Deterministic skill: `compute()` function called, output validated against schema
- LLM-powered skill: mock `pi-ai` call, verify system prompt + data sent, output validated
- Schema validation failure: executor retries once, then returns error
- Knowledge injection: verify knowledge string is appended to system prompt

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement skills/registry.ts**

`SkillRegistry` class: `register(skill)`, `get(id)`, `list()`, `getForAgent(config)`. Simple Map-based registry.

- [ ] **Step 4: Implement skills/executor.ts**

`executeSkill(skill, data, knowledge?)` — if `skill.compute` exists, call it. If `skill.systemPrompt` exists, call `pi-ai` `generateObject()` with the skill's output schema. Validate result with Zod. Return typed output.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add skill registry and executor (LLM + deterministic)"
```

---

### Task 8: First Built-in Skill (Search Terms)

**Files:**
- Create: `packages/harness/src/skills/built-in/search-terms.ts`
- Test: `packages/harness/src/skills/__tests__/search-terms.test.ts`

- [ ] **Step 1: Write search terms skill test**

Test that the skill definition is valid: correct `consumes`, `produces`, `systemPrompt` exists, output schema validates sample data.

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement search-terms skill**

Port from legacy `legacy/src/analyzers/search_terms.py`. Define the Zod output schema (`SearchTermInsight`), system prompt with domain expertise, and data type dependencies.

Reference: component spec "skills/built-in/search-terms.ts" section.

- [ ] **Step 4: Run tests — verify passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add search-terms built-in skill"
```

---

## Phase 3: Pipeline (Week 5–6)

> trigger.dev integration and the 8-step pipeline. This is where the agent actually runs.

### Task 9: trigger.dev Setup

**Files:**
- Create: `packages/harness/trigger.config.ts`
- Create: `packages/harness/src/triggers/config.ts`
- Modify: `packages/harness/package.json` (add trigger.dev scripts)

- [ ] **Step 1: Install trigger.dev SDK**

```bash
cd packages/harness && npm install @trigger.dev/sdk
```

- [ ] **Step 2: Create trigger.config.ts**

```typescript
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "nochore-harness",
  dirs: ["src/pipeline", "src/triggers"],
});
```

- [ ] **Step 3: Create triggers/config.ts**

Export trigger.dev configuration helpers and shared constants (retry policies, timeout defaults).

- [ ] **Step 4: Add scripts to package.json**

```json
{
  "scripts": {
    "trigger:dev": "npx trigger.dev@latest dev",
    "trigger:deploy": "npx trigger.dev@latest deploy"
  }
}
```

- [ ] **Step 5: Verify trigger.dev dev mode starts**

```bash
cd packages/harness && npx trigger.dev@latest dev
```

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: configure trigger.dev for pipeline orchestration"
```

---

### Task 10: Pipeline Steps (Scope, Fetch, Analyze)

**Files:**
- Create: `packages/harness/src/pipeline/steps/scope.ts`
- Create: `packages/harness/src/pipeline/steps/fetch.ts`
- Create: `packages/harness/src/pipeline/steps/analyze.ts`
- Test: `packages/harness/src/pipeline/__tests__/steps.test.ts`

- [ ] **Step 1: Write step tests**

Test scope resolution:
- Static strategy: returns config.skills unchanged
- LLM strategy: mock pi-ai, verify it receives intent + skills + lessons, returns selected subset

Test fetch:
- Given 2 skills consuming 3 data types (with overlap), verify deduplication and parallel fetch
- Mock ConnectionManager.fetch()

Test analyze:
- Given 2 skills and fetched data, verify both execute in parallel
- Verify outputs are validated against skill output schemas

- [ ] **Step 2: Run tests — verify fails**

- [ ] **Step 3: Implement scope.ts**

`resolveScope(config, trigger, lessons)` — if static, return skills list. If LLM, call `pi-ai generateObject()` with scope resolution prompt.

- [ ] **Step 4: Implement fetch.ts**

`fetchData(skills, connectionManager)` — collect `consumes` from all skills, deduplicate, resolve to tools via ConnectionManager, fetch in parallel.

- [ ] **Step 5: Implement analyze.ts**

`analyzeSkills(skills, data, knowledge)` — run all skills in parallel via `Promise.all()`. Each calls `executeSkill()` from the skill executor. Return validated outputs.

- [ ] **Step 6: Run tests — verify passes**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat: add pipeline steps (scope, fetch, analyze)"
```

---

### Task 11: Pipeline Steps (Plan, Policy Gate, Execute, Memory Write)

**Files:**
- Create: `packages/harness/src/pipeline/steps/plan.ts`
- Create: `packages/harness/src/pipeline/steps/policy-gate.ts`
- Create: `packages/harness/src/pipeline/steps/execute.ts`
- Create: `packages/harness/src/pipeline/steps/memory-write.ts`
- Test: `packages/harness/src/pipeline/__tests__/plan-execute.test.ts`

- [ ] **Step 1: Write tests**

Test plan:
- Given 2 skill outputs + intent, verify LLM is called with correct prompt
- Single skill, single obvious action → passthrough (no LLM call)
- Verify idempotency keys are generated

Test policy gate:
- Delegates to policy engine (already tested in Task 6)
- Categorizes into AUTO / QUEUE / BLOCK

Test execute:
- Auto-approved proposals are executed via ConnectionManager
- Idempotency check prevents duplicate execution
- Failed execution logs error, continues with next

Test memory write:
- Events logged for every step
- Lesson distillation triggered on correct interval

- [ ] **Step 2: Run tests — verify fails**

- [ ] **Step 3: Implement plan.ts, policy-gate.ts, execute.ts, memory-write.ts**

Reference: component spec pipeline/steps sections.

- [ ] **Step 4: Run tests — verify passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add pipeline steps (plan, policy, execute, memory)"
```

---

### Task 12: Pipeline Orchestrator (agent-run task)

**Files:**
- Create: `packages/harness/src/pipeline/agent-run.ts`
- Create: `packages/harness/src/pipeline/approval.ts`
- Test: `packages/harness/src/pipeline/__tests__/agent-run.test.ts`

- [ ] **Step 1: Write orchestrator test**

Integration test: given a mock agent config, trigger the full pipeline. Mock all external calls (pi-ai, ConnectionManager). Verify:
- All 8 steps execute in order
- Step outputs flow correctly between steps
- RunResult contains all step data
- Events are written to memory

- [ ] **Step 2: Run test — verify fails**

- [ ] **Step 3: Implement agent-run.ts**

The main trigger.dev task. Orchestrates steps 1–8 with `triggerAndWait` for subtasks. Policy gate is inline (deterministic). Reference: component spec "pipeline/agent-run.ts" section.

- [ ] **Step 4: Implement approval.ts**

The checkpoint/resume task for human-in-the-loop. Stores pending action in DB, waits for event, resumes on approval. Reference: component spec "pipeline/approval.ts" section.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add pipeline orchestrator (trigger.dev agent-run task)"
```

---

### Task 13: Trigger System (Cron + Webhook)

**Files:**
- Create: `packages/harness/src/triggers/cron.ts`
- Create: `packages/harness/src/triggers/webhook.ts`
- Test: `packages/harness/src/triggers/__tests__/triggers.test.ts`

- [ ] **Step 1: Write trigger tests**

Test cron: schedule creation/deletion, verify it invokes agent-run task.
Test webhook: payload validation, verify it invokes agent-run task with metadata.

- [ ] **Step 2: Run tests — verify fails**

- [ ] **Step 3: Implement cron.ts and webhook.ts**

trigger.dev native schedule and webhook handlers. Reference: component spec "triggers/" section.

- [ ] **Step 4: Run tests — verify passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add trigger system (cron + webhook via trigger.dev)"
```

---

## Phase 4: Chat + Connections (Week 7–8)

> Chat mode (pi-agent-core) and Connection Manager (Composio wrapper).

### Task 14: Connection Manager (Stub)

**Files:**
- Create: `packages/harness/src/connections/manager.ts`
- Create: `packages/harness/src/connections/resolver.ts`
- Test: `packages/harness/src/connections/__tests__/resolver.test.ts`

- [ ] **Step 1: Write resolver tests**

Test data type → tool resolution:
- "search_terms" resolves to Google Ads
- "ad_metrics" resolves to Google Ads
- Unknown data type throws error
- Multiple data types from same tool are deduplicated into one API call

- [ ] **Step 2: Run tests — verify fails**

- [ ] **Step 3: Implement resolver.ts**

Hardcoded mapping for MVP. Google Ads provides: search_terms, ad_metrics, budget_data, impression_share, quality_scores. Meta provides: campaign_performance. GA4 provides: landing_pages. Search Console provides: search_analytics.

- [ ] **Step 4: Implement manager.ts**

`ConnectionManager` class: `fetch(dataType)`, `execute(action, args)`, `getHealth()`. For MVP, wraps Composio SDK with hardcoded resolution. Health check returns connection status.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add Connection Manager with hardcoded data type resolution"
```

---

### Task 15: Chat Agent (pi-agent-core)

**Files:**
- Create: `packages/harness/src/chat/agent.ts`
- Create: `packages/harness/src/chat/tools/run-analysis.ts`
- Create: `packages/harness/src/chat/tools/get-insights.ts`
- Create: `packages/harness/src/chat/tools/query-memory.ts`
- Create: `packages/harness/src/chat/tools/apply-action.ts`
- Create: `packages/harness/src/chat/tools/explain-decision.ts`
- Test: `packages/harness/src/chat/__tests__/agent.test.ts`

- [ ] **Step 1: Write chat agent tests**

Test that the agent:
- Creates with correct system prompt (includes intent, skills, lessons)
- Has all 5 tools registered
- run-analysis tool triggers pipeline and returns result
- query-memory tool searches events and lessons
- apply-action tool runs through policy gate before executing

- [ ] **Step 2: Run tests — verify fails**

- [ ] **Step 3: Implement chat/tools/**

5 tool files, each following pi-agent-core tool registration pattern with TypeBox parameters. Reference: component spec "chat/tools" section.

- [ ] **Step 4: Implement chat/agent.ts**

`createChatAgent(agentId)` — loads agent config, constructs system prompt (intent + skills + recent lessons), registers 5 Nochore tools, returns pi-agent-core Agent instance.

- [ ] **Step 5: Run tests — verify passes**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add chat agent with 5 Nochore tools (pi-agent-core)"
```

---

## Phase 5: Frontend Integration (Week 9–10)

> Wire the harness to the TanStack Start frontend. Feed, Monitor, Chat, approval flow.

### Task 16: Server Functions

**Files:**
- Modify: `apps/web/package.json` (add @nochore/harness dependency)
- Create: `apps/web/src/server/agents.ts` (server functions for agent CRUD)
- Create: `apps/web/src/server/runs.ts` (server functions for run history)
- Create: `apps/web/src/server/chat.ts` (server function for chat)
- Create: `apps/web/src/server/approvals.ts` (server function for approval actions)

- [ ] **Step 1: Add harness dependency to web app**

```bash
cd apps/web && npm install @nochore/harness
```

- [ ] **Step 2: Create server/agents.ts**

Server functions: `getAgent(id)`, `listAgents(projectId)`, `createAgent(config)`, `updateAgent(id, config)`.

- [ ] **Step 3: Create server/runs.ts**

Server functions: `getRunHistory(agentId, limit)`, `getRunDetail(runId)`.

- [ ] **Step 4: Create server/chat.ts**

Server function: `sendChatMessage(agentId, message)` → creates/reuses chat agent, calls `agent.prompt()`, returns response.

- [ ] **Step 5: Create server/approvals.ts**

Server functions: `getPendingActions(agentId)`, `approveAction(proposalId)`, `rejectAction(proposalId, reason)`.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add server functions wiring harness to frontend"
```

---

### Task 17: Feed Component (Decision Log)

**Files:**
- Modify: `apps/web/src/components/InsightFeed.tsx`
- Create: `apps/web/src/components/FeedEntry.tsx`
- Create: `apps/web/src/components/ApprovalCard.tsx`

- [ ] **Step 1: Wire InsightFeed to real data**

Replace mock data with server function calls. Load run history for the agent. Render each run as a Feed entry with skill outputs, proposals, and decisions.

- [ ] **Step 2: Create FeedEntry component**

Renders a single pipeline run as a decision log entry. Shows: which skills ran, key findings, proposed actions (with status: auto-approved / pending / blocked), lessons learned.

- [ ] **Step 3: Create ApprovalCard component**

Interactive card for pending actions. Shows proposal details, reasoning, confidence score. "Approve" and "Reject" buttons that call server/approvals.ts.

- [ ] **Step 4: Verify UI renders with test data**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: wire Feed component to harness (real data + approval flow)"
```

---

### Task 18: Chat Component

**Files:**
- Modify: `apps/web/src/components/AgentChat.tsx`

- [ ] **Step 1: Wire AgentChat to server/chat.ts**

Replace mock chat with real chat agent calls. Stream responses. Show tool calls inline (e.g., "Running fresh analysis..." when agent calls run-analysis tool).

- [ ] **Step 2: Add chat-triggered pipeline awareness**

When the chat agent triggers a pipeline run, show the results inline in the chat thread. Link to the Feed entry for the full details.

- [ ] **Step 3: Verify end-to-end chat flow**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: wire Chat component to pi-agent-core chat agent"
```

---

## Phase 6: First Live Agent (Week 11–12)

> Port the legacy CLI to become the first agent on the platform. Real money, real consequences.

### Task 19: Remaining Built-in Skills

**Files:**
- Create: `packages/harness/src/skills/built-in/budget-allocation.ts`
- Create: `packages/harness/src/skills/built-in/quality-score.ts`
- Create: `packages/harness/src/skills/built-in/trends.ts`
- Create: `packages/harness/src/skills/built-in/composition.ts`
- Create: `packages/harness/src/skills/built-in/web-quality.ts`
- Create: `packages/harness/src/skills/built-in/organic-search.ts`
- Test: one test file per skill

- [ ] **Step 1: Port remaining 6 skills from legacy analyzers**

Each skill: define Zod output schema, system prompt with domain expertise, data type dependencies. Reference legacy analyzers in `legacy/src/analyzers/`.

- [ ] **Step 2: Write and run tests for each skill**

- [ ] **Step 3: Register all 7 skills in the default registry**

- [ ] **Step 4: Commit**

```bash
git commit -m "feat: add 6 remaining built-in skills (ported from legacy)"
```

---

### Task 20: Composio Integration

**Files:**
- Create: `packages/harness/src/connections/composio.ts`
- Modify: `packages/harness/src/connections/manager.ts` (replace stubs with Composio calls)

- [ ] **Step 1: Install Composio SDK**

```bash
cd packages/harness && npm install composio-core
```

- [ ] **Step 2: Implement composio.ts**

Wrapper around Composio SDK for Google Ads data fetching: search terms, campaign metrics, impression share, quality scores, budget data. Handle OAuth token refresh, rate limiting, error responses.

- [ ] **Step 3: Wire ConnectionManager to use Composio**

Replace stub fetch/execute methods with real Composio API calls.

- [ ] **Step 4: Test with real Google Ads credentials (manual)**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: integrate Composio SDK for Google Ads data fetching"
```

---

### Task 21: "Ad Spend Guardian" — First Agent

**Files:**
- Create: `packages/harness/src/agents/ad-spend-guardian.ts` (default agent config)
- Modify: frontend Setup flow to create this agent

- [ ] **Step 1: Define default agent config**

```typescript
export const adSpendGuardianConfig: Partial<AgentConfig> = {
  name: "Ad Spend Guardian",
  description: "Monitors Google Ads for wasteful spend and budget inefficiencies",
  intent: "Find and eliminate wasted ad spend. Surface search term waste, budget misallocation, and quality score issues. Recommend and execute optimizations within policy bounds.",
  skills: ["search_terms", "budget_allocation", "quality_score", "trends", "composition"],
  triggers: [{ type: "cron", config: { cron: "0 9 * * *" } }],
  policyRules: ["budget_delta", "cooldown", "operational", "global_override"],
  memoryEnabled: true,
  lessonDistillationInterval: 5,
  scopeStrategy: "llm",
};
```

- [ ] **Step 2: Create agent via the platform**

Use the Setup flow (or directly via server function) to create the agent for a real project.

- [ ] **Step 3: Run first scheduled pipeline**

Trigger a manual run. Verify the full pipeline: scope → fetch → analyze → plan → policy → execute → memory.

- [ ] **Step 4: Verify Feed shows results**

Check the Feed tab displays the decision log correctly.

- [ ] **Step 5: Test approval flow**

Create a scenario where a budget change needs approval. Verify the pending action appears in the UI, can be approved/rejected, and the pipeline resumes correctly.

- [ ] **Step 6: Commit**

```bash
git commit -m "feat: add Ad Spend Guardian as first live agent"
```

---

### Task 22: Memory — Lesson Distillation

**Files:**
- Create: `packages/harness/src/memory/lessons.ts`
- Test: `packages/harness/src/memory/__tests__/lessons.test.ts`

- [ ] **Step 1: Write lesson distillation tests**

Given 10 mock events (including user corrections), verify:
- LLM is called with correct prompt (recent events + existing lessons)
- Output is validated as Lesson[]
- Time-bound lessons have expiry dates
- Distilled lessons are saved to DB

- [ ] **Step 2: Run tests — verify fails**

- [ ] **Step 3: Implement lessons.ts**

`distillLessons(agentId, memoryStore)` — loads recent events + existing lessons, calls pi-ai with the lesson distillation prompt, validates output, saves new lessons. Called by memory-write step on the configured interval.

- [ ] **Step 4: Run tests — verify passes**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat: add lesson distillation (periodic LLM summarization)"
```

---

## Milestone Checklist

| Phase | Milestone | Acceptance Criteria |
|-------|-----------|-------------------|
| **1. Foundation** | Contracts + DB compile and test | All types export cleanly, DB creates/queries work |
| **2. Core Engine** | Memory + Policy + Skills work | Can store events, evaluate policy rules, execute skills |
| **3. Pipeline** | End-to-end pipeline runs | trigger.dev task executes all 8 steps with mock data |
| **4. Chat + Conn** | Chat agent responds, connections fetch | User can chat, agent calls tools, data flows from APIs |
| **5. Frontend** | Feed + Chat + Approval work in UI | User sees decision log, chats with agent, approves actions |
| **6. Live Agent** | Ad Spend Guardian manages real ads | Real Google Ads data, real proposals, real policy gates |

---

## Dependencies Graph

```
Task 1 (scaffold)
  └─► Task 2 (type contracts: Skill, Action, Policy)
  └─► Task 3 (type contracts: Memory, Config, Run)
        └─► Task 4 (database schema)
              └─► Task 5 (memory store)
              └─► Task 6 (policy engine)
              └─► Task 7 (skill registry + executor)
                    └─► Task 8 (first built-in skill)
                    └─► Task 19 (remaining skills)
              └─► Task 9 (trigger.dev setup)
                    └─► Task 10 (pipeline steps: scope, fetch, analyze)
                    └─► Task 11 (pipeline steps: plan, policy, execute, memory)
                          └─► Task 12 (pipeline orchestrator)
                          └─► Task 13 (triggers: cron + webhook)
              └─► Task 14 (connection manager stub)
                    └─► Task 20 (Composio integration)
              └─► Task 15 (chat agent)
                    └─► Task 18 (chat component)
              └─► Task 16 (server functions)
                    └─► Task 17 (feed component)
                          └─► Task 21 (first live agent)
              └─► Task 22 (lesson distillation)

Parallelizable pairs:
  - Tasks 2+3 (type contracts)
  - Tasks 5+6+7 (memory, policy, skills — independent modules)
  - Tasks 10+14 (pipeline steps + connection manager)
  - Tasks 15+13 (chat agent + triggers)
  - Tasks 17+18 (feed + chat components)
  - Tasks 19+20 (remaining skills + Composio)
```
