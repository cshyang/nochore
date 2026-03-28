# Structure

**Analysis Date:** 2026-03-28

## Top Level

**Monorepo layout:**
- `apps/` - Product applications.
- `packages/` - Shared TypeScript libraries.
- `services/` - Background workers and task entry points.
- `legacy/` - Older Python CLI and analytics implementation.
- `docs/` - Product, UX, and design plans.
- `scripts/` - Local utilities and experiments.
- `.planning/codebase/` - Mapper outputs for architecture and related analysis.

## Primary Application Areas

**`apps/web/`**
- Purpose: Main TanStack Start web app.
- Entry points: `apps/web/src/client.tsx`, `apps/web/src/router.tsx`, `apps/web/src/routes/__root.tsx`.
- Route structure: `apps/web/src/routes/index.tsx` for the landing page, `apps/web/src/routes/$projectId.tsx` for the project shell, `apps/web/src/routes/$projectId.index.tsx` for the project overview, `apps/web/src/routes/$projectId.agents.$agentId.tsx` for agent detail, and `apps/web/src/routes/$projectId.agents.new.tsx` for agent setup.
- Server bridge: `apps/web/src/server/` contains project, agent, run, approval, chat, skill, connection, and orchestration handlers.
- UI components: `apps/web/src/components/` contains reusable screens and widgets such as `Homepage.tsx`, `ProjectSidebar.tsx`, `AgentDetail.tsx`, `AgentChat.tsx`, `LiveRunView.tsx`, and `SetupWorkspace.tsx`.
- Supporting code: `apps/web/src/lib/colors.ts`, `apps/web/src/lib/types.ts`, and `apps/web/src/styles/global.css`.

**`packages/harness/`**
- Purpose: Shared runtime and domain package.
- Public barrel: `packages/harness/src/index.ts`.
- Domain folders: `packages/harness/src/types/`, `packages/harness/src/db/`, `packages/harness/src/repositories/`, `packages/harness/src/policy/`, `packages/harness/src/skills/`, `packages/harness/src/workspace/`, and `packages/harness/src/connections/`.
- Tests: Each major area has colocated tests under `__tests__/`, including `packages/harness/src/db/__tests__/schema.test.ts`, `packages/harness/src/policy/__tests__/engine-v2.test.ts`, `packages/harness/src/repositories/__tests__/repositories-v2.test.ts`, `packages/harness/src/skills/__tests__/prompt-skills.test.ts`, and `packages/harness/src/workspace/__tests__/store-v2.test.ts`.

**`services/worker/`**
- Purpose: Trigger.dev task runtime.
- Task definitions: `services/worker/src/triggers/agent-run.ts` and `services/worker/src/triggers/scheduled-runs.ts`.
- Runtime helpers: `services/worker/src/lib/agent-runtime.ts`, `services/worker/src/lib/composio-session.ts`, and `services/worker/src/lib/narrate.ts`.
- Root config: `trigger.config.ts` points Trigger.dev at `services/worker/src/triggers`.

**`legacy/`**
- Purpose: Historical Python campaign CLI and supporting analytics code.
- Main entry: `legacy/src/cli/main.py`.
- Subsystems: `legacy/src/cli/`, `legacy/src/analyzers/`, `legacy/src/integrations/`, `legacy/src/reporting/`, `legacy/src/models/`, `legacy/src/tools/`, and `legacy/src/storage/`.
- Tests: `legacy/tests/integration/`.

## Shared Directory Structure

**`apps/web/src/server/`**
- `deps.ts` - project-scoped DB and repository composition.
- `projects.ts` - project creation, deletion, and loading.
- `agents.ts` - agent CRUD, launch, and workspace initialization.
- `runs.ts` - run retrieval and serialization.
- `approvals.ts` and `approvals-core.ts` - approval workflows.
- `chat.ts` - chat-triggered run queuing.
- `connections.ts` - connection lifecycle.
- `skills.ts` - skill catalog loading.
- `models.ts` - converts raw records to view models.
- `orchestration.ts` - run scheduling and approval resolution.
- `serializable.ts` - JSON-safe response helpers.

**`packages/harness/src/`**
- `types/` - Zod contracts for agent config, run state, approval state, and policy decisions.
- `db/` - SQLite schema and client factory.
- `repositories/` - persistence classes for agents, approvals, events, lessons, and runs.
- `workspace/` - workspace path helpers, initialization, and controlled file access.
- `policy/` - deterministic policy evaluation.
- `skills/` - prompt skill registry and selectors.
- `connections/` - Composio integration and connection abstractions.

**`services/worker/src/`**
- `triggers/` - queued and scheduled Trigger.dev tasks.
- `lib/` - runtime assembly, tool-session creation, and event narration.

## Runtime Layout

**Web runtime:**
- Browser bootstraps through `apps/web/src/client.tsx`.
- TanStack routes are generated into `apps/web/src/routeTree.gen.ts`.
- Global styling is loaded from `apps/web/src/styles/global.css`.

**Per-project data layout:**
- Project root: `apps/web/data/projects/<projectId>/`
- Database: `apps/web/data/projects/<projectId>/nochore.db`
- Agent workspaces: `apps/web/data/projects/<projectId>/agents/<agentId>/`
- Writable agent area: `apps/web/data/projects/<projectId>/agents/<agentId>/scratchpad/`
- Durable workspace identity: `apps/web/data/projects/<projectId>/agents/<agentId>/KNOWLEDGE.md`

## Important File Pairs

- Web route shell and root client: `apps/web/src/routes/__root.tsx`, `apps/web/src/client.tsx`
- Project loading and agent loading: `apps/web/src/server/projects.ts`, `apps/web/src/server/agents.ts`
- Shared data contracts and DB schema: `packages/harness/src/types/index.ts`, `packages/harness/src/db/schema.ts`
- Persistence layer and app composition: `packages/harness/src/repositories/index.ts`, `apps/web/src/server/deps.ts`
- Worker task registration and execution runtime: `trigger.config.ts`, `services/worker/src/triggers/agent-run.ts`
- Workspace filesystem rules: `packages/harness/src/workspace/store.ts`, `packages/harness/src/workspace/paths.ts`
