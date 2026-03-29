# Agent Chat & Lifecycle Design

**Date:** 2026-03-29
**Status:** Draft (produced from roundtable with UX Advocate + Systems Architect agents)
**Builds on:** 2026-03-27-agent-scaffolding-platform-design.md

## Problem

After onboarding creates an agent, users hit a dead end for evolution. The onboarding flow is conversational ("track my competitors") but post-creation management is form-based (textareas, toggles). Key gaps:

1. **No way to add providers/data sources** — `requiredProviders` is locked at creation
2. **Instructions are raw text** — the shield that translated intent → prompts disappears
3. **No conversational evolution** — scope expansion needs the same intent→config translation as onboarding, but no such flow exists post-creation
4. **Per-tool settings exist in the data model but have no UI** — `approvalMode`, `cooldownMinutes`, `budgetThreshold`

## Core Concept: One Agent, Two Modes

The agent is a **persistent entity** that operates in two modes:

```
┌─────────────────────────────────────┐
│           AGENT IDENTITY            │
│  instructions · skills · tools      │
│  memory · run history · lessons     │
├──────────────┬──────────────────────┤
│  TASK MODE   │     CHAT MODE        │
│  (autonomous)│     (interactive)    │
│  Scheduled   │  Self-config, run    │
│  runs, finds │  triggers, findings  │
│  things,     │  review, scope       │
│  reports     │  expansion           │
└──────────────┴──────────────────────┘
```

Both modes share the same identity, context, and memory. The agent in chat IS the same agent that runs overnight.

## Design Decisions

### 1. Chat vs Settings Boundary

**Rule: if a change requires the agent to reason about it, it goes through chat. If it's a known value in a known field, it goes through the form.**

- **Settings (forms)** — schedule pills, notification toggles, skill toggles, name/description editing. Direct manipulation for known edits.
- **Chat** — scope expansion ("also track LinkedIn"), calibration ("too many false positives"), findings review ("what did you find?"), run triggers ("run now and check pricing").

Both read and write the same source of truth. Changes in one are immediately reflected in the other.

### 2. Self-Modification UX

Every config change proposed through chat follows this protocol:

1. **Always show before and after.** Structured plain-language diff, not raw text diff.
2. **Never apply silently.** Explicit confirmation via `request_input` pattern.
3. **Make it undoable.** Show "Revert" action after applying.

Compound changes (scope + schedule) are broken into separate confirmation blocks.

### 3. First-Time Chat Experience

State-aware contextual greeting, not a canned message:

- **Has runs with findings:** "Your last run completed 2h ago. Ask me about findings or tell me what to change."
- **Has runs, no findings:** "I've run 3 times but haven't found anything actionable yet."
- **Never run:** "I haven't run yet. Want to start my first run?"
- **Draft:** "I'm still being set up. Want to finish configuring me?"

### 4. System Prompt Architecture

**Wrapper approach:** Chat mode wraps the agent's `instructions` in a meta-layer. The `instructions` field stays focused on the agent's actual job. The chat wrapper adds self-awareness, tool descriptions, and conversational behavior. Uses `buildPromptBundle` for the identity core, adds chat-specific context on top.

### 5. Policy Enforcement Across Delegation

**Non-negotiable: policy flows down, never around.** A sub-agent spawned by the dispatcher cannot bypass the parent agent's approval rules, budget caps, or guardrails. Delegation is not an escape hatch from policy.

## Tab Structure

| Before | After |
|--------|-------|
| Activity · Objective · Tools · Chat · Memory | Activity · Chat · Memory · Settings |

- **Activity** — runs, findings, live view (unchanged)
- **Chat** — primary interaction surface
- **Memory** — lessons, cross-run learning (future)
- **Settings** — merged Objective + Tools. Sections: Identity, Instructions, Skills, Specialists (read-only, V0.3), Connections, Notifications

## Roadmap: V0.1 → V0.3

### V0.1: Chat Tab

The agent gains a conversational interface for self-configuration, run triggering, and findings review.

**What the user sees:** A chat tab where they talk to their agent. Same visual language as onboarding (reuses `ConversationMessage`, `OptionCards`).

**V0.1-Alpha (minimum viable):**
- Chat endpoint with `streamText` (modeled on `/api/onboard`)
- `trigger_run` tool only
- Basic message rendering (reuse onboarding components)
- Static contextual greeting

**V0.1-Complete:**
- `review_findings` tool — queries run history, surfaces recent results
- `update_config` tool — modifies instructions + schedule, shows before/after diff via `request_input`, requires confirmation
- Contextual greeting with run-awareness

**Explicitly cut from V0.1:**
- Skills/tool connection mutations (complex, low frequency)
- Run-to-chat deep linking (clicking insight → opens chat with context)
- Chat history persistence across sessions (start stateless)
- Proactive agent messages / notification-to-chat bridge
- Diff revert/undo UI

### V0.2: Ephemeral Sub-Runs

The agent runtime gains the ability to dispatch ad-hoc sub-tasks. Invisible to the user.

**What the user sees:** Same one agent, richer findings, "steps" in the live run view.

**Under the hood:** Dispatcher calls `executePiAgent` with ad-hoc prompt bundles within the same trigger.dev task. No new entity types.

**Infrastructure:**
- `spawn_sub_run` tool exposed to the agent runtime
- `maxSubRuns` policy rule + per-run token budget tracking
- `sub_run_started` / `sub_run_completed` event types
- LiveRunView updated to show sub-run events as steps

### V0.3: Agent Definitions Library (Specialists)

The agent gains access to pre-built specialist definitions from an `.agents/` folder. Same runtime as V0.2, but with reusable agent templates instead of ad-hoc prompts.

**What the user sees:** A read-only "Specialists" section in Settings showing team members (name, role, last activity). Mutations via chat: "Add a LinkedIn specialist to the team."

**Architecture:**
- Agent definitions use extended `SKILL.md` frontmatter (`icon`, `role`, `source: library|custom`)
- `listSubAgentDefinitions()` reads from workspace `agents/` subfolder (parallel to `listPromptSkills`)
- `spawn_sub_agent` tool picks from registry, calls `executePiAgent` with definition's prompt bundle
- Chat mutation tools for team management (`add_team_member`, `remove_team_member`) — filesystem writes
- `sub_agent_invoked` / `sub_agent_completed` event types for activity tracking

**Key insight:** V0.2 and V0.3 share the same runtime path (`executePiAgent`). The only difference is where the instructions come from (ad-hoc vs pre-built). They can share infrastructure.

## Capability Spectrum

| Layer | What | Autonomy | Instructions Source |
|-------|------|----------|-------------------|
| **Skill** | Deterministic/LLM data processing | None — inline | Skill definition |
| **V0.2 sub-run** | Ad-hoc ephemeral task | One-shot | Dispatcher writes on the fly |
| **V0.3 specialist** | Pre-built autonomous worker | Reusable | `.agents/` folder definition |

All three use the same execution primitive. One runtime, increasing sophistication.

## Implementation Plan

### Phase 0: Tab Restructure (separate PR)

Mechanical refactor. Merge Objective + Tools into Settings tab. Reorder tabs. No new functionality.

| File | Change |
|------|--------|
| `AgentWorkspace.tsx` | Route to Settings instead of Objective/Tools |
| `agent-workspace-settings.tsx` | Merge sections: Identity, Instructions, Skills, Connections, Notifications |
| `agent-workspace-chrome.tsx` | Update `WorkspaceTabs` to new tab order |
| `agent-workspace.types.ts` | Update `WorkspaceTab` union type |

### Phase 1: V0.1-Alpha — Chat End-to-End

**WS1: Chat API Endpoint**

| Step | File | Work |
|------|------|------|
| 1a | `packages/harness/src/context/` | Extract `buildPromptBundle` from worker so web app can import |
| 1b | **New:** `apps/web/src/server/agent-chat-prompt.ts` | Chat system prompt builder (wraps agent identity + chat tools) |
| 1c | **New:** `apps/web/src/routes/api.agent-chat.ts` | POST handler: `streamText` + `useChat` protocol, `trigger_run` tool |

**WS2: Chat UI (parallel with WS1)**

| Step | File | Work |
|------|------|------|
| 2a | **New:** `apps/web/src/components/agent-chat-flow.ts` | `useChat` hook (clone onboarding flow, change API URL, remove redirect) |
| 2b | **New:** `apps/web/src/components/agent-chat-pane.tsx` | Chat pane (import `ConversationMessage`, `OptionCards` from onboarding) |
| 2c | `AgentWorkspace.tsx` | Replace chat placeholder with real pane |

**WS3: Wire Up (depends on WS1 + WS2)**

| Step | File | Work |
|------|------|------|
| 3a | `$projectId.agents.$agentId.tsx` | Replace `handleAskDeeper` with chat tab navigation |
| 3b | `agent-chat-flow.ts` | Add contextual greeting based on run history |

### Phase 2: V0.1-Complete — Mutation Tools

| Step | Tool | Work |
|------|------|------|
| 4a | `review_findings` | Query `runRepository` + `runEventRepository`, surface recent results |
| 4b | `update_config` | Modify instructions + schedule, show diff via `request_input`, call `updateAgentRecord` |

### Dependency Graph

```
Phase 0 (tab restructure)
    │
    ▼
Phase 1 (alpha chat)
    ├── WS1: API endpoint ──────┐
    ├── WS2: UI component ──────┤
    │                           ▼
    └── WS3: Wire up ───► Alpha ships
                              │
                              ▼
                     Phase 2 (mutation tools)
                              │
                              ▼
                     Phase 3 (V0.2 sub-runs)
                              │
                              ▼
                     Phase 4 (V0.3 specialists)
```

## Anti-Patterns to Avoid

1. **Magic chatbot** — Every action must be as transparent as task mode. Reasoning visible.
2. **Chat replaces all direct manipulation** — Some things are faster as a click. Don't route everything through conversation.
3. **Clippy** — Agent speaks first only when user opens Chat. Never interrupts.
4. **Workflow builder via chat** — Chat modifies strategy (plain language), not conditional logic. Complex policy belongs in structured UI.
5. **Infinite autonomy escalation** — The agent never suggests increasing its own autonomy via chat.
6. **Silent modification** — Never apply config changes without showing diff + getting confirmation.
