# Conventions

**Analysis Date:** 2026-03-28

## TypeScript Baseline

- The repo is TypeScript-first. `packages/harness/tsconfig.json` uses `strict: true`, ES2022 targets, bundler module resolution, and a `@/*` alias, while `apps/web/tsconfig.json` uses ES2022, `strictNullChecks: true`, and the `~/*` alias.
- Source code consistently uses ES module syntax, named exports, double quotes, semicolons, and 2-space indentation in the core package files such as `packages/harness/src/workspace/store.ts`, `packages/harness/src/policy/engine.ts`, and `apps/web/src/components/Button.tsx`.
- Runtime-facing values are typically validated with Zod schemas in `packages/harness/src/types/*.ts`, and those schemas are re-exported from `packages/harness/src/types/index.ts` as the public contract surface.

## Module Boundaries

- `packages/harness/src/index.ts` is a barrel export for the harness package. New public types and helpers are surfaced there rather than imported from deep paths by consumers.
- `apps/web/src/routes/*.tsx` owns route composition, `apps/web/src/components/*.tsx` owns reusable UI, and `apps/web/src/server/*.ts` owns TanStack Start server functions.
- Shared design tokens live in `apps/web/src/lib/colors.ts`; components such as `apps/web/src/components/Card.tsx` and `apps/web/src/components/ProjectHome.tsx` consume those tokens directly instead of duplicating color values.

## Data And State Conventions

- The harness uses a clear camelCase-in-code, snake_case-in-DB split. The schema in `packages/harness/src/db/schema.ts` defines snake_case columns, while repository and type layers hydrate them into camelCase objects in files like `packages/harness/src/repositories/run.ts`.
- JSON payloads are usually serialized explicitly before persistence and parsed on read, as seen in `packages/harness/src/repositories/run.ts` and `packages/harness/src/db/__tests__/schema-v2.test.ts`.
- Zod parsing is used as a defensive boundary when reading persisted data back into app objects, especially in repository code and type definitions under `packages/harness/src/types/`.

## Error Handling And Guards

- Guard clauses are preferred over deep branching. `packages/harness/src/workspace/store.ts` validates paths up front, then fails fast with explicit error messages for traversal, absolute paths, null bytes, or non-`.md` files.
- Recoverable absence often returns `null` instead of throwing, such as `WorkspaceStore.readFile()` and `apps/web/src/server/projects.ts` when a project directory or database row is missing.
- External or environment-driven failures are usually wrapped in narrow error messages, for example `packages/harness/src/connections/composio.ts` throws when the provider slug is unknown.
- Some server code self-heals legacy state rather than failing hard. `apps/web/src/server/projects.ts` recreates a missing project row if the directory and DB exist but the row does not.

## UI Conventions

- Web UI is intentionally hand-styled with inline `React.CSSProperties` objects instead of a separate CSS-in-JS library. `apps/web/src/components/Button.tsx`, `apps/web/src/components/Card.tsx`, and `apps/web/src/components/ProjectHome.tsx` are representative.
- Interactive UI uses shared motion constants from `apps/web/src/lib/colors.ts`, local hover handlers, and a small set of reusable primitives such as `Button`, `Card`, and `Badge`.
- Routes use TanStack Router patterns consistently: `createFileRoute`, `Route.useLoaderData()`, and `useNavigate()` as shown in `apps/web/src/routes/index.tsx` and `apps/web/src/routes/$projectId.index.tsx`.

## Comments And Documentation

- Comments are used sparingly and primarily to segment logical blocks or explain invariants. The harness tests in `packages/harness/src/workspace/__tests__/store.test.ts` and `packages/harness/src/connections/__tests__/composio.test.ts` use labeled sections to keep long suites navigable.
- The repo prefers self-describing code and compact helper names over verbose narrative comments.

## Workflow Quality Signals

- The codebase favors small, focused modules over large monoliths. Representative examples are `packages/harness/src/workspace/store.ts`, `packages/harness/src/db/client.ts`, and `apps/web/src/server/projects.ts`.
- The workspace layer centralizes path safety and writable-directory rules in `packages/harness/src/workspace/store.ts`, which is a strong quality boundary for agent file access.
- No dedicated lint or prettier config was detected in the top-level scan (`rg --files` did not surface `.eslintrc*`, `eslint.config.*`, `.prettierrc*`, or `biome.json`), so consistency currently comes from TypeScript strictness, shared conventions, and review discipline.

---

*Conventions analysis: 2026-03-28*
