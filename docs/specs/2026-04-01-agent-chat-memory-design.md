# Agent Chat Memory Design

**Date:** 2026-04-01
**Status:** Draft
**Builds on:** current agent detail page, stateless chat endpoint, lessons/run history persistence

## Why This Document Exists

The current agent chat on `/$projectId/agents/$agentId?tab=chat` is useful in the moment but forgets the relationship on refresh. There is no durable thread, no transcript persistence, and no compacted continuity layer. The separate Memory tab is still placeholder copy.

At the same time, the platform already has the beginnings of a deeper memory story:

- runs, findings, approvals, lessons, and learned rules are persisted in the harness DB
- chat can query recent findings and lessons via `review_findings`
- product direction wants the same agent to eventually be reachable from web, Slack, and Telegram

This creates a mismatch. The product promises an agent relationship, but the chat experience behaves like a disposable request surface.

This document defines the first durable memory model for agent chat:

- one primary relationship thread per agent
- append-only conversation history
- checkpoint-based compaction for long threads
- durable memory that accumulates from runs and broad conversation
- a normalized gateway that can absorb future channels without redesigning the model

## Core Thesis

**One ongoing relationship on the surface, multiple context layers underneath.**

The user should feel that the agent remembers the relationship and remembers what it learned from past runs. That does not require exposing sessions as a primary UI concept in v1. It does require separating four different concerns that are currently collapsed or missing:

1. **Transcript history** — what was said and done
2. **Compacted context** — what older history means in summary form
3. **Durable memory** — what should carry forward beyond one exchange
4. **Channel/thread routing** — where an interaction belongs when web, Slack, and Telegram all exist

The design goal is not "store more chat." The design goal is "make the agent feel continuous without replaying its whole life every time."

## Product Goals

1. **Relationship continuity** — reopening the chat should feel like returning to the same agent relationship, not starting over.
2. **Run-backed intelligence** — completed runs should reliably flow back into the agent's usable memory.
3. **Fast context loading** — long-running threads must remain usable without replaying full transcripts.
4. **Append-only auditability** — memory may evolve, but canonical history should not be edited in place.
5. **Future channel compatibility** — web, Slack, and Telegram should all be able to feed the same model through a normalization boundary.

## Non-Goals For V1

1. **User-editable memory management** — no memory pinning, rewriting, or manual forgetting UI in v1.
2. **Sessions as a first-class product surface** — investigations and secondary threads may come later, but the main chat stays primary.
3. **File-based manifest as source of truth** — the DB remains operational truth; file mirrors are optional exports or debug artifacts.
4. **Perfect semantic memory extraction** — memory writes can start simple and conservative as long as provenance is preserved.

## Decisions Locked In

### Relationship Model

- The web app defaults to one **primary relationship thread** per agent.
- The user reopens that thread automatically from the Chat tab.
- Future channels can map into the same thread model.

### Sessions / Threads

- In the product surface, sessions are **visible but secondary** at most.
- In the data model, threads are **first-class** because omnichannel routing requires them.
- Future rule:
  - DMs map to the primary relationship thread by default
  - group/channel contexts get their own thread boundary

### Memory Rules

- Completed run outcomes should always be eligible to flow into durable memory.
- Broad conversational memory is allowed by default.
- The agent may append new memory and superseding memory records.
- The canonical manifest/log is append-only and should not be edited in place.
- Users do not manually edit memory in v1.

### Reopen Experience

- Reopening chat should show **recent messages plus a compacted summary of older conversation**.
- The product should not show an infinitely long raw transcript by default.

## Current State In The Codebase

### What Exists

- `apps/web/src/routes/api.agent-chat.ts` streams chat responses with Vercel AI SDK.
- `apps/web/src/components/agent-chat-flow.ts` initializes chat with a greeting and keeps state only in the client session.
- `apps/web/src/components/AgentWorkspace.tsx` renders a placeholder Memory tab rather than a real memory view.
- `packages/harness` persists runs, run events, approvals, lessons, learned rules, and connections.

### Key Gap

The live chat experience is effectively stateless. A refresh loses the thread. The backend also shows signs of an earlier chat persistence model in tests and reset tables, but that model is not the canonical live architecture anymore.

This design does not attempt to revive that older shape directly. It defines the canonical v1 model explicitly so the product does not accumulate a second generation of partial chat persistence hacks.

## Proposed Architecture

The chat system should operate through six layers:

1. **Instruction hierarchy**
   Agent instructions, policy, project context, and workspace context
2. **Canonical conversation event log**
   Every message, tool call, tool output, run completion note, and memory write event
3. **Thread routing**
   Which thread an incoming interaction belongs to
4. **Compaction checkpoints**
   Summaries that replace older transcript windows at read time
5. **Durable memory**
   Structured relationship memory built from runs and conversation
6. **Recent raw context**
   The newest high-fidelity turns that should still be replayed verbatim

These layers solve different problems:

- event log provides auditability
- checkpoints provide token control
- durable memory provides continuity
- routing provides future omnichannel compatibility

## Data Model

### `conversation_threads`

Represents a long-lived logical thread.

Suggested fields:

- `id`
- `agent_id`
- `scope` — `primary`, later `channel`, `investigation`
- `channel_kind` — `web`, later `slack_dm`, `telegram_dm`, `slack_channel`, etc.
- `channel_key` — nullable, external conversation identifier when relevant
- `title`
- `created_at`
- `updated_at`
- `last_message_at`

Rules:

- each agent has exactly one `primary` web relationship thread in v1
- thread creation should be automatic and mostly invisible to the user
- future channels resolve into existing or new threads through this table

### `conversation_events`

Append-only canonical log of interaction events.

Suggested fields:

- `id`
- `thread_id`
- `agent_id`
- `source` — `web`, `run`, `system`, later `slack`, `telegram`
- `role` — `user`, `assistant`, `tool`, `system`
- `event_type` — `message`, `tool_call`, `tool_output`, `run_result`, `checkpoint_marker`, `memory_write`, `memory_superseded`
- `payload` — normalized JSON payload
- `created_at`

Rules:

- no in-place edits
- assistant output is stored after completion
- run completions can be appended as synthetic thread-visible events when useful
- memory changes are recorded as events, not hidden side effects

### `conversation_checkpoints`

Derived summaries used to compact older transcript windows.

Suggested fields:

- `id`
- `thread_id`
- `kind` — `rolling_summary`, later `handoff`, `investigation_close`
- `summary`
- `covers_until_event_id`
- `created_at`

Rules:

- checkpoints are derived, not hand-authored
- a thread may have multiple checkpoints over time
- only the latest relevant checkpoint needs to be injected for most requests

### `memory_records`

Durable relationship memory with provenance and supersession.

Suggested fields:

- `id`
- `agent_id`
- `kind` — `run_outcome`, `fact`, `preference`, `decision`, `lesson`, `relationship_context`
- `content`
- `status` — `active`, `superseded`
- `confidence`
- `source_event_ids`
- `source_run_id`
- `supersedes_memory_id` — nullable
- `created_at`

Rules:

- memory is append-only
- corrections append a new memory record and mark relationship precedence through `supersedes_memory_id`
- nothing rewrites old source events

### Relationship To Existing Tables

Existing persisted concepts should remain usable:

- `runs` and `run_events` continue to hold execution truth
- `lessons` can either remain a specialized memory table or be converged into `memory_records`
- `learned_policy_rules` remain policy artifacts, not general chat memory

The preferred direction is to converge memory-bearing concepts over time rather than creating more unrelated persistence types.

## Input Normalization Gateway

The system should stop treating web chat as the primary conceptual API. Instead, incoming interactions should flow through a normalization boundary:

`incoming source -> normalized conversation input -> thread resolver -> context assembler -> model -> event appenders`

### Why This Exists

This boundary is required for future Slack and Telegram support. Without it, web chat code becomes the implicit contract and every new channel inherits accidental web-specific assumptions.

### Responsibilities

1. Accept channel-specific payloads
2. Normalize them into a shared conversation input shape
3. Resolve or create the correct thread
4. Invoke shared context assembly
5. Append normalized events back into the canonical log

### V1 Scope

In v1 the only active source is `web`, but the gateway should still exist as an explicit layer so the model does not need to change later.

## Read Path

When a chat message arrives, the system should:

1. **Resolve the thread**
   - attach the web chat to the agent's primary relationship thread

2. **Load high-priority instruction context**
   - agent instructions
   - policy
   - relevant workspace/project context

3. **Load the latest checkpoint**
   - inject the newest rolling summary that covers older history

4. **Load recent raw events**
   - replay only the most recent high-fidelity window, for example the last 20-40 turns

5. **Load durable memory**
   - include active run outcomes, lessons, preferences, decisions, and relationship memory

6. **Load relevant run context**
   - include recent high-signal run summaries and findings when relevant to the user query

7. **Generate and stream the answer**

The agent should not reconstruct context by replaying its full transcript. It should reconstruct context from layered state.

## Write Path

For each interaction, the system should append events in order:

1. user message event
2. assistant response event
3. tool call and tool output events, when present
4. synthetic run result events, when a run is triggered or completes
5. memory write events, when the system extracts durable memory

This should happen even when the user-facing response is simple. Silent state mutation without an audit trail should be avoided.

## Compaction Strategy

Compaction is a first-class system, not an optimization afterthought.

### Principles

- compact by **execution window** and **thread progression**, not by day/week alone
- keep canonical raw events
- inject compacted checkpoints at read time
- keep only a recent raw window in the model context

### Triggering

Initial heuristics can be simple:

- create a rolling checkpoint after the thread exceeds a message or token threshold
- refresh the rolling checkpoint after significant events such as run completions or large tool-heavy exchanges

### What Checkpoints Should Contain

- current user goals for this agent relationship
- active ongoing topics
- unresolved questions or commitments
- high-signal facts established in conversation
- references to durable memory already written

### What Checkpoints Should Not Be

- they should not become a second hidden memory store
- they should not replace durable memory records
- they should not be the only copy of important decisions

## Durable Memory Extraction

### Run-Derived Memory

Completed runs should always be eligible to generate durable memory because this is the most trusted operational learning path in the system.

Typical examples:

- findings that remain relevant after the run
- decisions taken by the agent or operator
- patterns observed repeatedly across runs
- stable run outcomes worth carrying into future chats

### Conversation-Derived Memory

Broad conversational memory is allowed in v1, but the extraction system should still be selective enough to avoid writing every casual utterance as durable memory.

Priority categories:

- explicit user preferences
- stable instructions or operating style
- recurring project context
- decisions that affect future behavior
- relationship context that improves follow-up responses

### Mutation Rule

Memory is not edited in place.

If a new memory supersedes an older one:

- append a new `memory_record`
- reference the previous one with `supersedes_memory_id`
- optionally append a `memory_superseded` conversation event for auditability

## User Experience

### Chat Tab

V1 should keep the existing chat surface and avoid introducing visible session management.

Changes:

- reopening the page restores the primary thread
- the visible transcript includes recent messages
- older history is represented through a subtle "earlier conversation summarized" boundary
- the agent should feel like it already knows the relationship and its run history

### Memory Tab

The placeholder should be replaced with a read-only memory dossier.

Initial contents:

- key active memory records
- recent run-derived learnings
- recent relationship-level context the agent is carrying forward

V1 does not need user editing controls, but the tab should prove that memory exists and is grounded in concrete prior behavior.

### Activity / Run Feedback

Run completions should be able to feed the chat and memory system without forcing the user to manually restate what happened.

Examples:

- a completed run can append a `run_result` event into the primary thread
- a follow-up assistant summary can reference that run without requiring the user to ask from scratch

## Implementation Plan Shape

### Phase 1: Persist The Primary Web Relationship

Ship the core continuity loop:

- create/load the primary thread
- persist conversation events
- reload chat state on page open
- continue using current run/history tables

### Phase 2: Add Checkpoints And Run-Backed Memory Injection

Ship actual usable continuity:

- generate rolling checkpoints
- inject checkpoint + recent transcript on read
- write durable memory from runs
- use durable memory in chat context assembly

### Phase 3: Read-Only Memory Dossier

Make the memory system legible:

- replace placeholder Memory tab
- show active memory records and recent run-derived learnings

### Phase 4: Normalize Additional Channels

Future-facing expansion:

- add channel-aware thread resolver inputs
- support DM-to-primary-thread mapping
- support separate thread boundaries for group contexts

## Risks And Failure Modes

### Risk 1: Transcript Persistence Without Real Memory

If the system only restores old messages but does not load checkpoints and durable memory, the product will feel persistent but not truly smarter. This would solve the shallow symptom while missing the core product promise.

### Risk 2: Memory And Compaction Collapse Into One Mechanism

If checkpoints start carrying all long-term knowledge, retrieval becomes brittle and auditability suffers. Compaction and durable memory must remain separate.

### Risk 3: Overexposed Threading UI Too Early

If the UI introduces visible session management before the relationship thread works well, users inherit complexity before they receive continuity.

### Risk 4: Channel Support Built As Web Chat Forks

If Slack or Telegram are added by cloning web-specific logic, the model will fragment and thread routing rules will become impossible to reason about.

## Success Criteria

V1 is successful when:

1. reopening the agent chat clearly continues the prior relationship
2. the agent reliably references accumulated run outcomes when answering
3. long conversations remain fast and coherent through checkpoint-based compaction
4. the architecture has a clear normalization gateway for future channels, even if only web is active today

## Open Questions Deferred

These are intentionally deferred rather than solved prematurely:

- when and how to expose secondary investigations/threads in the UI
- whether `lessons` should be fully merged into `memory_records` or remain a specialized store
- whether file-based memory mirrors should exist for audit/debug/export
- what user-facing provenance detail belongs in the Memory tab

## Recommended First Implementation Slice

The best first slice is not "add sessions UI." It is:

1. persist the primary relationship thread
2. restore it on page open
3. write rolling checkpoints
4. inject run-derived memory into chat context

That slice directly addresses the product goals the user cares about now:

- the chat remembers the relationship
- the agent remembers what it learned from runs

Everything else should earn its way in after that works.
