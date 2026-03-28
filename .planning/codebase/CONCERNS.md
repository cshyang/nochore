# Concerns

**Analysis Date:** 2026-03-28

## Ranked Findings

1. **Legacy analytics/reporting is still a large, coupled subsystem.**  
   **Impact:** High | **Urgency:** High  
   The legacy Python path still concentrates config validation, source sync, analysis, and report rendering in a handful of oversized files: `legacy/src/config/clients.py` (517 LOC), `legacy/src/reporting/internal.py` (570 LOC), `legacy/src/reporting/summary_builder.py` (474 LOC), and `legacy/src/tools/analysis/service.py` (446 LOC). The same module family also repeats schema-ish parsing and normalization in multiple places, which makes behavior drift likely when config or report formats change. This is the highest-risk debt because it sits on the user-facing analytics path and already shows the classic “everything depends on everything” shape.

2. **The worker run loop mixes orchestration, policy, persistence, notifications, and summarization in one task.**  
   **Impact:** High | **Urgency:** High  
   `services/worker/src/triggers/agent-run.ts` (501 LOC) handles run lifecycle, LLM cycles, tool approvals, event emission, approval waiting, notification dispatch, run completion/failure, and lesson creation in a single flow. That makes retries and state transitions hard to reason about, and any change to approval or event semantics risks breaking the core execution path. The pressure point is reinforced by `services/worker/src/lib/agent-runtime.ts`, which also bundles model selection, prompt assembly, provider discovery, and notification policy.

3. **The onboarding and workspace frontend is split across several monolithic files with duplicated logic.**  
   **Impact:** Medium-High | **Urgency:** Medium-High  
   `apps/web/src/components/AgentWorkspace.tsx` (1304 LOC) and `apps/web/src/components/OnboardingChat.tsx` (1046 LOC) are both doing too much locally: view state, normalization, formatting, event scanning, and interaction handling all live in the component body. The duplication extends into `apps/web/src/routes/api.onboard.ts` and `apps/web/src/routes/api.blueprint.ts`, which both define their own model selection and skill/provider resolution logic. This is a maintainability problem now and a bug source later because onboarding behavior can easily diverge between the chat flow and the blueprint flow.

4. **The connections UI is still rendering hardcoded sample data instead of project-backed records.**  
   **Impact:** High | **Urgency:** High  
   `apps/web/src/components/ProjectConnections.tsx` defines a literal `connections` array, static health values, and fake usage metadata, even though `apps/web/src/server/deps.ts` already exposes `listProjectConnections(projectId)`. That means the visible connections tab can drift from actual project state and mislead users about what is connected, healthy, or in use. This is a direct product correctness issue, not just a code-style concern.

5. **The web app still has client/server boundary leakage and manual normalization glue.**  
   **Impact:** Medium | **Urgency:** Medium  
   `apps/web/src/lib/server-stub.ts` exists to neutralize server-only imports that leak into the browser bundle, which is a sign the boundary is not clean enough yet. The route and server layers also repeat manual shape coercion in `apps/web/src/routes/$projectId.agents.$agentId.tsx`, `apps/web/src/routes/index.tsx`, `apps/web/src/server/models.ts`, and `apps/web/src/server/agents.ts`, relying on `any[]`/`unknown` normalization rather than a single typed contract. This is manageable today, but it increases the odds of silent UI regressions when the DB or repository models change.

## Highest-Value Refactor Directions

1. Extract shared onboarding/model/provider utilities so `apps/web/src/routes/api.onboard.ts` and `apps/web/src/routes/api.blueprint.ts` stop reimplementing the same policy.
2. Split `services/worker/src/triggers/agent-run.ts` into smaller orchestration units for approvals, event recording, and summary/lifecycle handling.
3. Replace the hardcoded connection samples in `apps/web/src/components/ProjectConnections.tsx` with real project data from `apps/web/src/server/deps.ts`.
4. Reduce the size of `legacy/src/reporting/internal.py` and `legacy/src/tools/analysis/service.py` by separating parsing, aggregation, and rendering into dedicated modules.
