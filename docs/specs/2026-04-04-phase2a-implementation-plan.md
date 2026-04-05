# Phase 2A: Runtime Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Phase 1 coordinated runtime with approval-to-work-item correlation, explicit coordinator status, and token cost tracking.

**Architecture:** Three independent improvements to existing infrastructure. Each task produces a commit. No new abstractions — extends existing types, schemas, and components.

**Tech Stack:** Drizzle ORM (SQLite), Zod, Trigger.dev SDK, React (TanStack Start)

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/harness/src/db/sqlite/schema.ts` | Modify | Add `workItemId` column to approvals table |
| `packages/harness/src/db/sqlite/client.ts` | Modify | Additive migration for new column |
| `packages/harness/src/types/approval.ts` | Modify | Add optional `workItemId` to `ApprovalRecord` |
| `packages/harness/src/repositories/approval.ts` | Modify | Accept and write `workItemId` in create + hydrate |
| `packages/harness/src/types/run.ts` | Modify | Add `waiting_for_children` to `RunStatusSchema` |
| `services/worker/src/triggers/agent-run.ts` | Modify | Set status around `triggerAndWait` |
| `apps/web/src/server/models.ts` | Modify | Map new run status |
| `apps/web/src/server/activity-core.ts` | Modify | Add to active run statuses |
| `apps/web/src/lib/types.ts` | Modify | Add to `RunStatus` type |
| `apps/web/src/components/RunDetail.tsx` | Modify | Render coordinating state with work items |
| `services/worker/src/lib/pi-runtime.ts` | Modify | Accumulate token usage, return in result |
| `packages/harness/src/repositories/work-item.ts` | Modify | Accept tokens in `complete()` |
| `services/worker/src/triggers/worker-run.ts` | Modify | Pass tokens to work item on completion |

---

### Task 1: Add `work_item_id` column to approvals

**Files:**
- Modify: `packages/harness/src/db/sqlite/schema.ts`
- Modify: `packages/harness/src/db/sqlite/client.ts`
- Modify: `packages/harness/src/types/approval.ts`
- Modify: `packages/harness/src/repositories/approval.ts`
- Modify: `services/worker/src/lib/run-helpers.ts`

- [ ] **Step 1: Add column to Drizzle schema**

In `packages/harness/src/db/sqlite/schema.ts`, add `workItemId` to the `approvals` table definition, after `decisionReason`:

```ts
    workItemId: text("work_item_id"),
```

- [ ] **Step 2: Add additive migration**

In `packages/harness/src/db/sqlite/client.ts`, at the end of `migrateAddColumns()`, after the existing approval column migrations:

```ts
  if (approvalCols.length > 0 && !approvalCols.some((c) => c.name === "work_item_id")) {
    sqlite.exec("ALTER TABLE approvals ADD COLUMN work_item_id TEXT");
  }
```

- [ ] **Step 3: Add field to ApprovalRecord type**

In `packages/harness/src/types/approval.ts`, add to `ApprovalRecordSchema` after `decisionReason`:

```ts
  workItemId: z.string().optional(),
```

- [ ] **Step 4: Update CreateApprovalInput and repository**

In `packages/harness/src/repositories/approval.ts`, add to `CreateApprovalInput`:

```ts
  workItemId?: string;
```

In `ApprovalRepository.create()`, add to `.values()`:

```ts
        workItemId: input.workItemId ?? null,
```

In `toApprovalRecord()`, add to the parsed object:

```ts
    workItemId: row.workItemId ?? undefined,
```

- [ ] **Step 5: Pass workItemId in handleApprovalRequest**

In `services/worker/src/lib/run-helpers.ts`, update the `approvalRepository.create()` call to include `workItemId`:

```ts
  const approvalRecordId = await runtime.approvalRepository.create({
    runId,
    agentId: agent.id,
    approvalId,
    waitTokenId: token.id,
    toolName,
    toolInput,
    requestReason: policyReason,
    createdAt,
    expiresAt,
    workItemId,
  });
```

- [ ] **Step 6: Verify**

Run: `cd packages/harness && npm test`
Expected: 86 tests pass

Run: `npx tsc --noEmit --project packages/harness/tsconfig.json`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add packages/harness/src/db/sqlite/schema.ts packages/harness/src/db/sqlite/client.ts packages/harness/src/types/approval.ts packages/harness/src/repositories/approval.ts services/worker/src/lib/run-helpers.ts
git commit -m "feat: add work_item_id column to approvals table

Enables direct approval-to-work-item queries without scanning
event JSON payloads. Nullable column with additive migration.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add `waiting_for_children` run status

**Files:**
- Modify: `packages/harness/src/types/run.ts`
- Modify: `services/worker/src/triggers/agent-run.ts`
- Modify: `apps/web/src/server/models.ts`
- Modify: `apps/web/src/server/activity-core.ts`
- Modify: `apps/web/src/lib/types.ts`
- Modify: `apps/web/src/components/RunDetail.tsx`

- [ ] **Step 1: Add to RunStatusSchema**

In `packages/harness/src/types/run.ts`, add `"waiting_for_children"` to the enum:

```ts
export const RunStatusSchema = z.enum([
  "queued",
  "running",
  "waiting_for_approval",
  "waiting_for_children",
  "completed",
  "failed",
  "cancelled",
]);
```

- [ ] **Step 2: Set status around triggerAndWait in agent-run.ts**

In `services/worker/src/triggers/agent-run.ts`, inside `spawnSubRunTool.execute`, wrap the `triggerAndWait` call with status transitions:

Before the `try` block (after the `recordEvent` for `sub_run_started`):

```ts
          await runtime.runRepository.markWaitingForChildren(runId);
          metadata.set("status", "waiting_for_children");
```

After the `triggerAndWait` returns (at the start of both the `result.ok` success path and after the `catch`), restore status:

```ts
            await runtime.runRepository.markRunning(runId);
            metadata.set("status", "running");
```

This requires adding a `markWaitingForChildren` method to `RunRepository`.

- [ ] **Step 3: Add markWaitingForChildren to RunRepository**

In `packages/harness/src/repositories/run.ts`, add after `markWaitingForApproval`:

```ts
  async markWaitingForChildren(id: string): Promise<void> {
    this.db.update(runs).set({ status: "waiting_for_children" }).where(eq(runs.id, id)).run();
  }
```

- [ ] **Step 4: Update frontend status mapping**

In `apps/web/src/server/models.ts`, add to `mapRunStatus()`:

```ts
    case "waiting_for_children":
      return "waiting_for_children";
```

Update the `SerializedRun.status` type union to include `"waiting_for_children"`:

```ts
  status: "queued" | "running" | "waiting_for_approval" | "waiting_for_children" | "completed" | "failed" | "cancelled";
```

- [ ] **Step 5: Add to active run statuses**

In `apps/web/src/server/activity-core.ts`, add to `ACTIVE_RUN_STATUSES`:

```ts
const ACTIVE_RUN_STATUSES = new Set<RunStatus>(["queued", "running", "waiting_for_approval", "waiting_for_children"]);
```

- [ ] **Step 6: Update frontend RunStatus type**

In `apps/web/src/lib/types.ts`, find the `RunStatus` type. If it derives from the harness, it picks up automatically. If it's a local string union, add `"waiting_for_children"`.

- [ ] **Step 7: Render coordinating state in RunDetail**

In `apps/web/src/components/RunDetail.tsx`, update the `running || queued` branch to also handle `waiting_for_children` separately. Add a new branch before the existing `running || queued` check:

```tsx
  // ── Coordinating children ──────────────────────────────────────────────
  if (status === "waiting_for_children") {
    return (
      <div style={{ flex: 1, padding: "24px 20px" }}>
        <RunHeader run={run} />
        <WorkItemsSection workItems={run.workItems} />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 20px",
            background: COLORS.accentSubtle,
            border: `1px solid ${COLORS.accentBorder}`,
            borderRadius: RADIUS.sm,
          }}
        >
          <CircleNotch
            size={16}
            weight="bold"
            color={COLORS.accent}
            style={{ animation: "spin 1s linear infinite" }}
          />
          <span style={{ fontSize: TYPE.scale.sm, color: COLORS.textSecondary }}>
            Coordinating specialist work...
          </span>
        </div>
      </div>
    );
  }
```

Also add to the `RunHeader` status badge:

```tsx
    ) : run.status === "waiting_for_children" ? (
      <Badge color="blue">Coordinating</Badge>
```

- [ ] **Step 8: Verify**

Run: `cd packages/harness && npm test`
Expected: 86 tests pass

Run: `npx tsc --noEmit --project packages/harness/tsconfig.json && npx tsc --noEmit --project apps/web/tsconfig.json`
Expected: both clean

- [ ] **Step 9: Commit**

```bash
git add packages/harness/src/types/run.ts packages/harness/src/repositories/run.ts services/worker/src/triggers/agent-run.ts apps/web/src/server/models.ts apps/web/src/server/activity-core.ts apps/web/src/lib/types.ts apps/web/src/components/RunDetail.tsx
git commit -m "feat: add waiting_for_children run status

Parent run transitions to waiting_for_children while child tasks
execute via triggerAndWait. Frontend shows Coordinating badge with
active work items instead of a generic spinner.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Token counting in executePiAgent

**Files:**
- Modify: `services/worker/src/lib/pi-runtime.ts`
- Modify: `packages/harness/src/repositories/work-item.ts`
- Modify: `services/worker/src/triggers/worker-run.ts`

- [ ] **Step 1: Add token fields to PiAgentResult**

In `services/worker/src/lib/pi-runtime.ts`, update the interface:

```ts
export interface PiAgentResult {
  output: string;
  toolCalls: Array<{ toolName: string; timestamp: Date }>;
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
}
```

- [ ] **Step 2: Accumulate tokens in turn_end subscriber**

In `executePiAgent`, add accumulators before the `session.subscribe` call:

```ts
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
```

Inside the `turn_end` handler (the `if (e.type === "turn_end")` block), add token accumulation:

```ts
    if (e.type === "turn_end") {
      const msg = e.message;
      if (msg?.stopReason) {
        lastStopReason = msg.stopReason;
        // Accumulate token usage across turns
        if (msg.usage) {
          totalInputTokens += msg.usage.promptTokens ?? msg.usage.inputTokens ?? 0;
          totalOutputTokens += msg.usage.completionTokens ?? msg.usage.outputTokens ?? 0;
        }
        // ... existing logging ...
      }
    }
```

Note: The AI SDK uses `promptTokens`/`completionTokens` but some providers use `inputTokens`/`outputTokens`. Check both for safety.

- [ ] **Step 3: Return tokens in result**

Update the return statement at the end of `executePiAgent`:

```ts
  return {
    output,
    toolCalls,
    durationMs: Date.now() - start,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
  };
```

- [ ] **Step 4: Update WorkItemRepository.complete() to accept tokens**

In `packages/harness/src/repositories/work-item.ts`, update the `complete` method signature and body:

```ts
  async complete(
    id: string,
    completedAt: Date,
    result?: string,
    tokens?: { inputTokens?: number; outputTokens?: number },
  ): Promise<void> {
    this.db
      .update(workItems)
      .set({
        status: "completed",
        completedAt: completedAt.getTime(),
        result: result ?? null,
        ...(tokens?.inputTokens != null ? { inputTokens: tokens.inputTokens } : {}),
        ...(tokens?.outputTokens != null ? { outputTokens: tokens.outputTokens } : {}),
      })
      .where(eq(workItems.id, id))
      .run();
  }
```

- [ ] **Step 5: Pass tokens from worker-run to work item**

In `services/worker/src/triggers/worker-run.ts`, update the completion call:

```ts
      await runtime.workItemRepository.complete(
        payload.workItemId,
        new Date(),
        result.output,
        { inputTokens: result.inputTokens, outputTokens: result.outputTokens },
      );
```

Also update the `WorkerRunResult` interface:

```ts
export interface WorkerRunResult {
  workItemId: string;
  output: string;
  durationMs: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
}
```

And include tokens in the return:

```ts
      return {
        workItemId: payload.workItemId,
        output: result.output,
        durationMs: result.durationMs,
        toolCallCount: result.toolCalls.length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
```

- [ ] **Step 6: Verify**

Run: `cd packages/harness && npm test`
Expected: 86 tests pass

Run: `npx tsc --noEmit --project packages/harness/tsconfig.json && npx tsc --noEmit --project apps/web/tsconfig.json`
Expected: both clean

- [ ] **Step 7: Commit**

```bash
git add services/worker/src/lib/pi-runtime.ts packages/harness/src/repositories/work-item.ts services/worker/src/triggers/worker-run.ts
git commit -m "feat: capture token usage from AI SDK and store on work items

Accumulate promptTokens/completionTokens across all turns in
executePiAgent. Worker-run task writes totals to the work item
record on completion. Enables per-worker cost visibility.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Verification Summary

After all three tasks:

1. `cd packages/harness && npm test` — 86 tests pass
2. `npx tsc --noEmit --project packages/harness/tsconfig.json` — clean
3. `npx tsc --noEmit --project apps/web/tsconfig.json` — clean
4. Manual: trigger a run with sub-runs → verify `work_item_id` on approval records, `waiting_for_children` status visible in UI with "Coordinating" badge, and `inputTokens`/`outputTokens` populated on completed work items
