# External Integrations

**Analysis Date:** 2026-03-28

## Current Platform Integrations

### Composio

- Purpose: unified OAuth + tool execution layer for agent actions and notifications.
- Code paths: `packages/harness/src/connections/composio.ts`, `services/worker/src/lib/composio-session.ts`, and `apps/web/src/server/connections.ts`.
- How it is used: `createComposioClient()` builds a Composio client from `COMPOSIO_API_KEY`, `getSessionTools()` turns a user/toolkit set into AI SDK tools, and the web app creates or polls connections through Composio session APIs.
- Important detail: the app stores only provider-level connection state in SQLite; Composio remains the source of truth for connected accounts and tool execution.
- Evidence: `packages/harness/src/connections/composio.ts`, `apps/web/src/server/connections.ts`, `packages/harness/src/db/schema.ts`.

### Supported Composio Toolkits

- Current catalog support includes `googleads`, `meta`, `slack`, `gmail`, `ga4`, `shopify`, `stripe`, `github`, `googlesearchconsole`, and `tiktok`.
- The catalog is fetched in `apps/web/src/server/connections.ts` and exposed to onboarding / blueprint generation in `apps/web/src/routes/api.onboard.ts` and `apps/web/src/routes/api.blueprint.ts`.
- Notification delivery uses Composio tool slugs `SLACK_SEND_MESSAGE` and `GMAIL_SEND_EMAIL` in `packages/harness/src/connections/composio.ts`.
- Evidence: `apps/web/src/server/connections.ts`, `apps/web/src/routes/api.blueprint.ts`, `apps/web/src/routes/api.onboard.ts`, `packages/harness/src/connections/composio.ts`.

### Anthropic / OpenAI-Compatible LLM Providers

- Purpose: all model calls, blueprint generation, onboarding chat, and worker reasoning.
- Code paths: `services/worker/src/lib/agent-runtime.ts`, `apps/web/src/routes/api.blueprint.ts`, and `apps/web/src/routes/api.onboard.ts`.
- How it is wired: Anthropic is the default provider; OpenAI-compatible wiring is used for `openai`, `zai`, and `custom` via `@ai-sdk/openai-compatible`.
- Config surface: `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `OPENAI_API_KEY`, `LLM_API_KEY`, `ZAI_API_KEY`, and `ANTHROPIC_API_KEY`.
- Evidence: `services/worker/src/lib/agent-runtime.ts`, `apps/web/src/routes/api.blueprint.ts`, `apps/web/src/routes/api.onboard.ts`, `.env`.

### Trigger.dev

- Purpose: durable agent runs, scheduled runs, public realtime tokens, and approval waits.
- Code paths: `trigger.config.ts`, `services/worker/src/triggers/agent-run.ts`, `services/worker/src/triggers/scheduled-runs.ts`, `apps/web/src/server/orchestration.ts`, and `apps/web/src/server/realtime.ts`.
- How it is wired: the web app triggers `agent-run`, schedules `scheduled-agent-run`, issues public run tokens with `auth.createPublicToken()`, and pauses for approvals with `wait.createToken()` / `wait.forToken()`.
- Evidence: `trigger.config.ts`, `services/worker/src/triggers/agent-run.ts`, `services/worker/src/triggers/scheduled-runs.ts`, `apps/web/src/server/orchestration.ts`, `apps/web/src/server/realtime.ts`.

### SQLite / Drizzle

- Purpose: local operational state for projects, agents, runs, approvals, lessons, and connection records.
- Code paths: `packages/harness/src/db/client.ts`, `packages/harness/src/db/schema.ts`, and repository modules under `packages/harness/src/repositories/`.
- How it is wired: `better-sqlite3` opens a project-scoped database file, Drizzle maps the schema, and the web app / worker share the same repository layer.
- Evidence: `packages/harness/src/db/client.ts`, `packages/harness/src/db/schema.ts`, `packages/harness/src/repositories/run.ts`, `apps/web/src/server/deps.ts`.

## Legacy Analytics Integrations

### Google Ads API

- Purpose: campaign performance, search terms, impression share, quality score, conversion actions, and mutation support.
- Code paths: `legacy/src/integrations/google_ads/fetcher.py`, `legacy/src/integrations/google_ads/mutations.py`, and credential checks in `legacy/src/credentials.py`.
- Config surface: `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, and `GOOGLE_ADS_REFRESH_TOKEN`.
- Evidence: `legacy/src/integrations/google_ads/fetcher.py`, `legacy/src/integrations/google_ads/mutations.py`, `legacy/src/credentials.py`, `legacy/config/clients/example.yaml`.

### Meta Ads API

- Purpose: campaign performance plus device and placement breakdowns.
- Code paths: `legacy/src/integrations/meta/fetcher.py` and `legacy/src/credentials.py`.
- Config surface: `META_ACCESS_TOKEN` and `META_BUSINESS_ID`.
- Evidence: `legacy/src/integrations/meta/fetcher.py`, `legacy/src/credentials.py`, `legacy/config/clients/example.yaml`.

### Google Analytics 4

- Purpose: landing-page engagement data and site context.
- Code paths: `legacy/src/integrations/ga4/fetcher.py` and `legacy/src/credentials.py`.
- Config surface: `GOOGLE_APPLICATION_CREDENTIALS` with analytics-readonly scope.
- Evidence: `legacy/src/integrations/ga4/fetcher.py`, `legacy/src/credentials.py`, `legacy/config/clients/example.yaml`.

### Google Search Console

- Purpose: search analytics by query and page.
- Code paths: `legacy/src/integrations/search_console/fetcher.py` and `legacy/src/credentials.py`.
- Config surface: `GOOGLE_APPLICATION_CREDENTIALS` with webmasters-readonly scope.
- Evidence: `legacy/src/integrations/search_console/fetcher.py`, `legacy/src/credentials.py`, `legacy/config/clients/example.yaml`.

## Configuration and Schema Evidence

- Legacy client schemas explicitly expect `sources.google_ads`, `sources.meta`, `sources.ga4`, and `sources.search_console` in `legacy/src/config/clients.py`.
- Example config files show the source/customer/account/property/site identifiers that the legacy stack needs in `legacy/config/defaults.example.yaml` and `legacy/config/clients/example.yaml`.
- The root environment snapshot includes `COMPOSIO_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_ADS_*`, `GOOGLE_APPLICATION_CREDENTIALS`, `META_*`, `LLM_PROVIDER`, `LLM_MODEL`, `LLM_BASE_URL`, `TRIGGER_SECRET_KEY`, `ZAI_API_KEY`, and `PROJECT_ROOT`.
- Evidence: `legacy/src/config/clients.py`, `legacy/config/defaults.example.yaml`, `legacy/config/clients/example.yaml`, `.env`.

---

*Integration analysis: 2026-03-28*
