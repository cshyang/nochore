# Chat Tab Redesign

**Date:** 2026-05-14
**Status:** Draft
**Builds on:** `2026-04-01-agent-chat-memory-design.md`, `2026-03-29-agent-chat-lifecycle-design.md`

## Why This Document Exists

Chat has become the first-class way users interact with an agent — briefing it on what to investigate, asking questions about findings, and approving proposed actions. The current chat tab (`apps/web/src/components/agent-chat-pane.tsx`) treats chat like one feature among four equal tabs, and its layout reflects that:

- Thread rail (~25% width) competes with the chat for visual weight.
- Chat content sits in a narrow center column with ~40% of horizontal space wasted as a right gutter.
- Empty threads show a blank canvas with no affordance to start a briefing.
- Run output, approvals, and conversation share the column without a clear hierarchy.

This redesign treats chat as the primary surface for the agent relationship. The job-to-be-done is **briefing and triggering** — users open chat to start work, not to browse history.

## Core Thesis

**Make the chat column the page. Demote everything else (thread rail, status, controls) to ambient support.**

The composition mirrors the chat-first energy of tools like Codex: a centered conversation column with generous reading width, a hero empty state that helps users start a briefing, and run output that flows back into the conversation as scannable cards.

## Locked Decisions

### 1. Composition: header dropdown, centered chat column, floating right island

**No left thread rail.** Threads live in a `Main chat ▾` dropdown picker in the page header, next to the agent name. Clicking opens a flyout showing thread titles + relative timestamps + a `+ New thread` action; selecting closes the flyout.

**Chat column flexes** in the remaining horizontal space, capping message content at `max-width: 560px` (closed-panel state) / `~440px` (expanded-panel state). The chat-content cap keeps reading width readable; the column itself fills available room so the chat input and message gutters always anchor consistently.

**Floating right island** (see section 6 for full details) sits to the right of the chat with 18px gap. It has its own raised surface, 12px radius, and is inset from the page edges — it reads as a peer object, not a sidebar.

**Why not a slim text rail (Codex's actual pattern) for threads?** The chat-memory design already establishes "one primary relationship thread + occasional secondaries." Most users will have 2-5 threads. A permanent rail wastes pixels at low volume; a dropdown scales gracefully and removes the asymmetric left-heavy weight the current layout suffers from.

**Fallback signal:** If usage shows users frequently swap between 10+ threads, a thin text rail can be reintroduced. Not v1.

### 2. Agent messages full-width; user messages bubble-right

**Asymmetric message styling.** User messages render as right-aligned bubbles in periwinkle (`COLORS.accent`), `max-width: 65%`. Agent messages render as full chat-column-width plain text — no bubble, no background.

The asymmetry communicates roles: users ask short questions; the agent responds with substantive content (paragraphs, lists, run cards, code blocks) that needs room to breathe. This is the modern AI chat pattern (Claude, ChatGPT, Gemini) and it suits content density.

Agent messages carry a small green status dot + `Agent · {relative time}` meta line above the content. No avatar — the agent's identity is established by the page header.

### 3. Run output: compact card inside the agent message

When a run completes inside a conversation, the agent message contains:

1. A short prose frame (one sentence): "Pulled last 7d data. CPL is up 12%, driven by three issues:"
2. A **compact run card** with:
   - Title + green status dot + duration + relative time
   - Headline (one-line summary)
   - Findings list (top 3, numbered)
   - `Open full report →` link to the dedicated run report page

The card uses the same `cardRaised` recipe as `AgentCard` (background `#23212C`, hairline top-edge highlight via inset shadow, 8px radius, borderStrong edge). This visually anchors run output as an "object" inside the conversation, not just prose.

**The dedicated Run Report page stays valuable** as the deep-dive surface — the card link drives users there for full context (findings detail, charts, before/after comparisons). The card carries the conversation context; the report carries the audit trail.

### 4. Empty thread: hero + suggestions

When a thread has zero messages, the chat body renders a centered hero:

- Title: **"What should we look at?"** — 20px Satoshi, semibold, centered
- Big input below (~580px wide, 12px radius, prominent send button)
- 4 suggestion cards in a 2×2 grid below the input

Suggestions are **hardcoded per agent skill** for v1 (e.g., Google Ads Optimizer agents see "Why is CPL up this week?", "Find waste in search terms", "Review last week's runs", "Adjust approval rules"). Agent-skill mapping lives in a single config table; suggestion text is plain strings.

**On first message sent**, the hero collapses: input docks to the bottom, conversation begins above. The transition is one position change (no animation required for v1, though it can be added).

**Fallback:** if no skill-specific suggestions exist for an agent, show three generic prompts: "What did you find this week?", "What's running right now?", "Update my agent's instructions."

### 5. Approvals: inline in conversation + scroll-past pill

When the agent requests approval, an approval card renders inline as part of the agent's message — orange-tinted (`COLORS.orangeSubtle` bg, `COLORS.orangeBorder` edge), containing:

- Small `Needs your call` label with pulsing orange dot
- The question ("Pause 'free quotes' broad match keyword?")
- The reason (cost, impact, reversibility)
- Approve / Skip buttons

Approval cards are **part of the conversation history**. After a decision, the card collapses to a small `Approved` / `Skipped` chip with the decision reason in the same message position.

**Scroll-past pill:** if a pending approval scrolls out of view, a sticky `↑ 1 pending approval` pill appears above the input. Tap to scroll to the approval. This handles the "buried in scroll" failure mode without competing with chat for permanent header real-estate.

**Multiple pending approvals in one thread** are stacked inline (each as its own card in the message stream). The pill counter increments; tapping scrolls to the oldest pending. If multi-approval workloads grow common, a future iteration can collect approvals into a thread-level "Pending (3)" chip in the header.

### 6. Right panel: floating connections island with master/detail expansion

A persistent right-hand panel sits to the right of the chat, styled as a **floating island** — its own raised surface with rounded corners, inset from the page edges. It is not an edge-anchored sidebar.

**Closed state (default):**
- Width: **220px**
- Surface: `COLORS.cardRaised` (`#23212C`) with inset top-edge highlight (`inset 0 1px 0 rgba(255,255,255,0.04)`) — same recipe as `AgentCard`
- Border: `1px solid COLORS.borderStrong`
- Border radius: **12px**
- Margin: 18px gap from chat, 18px from page edges
- Content:
  - `CONNECTIONS` label (uppercase, dim, tracking-wide)
  - One row per active connection: 20px logo + provider name + account label + green status dot (or orange if unhealthy)
  - Bottom-anchored `Manage in project →` link separated by a thin internal divider

**Expanded state (after clicking a row):**
- Width: **340px** (transitions over ~220ms ease-out-quart)
- Content swaps to the connection's detail view:
  - 32px logo + provider name + account header, with × close affordance
  - Key/value stats: Status (Healthy / Degraded / Disconnected), Last used, Connected, Routed by
  - Two action buttons: `Reconnect` (primary) and `Open in project` (ghost)
  - Bottom "Other connections" section with collapsed rows so users can swap focus without collapsing first
- Close affordances: × button, ESC key, or clicking the active row again

**Chat column shrinks** when the panel expands; messages re-wrap inside the new available width. No content is hidden; only line breaks change.

**Responsive behavior:**
- Viewports ≥1100px: push-shrink behavior as described above
- Viewports <1100px: expanded state slides over chat as a drawer (right-anchored, ~340px) rather than pushing it, so chat doesn't get crushed
- Viewports <768px: panel collapses to a floating "Connections" chip in the header; tap opens a full-screen drawer

**Why connections specifically?** Pushback considered: connections are static info and already shown on the project page. The right panel earns its keep by:
- Surfacing **status** at a glance (green/orange dot) — users notice broken connections without leaving chat
- Providing **quick reconnect** without context-switching to the project page
- Echoing Codex's floating-island aesthetic that the user explicitly referenced

If usage shows the panel is rarely interacted with after first use, the content can pivot to something more dynamic (live activity, recent runs) without changing the island chrome.

## Component Architecture

The redesign keeps the existing data layer (multi-thread persistence, lessons, approvals) and reshapes the presentation layer.

### Components to modify / create

```
apps/web/src/components/
├─ agent-chat-pane.tsx           ← Major rewrite: drop left rail, add hero state, restructure column, slot in island
├─ agent-chat-flow.ts            ← Stays. Chat lifecycle hook unchanged.
├─ chat/                         ← New subdirectory for chat components
│  ├─ ChatHeader.tsx             ← New: agent name + thread picker + status pill + tabs
│  ├─ ThreadPicker.tsx           ← New: dropdown flyout with thread list + "+ New thread"
│  ├─ EmptyThreadHero.tsx        ← New: hero title + suggestion grid + big input
│  ├─ ChatColumn.tsx             ← New: flex chat layout with internal max-width for messages
│  ├─ UserMessage.tsx            ← New: right-aligned periwinkle bubble
│  ├─ AgentMessage.tsx           ← New: full-width prose + child slots (RunCard, ApprovalCard)
│  ├─ RunCard.tsx                ← Extract from current chat pane; align with AgentCard recipe
│  ├─ ApprovalCard.tsx           ← Refactor existing: inline format, decision-resolved state
│  ├─ ScrollPastPill.tsx         ← New: sticky "↑ N pending" pill
│  ├─ ChatInput.tsx              ← Extract from current pane: multi-line, send button, Cmd-Enter
│  ├─ ConnectionsIsland.tsx      ← New: floating right panel, closed/expanded states
│  └─ ConnectionDetail.tsx       ← New: expanded-state content (stats + actions + other-conns)
```

### Component contracts

**`ChatHeader`** — Owns the top strip. Takes `agent`, `activeThread`, `threads`, `onSelectThread`, `onCreateThread`, `status`. Renders agent name + `ThreadPicker` + status pill (idle/running/needs-you) + tabs.

**`ThreadPicker`** — Dropdown flyout. Takes thread list + active thread id + handlers. Internal state: open/closed. Closes on selection.

**`EmptyThreadHero`** — Pure presentation. Takes agent + onSubmit + onSuggestionPick. Renders title, input, and skill-driven suggestion grid.

**`ChatColumn`** — Layout wrapper. Flexes to fill space left of the connections island. Internal `max-width` on message content (560px closed / 440px expanded) keeps reading width readable. Handles scroll behavior, scroll-past pill positioning, autoscroll-to-bottom logic.

**`AgentMessage`** — Full-width agent message container. Children can be plain text, RunCard, ApprovalCard, or any combination. Renders meta line (status dot + "Agent · time") above content.

**`RunCard`** — Self-contained. Takes `runId`, `headline`, `findings[]` (top 3), `duration`, `completedAt`, `onOpenReport`. Reuses `cardRaised` styling for visual continuity with AgentCard.

**`ApprovalCard`** — Two states: `pending` and `resolved`. Pending shows full card with buttons; resolved collapses to a labeled chip. Takes `approval` + `onApprove(reason)` + `onReject(reason)`.

**`ConnectionsIsland`** — Floating right panel. Takes `connections: ConnectionView[]`, `projectId`. Owns internal state for active (expanded) connection id. Renders closed-state list or expanded-state detail via `ConnectionDetail`. Closes on × / ESC / clicking active row. Animates width transition via CSS (`transition: width 220ms cubic-bezier(0.16, 1, 0.3, 1)`).

**`ConnectionDetail`** — Expanded-state content. Takes `connection`, `otherConnections`, `onClose`, `onReconnect`, `onOpenInProject`. Renders header + stats + actions + "Other connections" list.

### Suggestion source

Suggestion content lives in a single config map:

```ts
// apps/web/src/lib/chat-suggestions.ts
export const SKILL_SUGGESTIONS: Record<string, ChatSuggestion[]> = {
  "google-ads-optimizer": [
    { icon: "📊", title: "Why is CPL up this week?", description: "Diagnose recent change" },
    { icon: "🔍", title: "Find waste in search terms", description: "Scan low-converting keywords" },
    { icon: "📈", title: "Review last week's runs", description: "What did you find recently?" },
    { icon: "⚙️", title: "Adjust approval rules", description: "Update thresholds" },
  ],
  // …per-skill entries
};

export const DEFAULT_SUGGESTIONS: ChatSuggestion[] = [
  { icon: "📰", title: "What did you find this week?", description: "Recent findings review" },
  { icon: "▶️", title: "What's running right now?", description: "Live status" },
  { icon: "⚙️", title: "Update my instructions", description: "Evolve scope or behavior" },
];
```

Lookup is by the agent's primary skill id (first entry in `agent.skills`). If no entry matches, fall back to `DEFAULT_SUGGESTIONS`. Multi-skill agents only consume the first skill's suggestions in v1; per-skill blending can be a follow-up.

## Data Flow

The existing chat flow is unchanged:

```
ChatInput.submit()
  → useAgentChatFlow → POST /api/agent-chat
  → AI SDK stream → parts merge into thread messages
  → Approvals surface from server stream (existing pendingApproval prop)
  → Run completions arrive via activity stream; matched to messages by runId
```

The presentation change is entirely client-side for chat data; server APIs (`getConversationState`, `listConversationThreads`, the chat endpoint, approval handlers) are unchanged.

**Run-card hydration:** when an agent message references a completed run, the chat pane reads run data from the activity stream (already in `runs` prop) and renders the RunCard inline. No new fetch.

**Connections island data:** the existing `listConnections` server function already returns `ConnectionView[]` with `logo`, `providerName`, `status`, `accountLabel`, `connectedAccountId`, `connector`, and `createdAt` — all of which the closed state and expanded detail need. The route-level loader already fetches connections for the project; pass them as a prop to the chat pane. **Open the door for one optional extension:** a `lastUsedAt` timestamp per agent + connection pair, so the detail view's "Last used 4m ago" line is accurate rather than approximated. If that data isn't available in v1, fall back to "Last seen `{relative time}`" derived from the most recent run that consumed the connection.

**Reconnect action:** delegate to the existing Composio reconnect flow (`/$projectId/callback.composio` route). No new endpoint.

## Decisions Inherited / Confirmed

- **"Background run" button removed.** Briefing in chat triggers runs naturally; a separate button is redundant. If users have been using it for "re-run with the same brief," that pattern can be surfaced as a per-message action in a future iteration (e.g., hover on user message → `↻ Re-run`).
- **Memory tab stays as-is.** Lessons surface in chat already (via `episodicLessons` in conversation state); the Memory tab remains the canonical browse/manage surface. Out of scope for this redesign.
- **Tab order: Chat first.** `Chat · Activity · Memory · Settings`. Chat becomes the default tab on agent detail page open.
- **Status pill in header.** `Idle` / `Running` / `Needs you` — color matches state (dim text / green dot / orange dot). Replaces the silent "what's the agent doing" gap.

## Out of Scope (Explicitly Deferred)

- **Slash commands and @mentions in the input.** Plain multi-line text only for v1. YAGNI — users brief in natural language; the data type → tool resolution layer handles mapping briefs to actions.
- **File / screenshot attachments.** Defer until a clear user need surfaces.
- **Auto-generated suggestions from past runs.** Hardcoded per skill for v1; can layer on history-based suggestions later.
- **Mobile-specific layout.** Centered column collapses to full-width on narrow viewports via existing responsive defaults; no dedicated mobile pass in v1.
- **Animated hero → bottom-input transition.** Position change is instant for v1; smooth transition can be a follow-up polish.
- **Thread-level "Pending (N)" chip in header.** Add when multi-approval threads become common.

## Implementation Sequencing (Suggested)

Phasing is for the implementation plan to detail; this is a rough order of value:

1. **Composition shell** — `ChatColumn`, `ChatHeader`, `ThreadPicker`. New layout in place (no left rail, chat flexes), threads accessible. *Largest visible improvement; smallest behavior risk.*
2. **Message styling split** — `UserMessage`, `AgentMessage`. Asymmetric layout. Existing messages reflow into the new shape.
3. **Empty thread hero** — `EmptyThreadHero` + `chat-suggestions.ts` config.
4. **Run card refactor** — `RunCard` extracted, restyled with `cardRaised` recipe.
5. **Approval refactor** — inline format, resolved-state chip, `ScrollPastPill`.
6. **Connections island** — `ConnectionsIsland` + `ConnectionDetail`. Closed-state ships first; expanded state can be a fast-follow if time-boxed.
7. **Status pill in header + tab default.** Polish.

Each step is independently shippable; the chat keeps working between phases.

## Open Questions

None blocking. Items the implementation may surface:

- **Run-card metric formatting** — when the run has a primary metric, should the card show a small sparkline (matching AgentCard) or just a numeric? Default: numeric only; sparkline if data is present.
- **Approval reason field** — current UI accepts a free-text decision reason. Keep, or simplify to optional one-line note?
- **Empty-state suggestions for newly-created agents** — agents in draft/no-runs state may want different suggestions ("Tell me what to optimize" vs. action-oriented).

These can be resolved during implementation.

## Verification

A working implementation should pass these acceptance checks:

1. Opening a fresh thread shows the hero state with title, input, and ≥3 suggestion cards.
2. Sending a first message collapses the hero — input docks to bottom, message appears in conversation.
3. Selecting another thread via the header picker swaps the conversation without page reload.
4. A completed run's findings appear as a compact card inside the agent message, with a working `Open full report` link.
5. An incoming approval renders inline; the `Needs you` pill appears when scrolled past.
6. Approving or skipping collapses the approval to a `Approved` / `Skipped` chip in the same message position.
7. The chat column flexes between the page edge and the connections island; message content stays capped at the spec'd widths in both panel states.
8. The connections island renders as a floating card (12px radius, raised surface, 18px gap from chat) — not edge-anchored.
9. Clicking a connection row expands the island from 220px to 340px over ~220ms; chat re-wraps. Clicking × / ESC / the active row collapses it.
10. On viewports <1100px the expanded island slides over chat as a drawer instead of pushing it.
11. No left rail. No "Background run" button in the top-right.
