# Architecture

**Analysis Date:** 2026-03-28

## Pattern Overview

**Overall:** Workspace-centric monorepo with a thin web shell, a shared harness core, and a background worker layer.

**Key Characteristics:**
- UI and server actions live together in `apps/web/src/`, but business logic is pushed into shared harness modules under `packages/harness/src/`.
- Persistent state is SQLite-backed through Drizzle, with one project database per workspace under `apps/web/data/projects/<projectId>/nochore.db`.
- Run execution is asynchronous: the web app queues work, then Trigger.dev tasks in `services/worker/src/` perform the long-running agent loop.
- The harness owns the typed contracts, policy engine, repository layer, and workspace filesystem access; the web app consumes those primitives rather than reimplementing them.

## Layers

**Presentation Layer:**
- Purpose: Render the app shell, project workspace, and agent detail views.
- Location: `apps/web/src/routes/`, `apps/web/src/components/`
- Contains: TanStack Start routes, page composition, UI components, styling, and client hydration.
- Depends on: `apps/web/src/server/*`, `apps/web/src/lib/*`
- Used by: End users in the browser.

**Web Server Layer:**
- Purpose: Expose server functions for projects, agents, runs, approvals, chat, connections, and onboarding.
- Location: `apps/web/src/server/`
- Contains: `createServerFn` handlers, project-scoped dependency resolution, serialization helpers, and orchestration entry points.
- Depends on: `packages/harness/src/db/*`, `packages/harness/src/repositories/*`, `packages/harness/src/workspace/*`, `packages/harness/src/skills/*`
- Used by: Route loaders/actions and UI events.

**Shared Harness Layer:**
- Purpose: Define the domain model and reusable application logic.
- Location: `packages/harness/src/`
- Contains: Zod types, Drizzle schema/client, repositories, policy evaluation, workspace access, skill selection, and Composio connection helpers.
- Depends on: `ai`, `better-sqlite3`, `drizzle-orm`, `zod`, `@composio/*`
- Used by: `apps/web/src/server/*` and `services/worker/src/*`

**Worker Layer:**
- Purpose: Execute agent runs and scheduled runs outside the request cycle.
- Location: `services/worker/src/`
- Contains: Trigger.dev tasks, agent runtime assembly, Composio session creation, narration helpers, and approval flow coordination.
- Depends on: `packages/harness/src/*`, Trigger.dev SDK, AI SDK providers
- Used by: `trigger.config.ts` task registration.

**Legacy CLI Layer:**
- Purpose: Preserve the older campaign CLI implementation while the platform absorbs its behavior.
- Location: `legacy/src/`
- Contains: Python CLI, analyzers, integrations, reporting, storage, and test suites.
- Depends on: Python tooling in `legacy/pyproject.toml`
- Used by: Direct CLI usage and integration tests.

## Entry Points

**Web App Bootstrap:**
1. Vite starts the client from `apps/web/src/client.tsx`.
2. The router is assembled in `apps/web/src/router.tsx` from the generated route tree.
3. `apps/web/src/routes/__root.tsx` mounts the HTML shell and global stylesheet.
4. `apps/web/src/routes/index.tsx` loads projects and skills, then renders either `SetupWorkspace` or `Homepage`.
5. Project and agent routes extend that shell through `apps/web/src/routes/$projectId.tsx`, `apps/web/src/routes/$projectId.index.tsx`, `apps/web/src/routes/$projectId.agents.$agentId.tsx`, and `apps/web/src/routes/$projectId.agents.new.tsx`.

**Server Function Entry Points:**
1. Route loaders/actions call `createServerFn` handlers in `apps/web/src/server/projects.ts`, `apps/web/src/server/agents.ts`, `apps/web/src/server/chat.ts`, `apps/web/src/server/runs.ts`, `apps/web/src/server/approvals.ts`, `apps/web/src/server/connections.ts`, `apps/web/src/server/skills.ts`, and `apps/web/src/server/onboard-prompt.ts`.
2. Those handlers resolve project-local dependencies through `apps/web/src/server/deps.ts`.
3. Mutations and queued execution flow through `apps/web/src/server/orchestration.ts` and approval resolution helpers in `apps/web/src/server/approvals-core.ts`.

**Worker Entry Points:**
1. Trigger.dev registers tasks from `services/worker/src/triggers/` via `trigger.config.ts`.
2. `services/worker/src/triggers/agent-run.ts` executes the autonomous run loop, including prompt assembly, tool calling, policy checks, approval waits, event logging, and final summaries.
3. `services/worker/src/triggers/scheduled-runs.ts` starts cron-based agent runs by delegating to `agentRunTask`.

## Data Flow

**Project and Agent Lifecycle:**
1. `apps/web/src/server/projects.ts` creates a project directory under `apps/web/data/projects/<projectId>/` and initializes `nochore.db`.
2. `apps/web/src/server/agents.ts` creates agent rows, initializes workspaces with `packages/harness/src/workspace/templates.ts`, and stores agent config in SQLite.
3. Workspace files live under `apps/web/data/projects/<projectId>/agents/<agentId>/`, with `KNOWLEDGE.md` as the durable agent identity file and `scratchpad/` as the writable area.

**Run Execution:**
1. UI actions call `apps/web/src/server/orchestration.ts` or `apps/web/src/server/chat.ts` to queue a run.
2. The web layer records the run and initial events through `packages/harness/src/repositories/`.
3. Trigger.dev invokes `services/worker/src/triggers/agent-run.ts`, which loads the project DB, builds the prompt bundle, and fetches AI tools from Composio.
4. The worker evaluates tool policy through `packages/harness/src/policy/engine.ts`, records events in the run log, and waits for approvals when required.
5. Final summaries and event records are persisted back through the same repository layer.

**Connection Handling:**
1. Connection metadata is stored in the shared schema at `packages/harness/src/db/schema.ts`.
2. The web server reads active connections to validate required providers before launch.
3. The worker uses `packages/harness/src/connections/composio.ts` and `services/worker/src/lib/composio-session.ts` to create the live tool session for the agent.

## Boundaries

- UI code does not talk to SQLite directly; it goes through `apps/web/src/server/*`.
- Business rules such as policy decisions, status schemas, and repository behavior are centralized in `packages/harness/src/*`.
- Workspace file access is path-constrained by `packages/harness/src/workspace/store.ts`; only `.md` files are readable and only `scratchpad/` is writable.
- Human approval is not an ad hoc UI check; it is coordinated through the worker, the run repository, and the approval wait-token flow in `services/worker/src/triggers/agent-run.ts`.
- Composio is the source of truth for runtime tools, while the harness keeps the typed contracts and notification helpers.

## Module Responsibilities

- `packages/harness/src/db/schema.ts` and `packages/harness/src/db/client.ts` define and open the SQLite schema.
- `packages/harness/src/repositories/*` owns read/write access patterns for runs, agents, approvals, events, and lessons.
- `packages/harness/src/types/*` defines the serialized contracts used across web and worker code.
- `packages/harness/src/workspace/*` controls workspace paths and file initialization.
- `packages/harness/src/policy/engine.ts` is the deterministic gate for tool execution.
- `packages/harness/src/skills/*` maps agent skill IDs to prompt material.
- `apps/web/src/server/models.ts` translates raw records into view models for the UI.
- `services/worker/src/lib/agent-runtime.ts` assembles the execution environment and prompt bundle for each run.
