# Agent Runtime Baseline

**Date:** 2026-05-11  
**Status:** Baseline  
**Purpose:** Record the current agent runtime shape before comparing Trigger.dev, Cloudflare Agents, Cloudflare Sandbox, Flue, or any future execution framework.

## Why This Exists

Nochore is moving toward agents that are created from simple configuration: prompt, model, tools, MCP servers, subagents, memory, policy, approvals, schedule, and runtime.

Before choosing whether to keep the current Trigger.dev setup, adopt Cloudflare Agents, use Flue, or combine them, the team needs a factual map of what already exists. This document is not a rewrite proposal. It is the baseline future proposals must compare against.

## Goal Stack

Nochore exists to make an agent feel like an accountable operator, not a workflow graph or an LLM wrapper. The user should configure an outcome and trust the agent to execute, ask for approval when needed, remember stable lessons, and report back with evidence.

One level down, the agent runtime must support:

- durable agent identity and configuration
- safe tool access through deterministic policy
- workspace-aware execution
- human approvals with resume semantics
- delegated specialist work
- durable run, task, event, approval, and memory records
- live product state that stays calm while work happens underneath

The framework choice is secondary. Trigger.dev, Cloudflare Agents, Flue, and pi-coding-agent are implementation substrates. The product contract should be a Nochore-owned agent manifest.

## Current Runtime Shape

### Identity And Config

The durable product identity is currently an `AgentRecord` backed by the harness repositories. The configurable subset is `AgentConfigSchema` in `packages/harness/src/types/agent-config.ts`.

Current `AgentConfig` owns:

- `instructions`
- selected `skills`
- `toolConfig`
- `notificationConfig`
- `schedule`
- optional `primaryMetric`

It does not yet own:

- runtime provider
- model selection
- MCP servers
- subagent definitions
- memory policy
- sandbox type
- queue/concurrency policy
- artifact policy
- run/task limits

That means the system is agent-shaped, but not yet fully manifest-driven.

### Orchestration

The main durable execution entrypoint is `services/worker/src/triggers/agent-run.ts`.

The lead run:

1. loads the agent and runtime dependencies
2. creates or reuses a run record
3. assembles the prompt bundle
4. resolves provider tools
5. builds the lead tool envelope
6. runs the lead agent session
7. records findings, summary, events, and lessons

Delegated work is represented by `AgentTask` records and executed by `services/worker/src/triggers/agent-task-run.ts`.

The coordination path is:

1. lead agent calls `delegate_task`
2. `agent-task-coordinator.ts` creates an `AgentTask` row
3. parent run is marked `waiting_for_tasks`
4. child Trigger task is started with `triggerAndWait`
5. task result is normalized by `agent-task-execution.ts`
6. parent run resumes and receives the task summary

This is the strongest part of the current shape: parent/child work is product-visible as task state, while Trigger owns durable execution mechanics.

### Execution

The execution boundary is `services/worker/src/lib/agent-executor.ts`.

```ts
export type AgentExecutor = (config: AgentExecutorConfig) => Promise<AgentExecutionResult>;
```

`agent-session.ts` is intentionally above the executor. It owns:

- policy evaluation
- learned rule lookup
- approval routing
- metric recording
- event recording
- task correlation

The executor is selected by `agent-executor-selector.ts`. `AGENT_EXECUTOR` defaults to `flue`; `AGENT_EXECUTOR=pi` explicitly selects the deprecated pi-coding-agent fallback.

The default executor is now `flue-runtime.ts`. It uses Flue as the harness adapter, injects the assembled system prompt through a virtual `AGENTS.md`, uses Flue schema results instead of `submit_report`, and gates Flue built-in tools through a wrapped `SessionEnv`.

The fallback executor is `pi-runtime.ts`, which adapts `pi-coding-agent`. It provides:

- built-in coding tools: `bash`, `read`, `edit`, `write`
- custom tools from the Nochore tool envelope
- a `submit_report` completion tool
- event translation into Nochore run events
- token and duration accounting

This means the concrete harness remains replaceable in principle. Flue is the current default because it matches the desired agent harness shape better than the manual loop, while Cloudflare Agents or another runtime can still be introduced behind the same contract if it preserves the event, policy, approval, and result semantics.

### Tools And Policy

Tool envelopes are built in `services/worker/src/lib/tool-envelope.ts`.

The lead envelope includes:

- provider tools
- internal runtime tools such as `delegate_task`, `record_metric`, and `submit_report`

AgentTask envelopes are narrowed by construction. Child tasks do not receive `delegate_task`, so delegation cannot recurse through the current runtime.

Policy is deterministic and runs before tool execution in `agent-session.ts`. The policy layer uses:

- configured tool approval modes
- global approval mode
- learned rules
- recent tool call history

Approvals are not executor-owned. The executor only asks to run a tool; the session layer decides whether the call is allowed, blocked, or paused for human approval.

### Approvals

Approval waitpoints are implemented in `services/worker/src/lib/approval-flow.ts` using Trigger wait tokens.

The product state is stored in the approval repository. The Trigger token is the runtime checkpoint that lets execution pause and resume.

The current approval model supports:

- pending approval records
- run/task correlation
- approval request events
- approval resolution events
- expiration handling
- learned policy rule suggestions

Known edge: `apps/web/src/server/approvals-core.ts` marks an approval resolved before completing the Trigger wait token. If token completion fails, product state can say resolved while the runtime remains waiting.

### Memory

Memory is product-owned, not executor-owned.

The current memory-related surfaces are:

- run events
- conversation events
- lessons
- durable memory records used by chat
- workspace files for authored context

Completed runs can distill lessons in `agent-run.ts`. Chat memory extraction lives in `apps/web/src/server/chat-memory.ts`. The architecture direction is consistent with the three-layer split: files own authored context, DB owns operational truth, and optional mirrors are debug/export aids.

Cloudflare Durable Object SQLite or Flue sessions could be useful as actor-local/session-local memory, but they should not silently become the canonical source for product memory, approvals, runs, or audit history.

### Delivery

The frontend does not expose containers or child runtime details. It projects runs, events, approvals, and tasks into an agent-facing experience.

The intended UX remains:

- one accountable lead agent on the surface
- many coordinated work units underneath
- approvals shown when needed
- details available without turning the product into an orchestration console

Trigger metadata is populated in some paths, but the product currently relies primarily on app DB state and projected snapshots.

## Current Strengths

- The `AgentExecutor` boundary is small and real.
- Policy, approvals, memory, and run state sit outside the executor.
- AgentTask records are product-owned, not hidden container details.
- Trigger `triggerAndWait` matches the current parent/child orchestration model.
- Child task tool envelopes are narrower than lead tool envelopes.
- The default executor can do real workspace work through shell and file tools.
- Runs and approvals are auditable through app DB records and events.

## Current Weak Spots

- `AgentConfig` is too thin for the desired simple agent manifest.
- Subagent roles are hard-coded as `scout`, `analyst`, and `builder`.
- `DEFAULT_MAX_AGENT_TASKS` is hard-coded at 3.
- MCP servers are not first-class in config or runtime.
- Runtime, harness, sandbox, and orchestrator are not explicit config choices.
- Flue is now the default executor, but `pi-runtime.ts` remains as an explicit rollback path until real agent runs pass side-by-side and the fallback can be deleted.
- Main run triggering lacks explicit idempotency keys.
- Scheduled runs call `triggerAndWait` without unwrapping and checking child success.
- Cancellation calls Trigger cancellation, but executor-level abort propagation is not fully established.
- Approval resolution can diverge from wait token completion on failure.
- Tool defaults need another pass, especially internal write-capable tools.

## Architectural Invariants

Future runtime work should preserve these invariants:

1. **Nochore agent manifest is the product contract.** Framework-specific files and runtime APIs are adapters.
2. **Product DB owns durable truth.** Runs, tasks, approvals, memory, audit, and billing cannot be hidden in a runtime substrate.
3. **Executors emit events and results; they do not own policy.**
4. **Policy is deterministic.** LLMs may explain or recommend, but not decide permission.
5. **Subagents are configured capabilities, not hard-coded role strings.**
6. **Sandbox trust boundary is explicit.** Virtual shell, Trigger container, Cloudflare Sandbox, and external sandbox are different risk profiles.
7. **The product surface tracks agent work, not infrastructure objects.**

## Target Manifest Direction

The next stable contract should look more like this than the current `AgentConfig`:

```ts
type AgentManifest = {
  prompt: string;
  model: {
    provider: string;
    id: string;
    reasoning?: "off" | "low" | "medium" | "high";
  };
  tools: Array<{
    id: string;
    source: "native" | "mcp" | "internal";
    approvalMode: "auto" | "approval" | "blocked";
  }>;
  mcpServers: Array<{
    id: string;
    transport: "streamable-http" | "sse" | "stdio";
    url?: string;
  }>;
  subagents: Array<{
    id: string;
    role: string;
    prompt: string;
    tools: string[];
    maxRuns?: number;
    memoryScope: "none" | "session" | "agent" | "shared";
    runtime: "same-session" | "trigger-task" | "cloudflare-subagent" | "external-job";
  }>;
  memory: {
    mode: "none" | "session" | "durable" | "semantic";
    store: "app-db" | "do-sqlite" | "d1" | "external";
  };
  runtime: {
    orchestrator: "trigger" | "cloudflare-workflows";
    harness: "pi-coding-agent" | "flue" | "custom";
    sandbox: "trigger-container" | "cloudflare-sandbox" | "virtual" | "external";
  };
  schedule: {
    mode: "manual" | "hourly" | "6hours" | "daily" | "weekly" | "custom";
    cron?: string;
  };
  limits: {
    maxAgentTasks?: number;
    maxDurationSeconds?: number;
    maxToolCalls?: number;
  };
};
```

This is not a final schema. It is the shape future changes should converge toward.

## Framework Evaluation Questions

Any future Cloudflare Agents, Cloudflare Sandbox, Flue, Trigger, or other runtime spike should answer these questions against this baseline.

### Cloudflare Agents

- Does it improve durable agent identity, sessions, wake/sleep behavior, or WebSocket delivery?
- Can Durable Object state remain a cache/session layer while app DB remains source of truth?
- Do subagents map to product `subagents`, or are they only actor-local implementation details?
- How do alarms, fibers, and Workflows replace or complement Trigger waitpoints?

### Cloudflare Sandbox

- Can it run the real coding-agent workload: clone, install, test, browser, file edits, logs, cancellation, cleanup?
- What is the startup latency and cost for the expected workload?
- Can outbound Workers enforce secrets and egress policy better than current tool wrappers?
- Can sandbox lifecycle be made product-visible and recoverable?

### Flue

- Can Flue replace the `pi-coding-agent` executor behind `AgentExecutor`?
- Can Flue be driven from a DB-loaded `AgentManifest` rather than static `.flue/agents` files?
- Can Flue sessions/tasks preserve Nochore event, approval, and memory semantics?
- Does Flue's MCP adapter cover the required transports, auth flows, and local server spawning?
- Does its task model map to `AgentTask`, or only to lightweight child sessions?

### Trigger.dev

- Are v4 imports, queues, idempotency, metadata, schedules, and cancellation wired correctly?
- Should parent/child task fan-out use batch APIs once subagents become configurable?
- Which run metadata should be projected into the app versus kept as infrastructure metadata?
- Are waitpoints still the best approval checkpoint primitive?

## Decision Posture

### Flue Executor Status

The Flue executor spike passed against a real model call and the production adapter is now the default executor.

The implementation verifies:

- Nochore-style custom tools can be converted into Flue `ToolDef`s.
- Flue built-in `bash` can be gated by wrapping the `SessionEnv`.
- Flue events can be mapped into Nochore-style run events.
- Flue schema results can replace the current custom `submit_report` retry loop.

The result means Flue is viable as the primary executor behind `AgentExecutor`. It does not mean Flue should become the production orchestrator. `pi-runtime.ts` remains available only as an explicit fallback while real agent runs are validated side-by-side.

### Runtime Platform Decision

Flue has two recommended runtime paths: Node and Cloudflare Agents. Neither should replace Nochore's production runtime yet.

#### Do Not Clean-Move To Flue Node

A clean move to Flue Node would simplify the agent harness, but it would push durable orchestration back onto Nochore.

Nochore would need to rebuild or replace:

- durable run records
- scheduled runs
- approval pause/resume semantics
- child task queueing and fan-in
- product-visible `AgentTask` state
- existing frontend run/task/approval projections

Flue Node is a reasonable hosted agent runtime, but it is not a replacement for the current product runtime.

#### Do Not Clean-Move To Flue Cloudflare Agents Yet

Cloudflare Agents is the most interesting long-term platform direction because it offers an actor model, Durable Object state, SQLite-backed agent memory, wakeups, and WebSocket/state synchronization patterns.

It is still a platform migration, not a harness swap.

Moving now would require redesigning:

- app DB versus Durable Object/D1 ownership
- approval checkpointing
- `AgentTask` orchestration
- dependency compatibility for Composio, Google Ads, filesystem behavior, and Node APIs
- recovery semantics for interrupted LLM calls, tool calls, and sandbox work

Cloudflare Agents should remain a future platform bet. It should not block the nearer Flue executor migration.

#### Stay On Trigger.dev For Orchestration

Trigger.dev should remain the production orchestrator for now.

It already owns the runtime mechanics that matter most to Nochore today:

- durable lead runs
- durable child task execution through `triggerAndWait`
- human approval waitpoints
- retries and max duration
- schedules
- task metadata
- a Node/container execution boundary for real workspace work

This keeps the strongest current architecture intact: product DB owns the durable truth, Trigger owns execution mechanics, and the executor only runs the agent loop.

### Current Implementation

The implementation is intentionally a narrow adapter path, not a platform rewrite:

1. Keep Trigger.dev as the production orchestrator.
2. Keep app DB as the durable source of truth for runs, tasks, approvals, memory, audit, and billing.
3. Use `flue-runtime.ts` behind the existing `AgentExecutor` interface by default.
4. Keep `agent-session.ts` above the executor as the owner of policy, approvals, learned rules, event recording, and task correlation.
5. Use Flue schema results to replace `submit_report`.
6. Gate Flue built-in tools through a wrapped `SessionEnv`.
7. Keep `AgentTask` plus Trigger `triggerAndWait` for durable subagents; do not replace it with Flue `session.task()`.
8. Keep `pi-runtime.ts` only as an explicit fallback with `AGENT_EXECUTOR=pi` until a real agent run passes side-by-side with Flue.

### Compatibility Gate

Before deleting the pi fallback, run the Trigger-runtime smoke task and at least one real side-by-side agent run.

Current state:

- Trigger imports have been modernized to `@trigger.dev/sdk`.
- `trigger.config.ts` now sets `runtime: "node-22"`.
- `flue-runtime-smoke` exists as a manual Trigger task.
- Flue `@flue/sdk@0.4.1` declares Node `>=22.18.0`.

Do not remove the fallback until the smoke task can:

1. import `@flue/sdk`
2. initialize a Flue session
3. run a schema prompt
4. run built-in `bash` through a policy-wrapped `SessionEnv`
5. emit events into Nochore's existing event recorder

If that smoke test fails, the fallback is to set `AGENT_EXECUTOR=pi` and continue hardening the Flue adapter.

The current system does not need a platform restart. It needs the product contract pulled up one layer so runtime frameworks can compete underneath it. The near-term decision is Trigger.dev for orchestration, Flue as the default executor, and Cloudflare Agents as a future platform evaluation.
