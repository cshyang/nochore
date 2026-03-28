# Technology Stack

**Analysis Date:** 2026-03-28

## Languages

**Primary:**
- TypeScript / TSX - `apps/web/src`, `packages/harness/src`, and `services/worker/src`

**Secondary:**
- Python 3.9+ - `legacy/src`

## Runtime

**Environment:**
- Node.js for the web app, shared harness, and Trigger.dev worker code in `apps/web/`, `packages/harness/`, and `services/worker/`
- Python runtime for the legacy campaign CLI in `legacy/`

**Package Manager:**
- npm workspaces - root `package-lock.json`, `apps/web/package-lock.json`, and `packages/harness/package-lock.json`
- Lockfile: present

## Frameworks

**Core:**
- TanStack Start / TanStack Router - app shell, file routes, and server functions in `apps/web/src/routes/` and `apps/web/src/server/`
- React 19 - UI layer in `apps/web/src/components/`
- Trigger.dev v3 - durable tasks, cron, realtime auth, and wait tokens in `services/worker/src/triggers/` and `apps/web/src/server/`
- Vercel AI SDK v6 - model calls, streaming chat, tool loops, and structured outputs in `apps/web/src/routes/api.onboard.ts`, `apps/web/src/routes/api.blueprint.ts`, and `services/worker/src/lib/agent-runtime.ts`
- Zod - runtime validation and tool schemas in `packages/harness/src/types/` and the app routes
- Drizzle ORM + better-sqlite3 - SQLite-backed state in `packages/harness/src/db/`

**Testing:**
- Vitest - harness tests in `packages/harness/vitest.config.ts` and `packages/harness/src/**/__tests__/`

**Build/Dev:**
- Vite 7 - frontend build/dev in `apps/web/vite.config.ts`
- TypeScript 5 - strict project config in `apps/web/tsconfig.json` and `packages/harness/tsconfig.json`
- Hatchling - Python packaging in `legacy/pyproject.toml`

## Key Dependencies

**Critical:**
- `ai` and `@ai-sdk/anthropic` - default model provider and streaming/tool orchestration in `services/worker/src/lib/agent-runtime.ts`
- `@ai-sdk/openai-compatible` - adapter for OpenAI-compatible providers (`openai`, `zai`, and `custom`) in `services/worker/src/lib/agent-runtime.ts`, `apps/web/src/routes/api.blueprint.ts`, and `apps/web/src/routes/api.onboard.ts`
- `@composio/core` and `@composio/vercel` - tool execution and OAuth-backed integrations in `packages/harness/src/connections/composio.ts` and `services/worker/src/lib/composio-session.ts`
- `@trigger.dev/sdk` and `@trigger.dev/react-hooks` - task orchestration, scheduling, wait tokens, and live run state in `services/worker/src/triggers/` and `apps/web/src/components/LiveRunView.tsx`
- `drizzle-orm` and `better-sqlite3` - schema, repositories, and project-local SQLite files in `packages/harness/src/db/` and `packages/harness/src/repositories/`

**Infrastructure:**
- `react-markdown` and `remark-gfm` - markdown rendering in the onboarding and report UI in `apps/web/src/components/`
- `@phosphor-icons/react` - iconography in the web UI
- Legacy analytics dependencies: `polars`, `duckdb`, `click`, `rich`, `pyyaml`, `requests`, `facebook-business`, `google-ads`, `google-analytics-data`, `google-api-python-client`, `google-auth`, and `prompt_toolkit` in `legacy/pyproject.toml`

## Configuration

**Environment:**
- LLM provider selection is environment-driven via `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `OPENAI_API_KEY`, `LLM_API_KEY`, and `ZAI_API_KEY` in `services/worker/src/lib/agent-runtime.ts`, `apps/web/src/routes/api.blueprint.ts`, and `apps/web/src/routes/api.onboard.ts`
- Composio is configured with `COMPOSIO_API_KEY` in `packages/harness/src/connections/composio.ts` and `services/worker/src/lib/composio-session.ts`
- Trigger.dev uses `trigger.config.ts` with project id `proj_vmlezgoianzbhanptfog` and tasks under `services/worker/src/triggers/`
- Legacy API access uses `META_ACCESS_TOKEN`, `META_BUSINESS_ID`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_REFRESH_TOKEN`, and `GOOGLE_APPLICATION_CREDENTIALS` in `legacy/src/credentials.py`

**Build:**
- Frontend build config: `apps/web/vite.config.ts`
- Frontend TS config: `apps/web/tsconfig.json`
- Harness TS and test config: `packages/harness/tsconfig.json` and `packages/harness/vitest.config.ts`
- Trigger runtime config: `trigger.config.ts`
- Python package metadata: `legacy/pyproject.toml`

## Platform Requirements

**Development:**
- Node.js is implied by the repo using modern ES modules, React 19, and Vite 7; the codebase does not pin a Node version file
- SQLite databases are created per project on disk by `packages/harness/src/db/client.ts` and workspace paths in `packages/harness/src/workspace/`
- Python tooling is required only for `legacy/`

**Production:**
- Web UI runs as a TanStack Start app
- Background execution runs through Trigger.dev tasks in `services/worker/src/triggers/`
- Legacy analytics automation remains a separate Python CLI in `legacy/`
- No container, deployment, or hosting manifest was detected in the repo root

---

*Stack analysis: 2026-03-28*
