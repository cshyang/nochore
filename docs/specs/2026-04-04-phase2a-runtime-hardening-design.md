# Phase 2A: Coordinated Runtime Hardening

**Date:** 2026-04-04
**Status:** Approved
**Builds on:** Phase 1 coordinated runtime (work_items table, worker-run child task, WorkItemsSection UI)

## Purpose

Harden the Phase 1 coordinated runtime with three targeted improvements: approval-to-work-item correlation, explicit coordinator status, and token cost tracking.

## 1. work_item_id on approvals table

### Problem

Approvals created by child workers carry `workItemId` in event payloads but not as a queryable column. Answering "which work item triggered this approval?" requires scanning event JSON.

### Design

- Add nullable `work_item_id TEXT` column to the `approvals` table
- Use additive migration via `migrateAddColumns()` — no schema version bump, preserves existing data
- Add optional `workItemId` field to `ApprovalRecord` type and `CreateApprovalInput`
- `handleApprovalRequest` already receives `workItemId` — pass it through to `approvalRepository.create()`
- `ApprovalRepository.create()` writes the value when present

### Not included

- Frontend changes — UI already shows approvals at the run level
- Backfill — existing approvals without `workItemId` remain null

### Files

- `packages/harness/src/db/sqlite/schema.ts` — add column to approvals table
- `packages/harness/src/db/sqlite/client.ts` — add to `migrateAddColumns()`
- `packages/harness/src/types/approval.ts` — add optional field
- `packages/harness/src/repositories/approval.ts` — accept and write field

## 2. waiting_for_children run status

### Problem

The parent run stays `"running"` while child tasks execute. The frontend shows a generic spinner. Users can't tell whether the agent is thinking or coordinating children.

### Design

- Add `"waiting_for_children"` to `RunStatusSchema`
- In `agent-run.ts` `spawnSubRunTool.execute`: set status to `"waiting_for_children"` before `workerRunTask.triggerAndWait()`, restore to `"running"` after it returns
- Also call `metadata.set("status", "waiting_for_children")` for Trigger.dev dashboard
- Add to `ACTIVE_RUN_STATUSES` set in `activity-core.ts` (a run waiting for children is still active)
- Add to `mapRunStatus()` in `models.ts`
- In `RunDetail.tsx`: when status is `"waiting_for_children"`, render `RunHeader` + `WorkItemsSection` instead of the generic spinner
- Badge label: "Coordinating" (blue)

### Status transitions

```
running → waiting_for_children (before triggerAndWait)
waiting_for_children → running (after triggerAndWait returns)
running → completed | failed (normal terminal)
```

### Files

- `packages/harness/src/types/run.ts` — add to RunStatusSchema
- `services/worker/src/triggers/agent-run.ts` — set status around triggerAndWait
- `apps/web/src/server/models.ts` — mapRunStatus
- `apps/web/src/server/activity-core.ts` — ACTIVE_RUN_STATUSES
- `apps/web/src/components/RunDetail.tsx` — render coordinating state
- `apps/web/src/components/run-lifecycle.ts` — handle in deriveLiveRunStatus if needed

## 3. Token counting

### Problem

Work items have `inputTokens` and `outputTokens` fields but they're never populated. No visibility into per-worker cost.

### Design

**Accumulation:** In `executePiAgent`, the `turn_end` event already carries `msg.usage` (from the AI SDK). Accumulate `promptTokens` and `completionTokens` across all turns.

**Return:** Add `inputTokens` and `outputTokens` to `PiAgentResult`.

**Storage:** `worker-run.ts` passes token counts to `workItemRepository.complete()`. Add optional `inputTokens`/`outputTokens` params to that method.

**Not included:**
- Parent-run token aggregation (sum of children) — separate concern
- Token budget enforcement — deferred until counting proves useful
- UI display of tokens — the data is available in `SerializedWorkItem` but no UI treatment in this phase

### Files

- `services/worker/src/lib/pi-runtime.ts` — accumulate usage in turn_end, return in result
- `packages/harness/src/repositories/work-item.ts` — accept tokens in complete()
- `services/worker/src/triggers/worker-run.ts` — pass tokens through

## Verification

1. **Type-check:** `npx tsc --noEmit` for harness + web app
2. **Tests:** `npm test` in harness — all existing tests pass
3. **Approval correlation:** Create an approval from a child worker → verify `work_item_id` column is populated
4. **Status transition:** Trigger a run with sub-runs → verify run status goes `running → waiting_for_children → running → completed`
5. **Token counting:** Run a worker → verify `inputTokens`/`outputTokens` are non-null on the work item record
