# Testing

**Analysis Date:** 2026-03-28

## Test Stack

- The active automated suite is Vitest in `packages/harness/package.json`, executed through `packages/harness/vitest.config.ts`.
- The configured include set is narrow and explicit: `src/db/__tests__/schema-v2.test.ts`, `src/repositories/__tests__/repositories-v2.test.ts`, `src/workspace/__tests__/store-v2.test.ts`, `src/skills/__tests__/prompt-skills.test.ts`, `src/skills/__tests__/executor.test.ts`, `src/policy/__tests__/engine-v2.test.ts`, and `src/pipeline/__tests__/**/*.test.ts`.
- A direct run of `npm --workspace packages/harness test -- --run` passed 5 files and 19 tests in the current tree.

## Coverage Map

- Workspace safety is covered in `packages/harness/src/workspace/__tests__/store.test.ts` and `packages/harness/src/workspace/__tests__/store-v2.test.ts`, including traversal rejection, `.md`-only enforcement, writable-directory checks, recursive listing, and identity loading.
- Policy behavior is covered in `packages/harness/src/policy/__tests__/engine-v2.test.ts`, including disabled tools, blocked approval modes, cooldowns, budget thresholds, global approval escalation, and read-vs-write behavior.
- Repository and persistence behavior is covered in `packages/harness/src/repositories/__tests__/repositories-v2.test.ts` with in-memory SQLite from `packages/harness/src/db/client.ts`, exercising agents, runs, run events, approvals, and lessons.
- Schema persistence is verified in `packages/harness/src/db/__tests__/schema-v2.test.ts`, which writes directly through Drizzle models from `packages/harness/src/db/schema.ts`.
- Skill discovery is covered in `packages/harness/src/skills/__tests__/prompt-skills.test.ts`, including `SKILL.md` parsing, product-only filtering, and knowledge file discovery.
- External integration wrappers are tested with mocks rather than live calls in `packages/harness/src/connections/__tests__/composio.test.ts`.

## Test Style

- Tests use small helper factories and temp fixtures instead of shared global state. Examples include `createTmpWorkspace()` in `packages/harness/src/workspace/__tests__/store.test.ts` and `makeToolConfig()` in `packages/harness/src/policy/__tests__/engine-v2.test.ts`.
- File-system tests use `mkdtemp`, explicit cleanup with `rm`, and per-test isolated directories, as seen in `packages/harness/src/workspace/__tests__/store-v2.test.ts` and `packages/harness/src/skills/__tests__/prompt-skills.test.ts`.
- Database tests use `createTestDb()` from `packages/harness/src/db/client.ts` so they stay deterministic and do not require a real SQLite file on disk.
- Negative cases are asserted with `await expect(...).rejects.toThrow(...)`, while success cases validate hydrated domain objects instead of raw row shapes.
- Mocks are object-level and explicit. `packages/harness/src/connections/__tests__/composio.test.ts` replaces the Composio SDK with `vi.fn()` stubs and never hits a live API.

## Gaps And Workflow Quality

- `apps/web/src` currently has no test files, so UI behavior is not covered by an automated suite in this repo snapshot.
- `packages/harness/vitest.config.ts` includes a pipeline test glob, but no `packages/harness/src/pipeline/__tests__/*.test.ts` files were present in the current tree.
- The root `package.json` does not define a test script; verification is package-scoped, primarily through `packages/harness/package.json`.
- Older files such as `packages/harness/src/db/__tests__/schema.test.ts` and `packages/harness/src/workspace/__tests__/store.test.ts` remain in the tree, but the active Vitest include list in `packages/harness/vitest.config.ts` points at the `*-v2.test.ts` suite for current coverage.

---

*Testing analysis: 2026-03-28*
