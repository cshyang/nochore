# Agent UX Redesign: Setup Flow, Workspace & Real Data

**Date:** 2026-03-22
**Status:** Design complete, pending implementation

---

## Problem Statement

The current UX has three issues:

1. **SetupFlow isn't intuitive.** It's a multi-phase wizard (brief → loading → clarify → review → launch) that dumps configuration in one big review screen. It should feel like briefing a colleague, not filling out a form.

2. **No visual polish.** Inconsistent spacing, 11px font sizes violating the 12px minimum, weak loading states, generic empty states.

3. **Mock data everywhere.** Frontend types (`Agent`, `Project`) use fabricated fields (confidence, lessons count, statusText) that don't map to the real DB schema.

## Benchmark

**Relay.app** — 3-panel layout where you chat with AI on the left, the artifact builds in the middle, and configuration details appear on the right. Minimal, purposeful, no clutter.

We adapt this for agents (not workflows): the artifact being built is an agent spec, not a step sequence.

## Design Decisions

### 1. Two Screens, Not One Unified Workspace

A prior iteration proposed unifying setup and monitoring into one 3-panel workspace. Expert critique identified this as a false unification:

- **Setup is a one-time authoring task.** The user is making decisions, building something.
- **Monitoring is a daily glancing task.** The user wants signals, not configuration.

Optimizing the layout for both equally means neither is great. **Separate them.**

### 2. Two Panels, Not Three

The third panel (detail config) doesn't earn its screen real estate. Agent config is simple — toggling skills, picking schedules, setting policy levels. These expand inline as accordions. No dedicated panel needed.

### 3. Chat Is On-Demand in the Workspace, Not Permanent

During setup: chat is the primary input (left panel, always visible).
After launch: chat is a slide-out drawer triggered by a button. The feed gets full width for the daily check-in use case. A marketing manager between meetings wants to glance, not type.

### 4. No Streaming Block Animation

Blocks don't animate in one-by-one as the LLM generates them. The LLM produces the complete blueprint after 2-3 chat exchanges, then the blueprint renders all at once as a reviewable, editable summary. The magic is the understanding, not the animation of understanding.

### 5. No Skeleton Blocks on Empty State

Showing empty "Policies" and "Connections" blocks before the user has typed anything is form-anxiety in disguise. Start with a clean empty state — "Your agent will appear here as we talk." Structure emerges from conversation.

### 6. Future-Proof for Workflows

The vertical block layout in the blueprint (Skills, Connections, Policies, Schedule) uses discrete blocks without sequence numbers or arrows. If we later move toward user-configurable workflow steps, these blocks can evolve to become ordered steps with drag handles and connectors — without a full redesign.

---

## Screen 1: Setup Flow — "Briefing Your Agent"

Full-screen experience. No sidebar. Focused on creation.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ✦ Nochore          Creating agent for Acme Corp          ✕     │
├──────────────────────────┬───────────────────────────────────────┤
│                          │                                       │
│   CHAT PANEL             │   BLUEPRINT PANEL                     │
│   ~40% width             │   ~60% width                          │
│                          │                                       │
│   Streaming conversation │   Empty state → complete blueprint    │
│   with the AI.           │   after 2-3 exchanges.               │
│                          │                                       │
│   Templates appear as    │   Blocks: Identity, Skills,           │
│   quick-start chips      │   Connections, Policies, Schedule.    │
│   below the input.       │                                       │
│                          │   Each block is directly editable     │
│                          │   (click to toggle, expand inline).   │
│                          │                                       │
│   ┌──────────────────┐   │                                       │
│   │ Message...    ↑  │   │              [ Launch agent → ]       │
│   └──────────────────┘   │                                       │
├──────────────────────────┴───────────────────────────────────────┤
```

### Empty State (before any chat)

```
┌──────────────────────────┬───────────────────────────────────────┤
│                          │                                       │
│   ✦ What should this     │           ✦                           │
│     agent keep an        │                                       │
│     eye on?              │   Your agent will appear here         │
│                          │   as we talk.                         │
│                          │                                       │
│   ┌──────────────────┐   │                                       │
│   │ Message...    ↑  │   │                                       │
│   └──────────────────┘   │                                       │
│                          │                                       │
│   Or start from:         │                                       │
│   [Ad Monitor] [E-comm]  │                                       │
│   [Content] [Competitor] │                                       │
├──────────────────────────┴───────────────────────────────────────┤
```

### Blueprint State (after LLM generates config)

```
┌──────────────────────────┬───────────────────────────────────────┤
│                          │                                       │
│   Chat history showing   │   Ad Spend Guardian                   │
│   2-3 exchanges...       │   Monitor Google Ads for search term  │
│                          │   waste and budget inefficiencies     │
│   ✦ Here's your agent    │                                       │
│     blueprint. Review    │   SKILLS ──────────────── 2 selected  │
│     everything on the    │   ┌───────────────────────────────┐   │
│     right — click any    │   │ ✓ Search Term Analysis        │   │
│     section to adjust.   │   │ ✓ Budget Allocation           │   │
│                          │   │ ○ Trend Forecasting           │   │
│                          │   └───────────────────────────────┘   │
│                          │                                       │
│                          │   CONNECTIONS ─────────── 1 needed    │
│                          │   ┌───────────────────────────────┐   │
│                          │   │ Google Ads     Connect →      │   │
│                          │   └───────────────────────────────┘   │
│                          │                                       │
│                          │   POLICIES ──────────────── 2 rules   │
│                          │   ┌───────────────────────────────┐   │
│                          │   │ Wasteful search terms         │   │
│                          │   │ ◉ Auto  ○ Ask  ○ Notify      │   │
│                          │   │ Budget changes                │   │
│                          │   │ ○ Auto  ◉ Ask  ○ Notify      │   │
│                          │   └───────────────────────────────┘   │
│                          │                                       │
│                          │   SCHEDULE ──────────────────────────  │
│                          │   [Hourly] [6h] [Daily] [Weekly]      │
│                          │                                       │
│   ┌──────────────────┐   │              [ Launch agent → ]       │
│   │ Message...    ↑  │   │                                       │
│   └──────────────────┘   │                                       │
├──────────────────────────┴───────────────────────────────────────┤
```

### Interaction Model

- **Chat is for intent.** User describes what they want. LLM understands, generates blueprint.
- **Direct manipulation is for fine-tuning.** Click skills to toggle, click policy radios, click schedule segments. No need to chat for adjustments.
- **Refinement via chat works too.** "Remove the trend skill" or "make it run daily" — blueprint updates.
- **Templates are chat shortcuts.** Clicking "Ad Monitor" sends that intent as a message.
- **"Launch agent →" only appears when blueprint is complete.**
- **Connections show "Connect →" buttons** that open OAuth flows. Can be deferred ("After launch" badge).

---

## Screen 2: Agent Workspace — "Checking In"

Where the user spends 95% of their time. Full-width feed, no permanent chat panel.

### Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  ← Acme Corp                                                    │
├────────┬─────────────────────────────────────────────────────────┤
│        │                                                         │
│ SIDEBAR│   AGENT HEADER                                          │
│        │   Name, description, status, ⚙ settings, 💬 chat       │
│ Agent  │                                                         │
│ list   │   STATUS BAR                                            │
│ with   │   🟢 Running · Last run 2h ago · Next in 3h 58m        │
│ status │                                                         │
│ dots   │   ACTIVITY FEED                                         │
│        │   Three-tier insight cards:                              │
│ + New  │   · Yellow: Needs your input (approval actions)         │
│   agent│   · Green: Auto-handled (with undo)                     │
│        │   · Gray: FYI (summary, no action needed)               │
│        │                                                         │
└────────┴─────────────────────────────────────────────────────────┘
```

### Feed as Primary View

No tabs. The feed IS the agent view. Three-tier insight cards from `ux-moments.md`:

**Needs Input (yellow):**
- Left border yellow
- Shows: finding, recommendation, reasoning ("Why"), policy reference
- Actions: [Approve] [Modify] [Dismiss]
- Clicking "Tell me more" opens the chat drawer

**Auto-Handled (green):**
- Left border green
- Shows: what was done, summary of impact
- Actions: [Undo] [View all]

**FYI (gray/subtle):**
- No colored border
- Shows: summary text
- Actions: [View full report]

### Chat Drawer

Triggered by the 💬 icon in the agent header. Slides in from the right (~400px). Feed stays visible but dimmed behind it.

```
┌────────┬──────────────────────────┬──────────────────────────────┐
│        │                          │                              │
│ SIDEBAR│   FEED (dimmed)          │   CHAT DRAWER    ✕           │
│        │                          │                              │
│        │                          │   ✦ What would you like      │
│        │                          │     to know?                 │
│        │                          │                              │
│        │                          │   Quick actions:             │
│        │                          │   · Explain last run         │
│        │                          │   · What should I review?    │
│        │                          │   · Run analysis now         │
│        │                          │                              │
│        │                          │   ┌──────────────────────┐   │
│        │                          │   │ Message...        ↑  │   │
│        │                          │   └──────────────────────┘   │
└────────┴──────────────────────────┴──────────────────────────────┘
```

- Quick actions change based on context (post-run vs idle)
- Chat is scoped to this agent's context (runs, memory, data)
- Closing the drawer returns full width to the feed

### Settings Panel

Triggered by the ⚙ icon. Full-page view (replaces feed content, back button to return).

Same block layout as the setup blueprint — Identity, Skills, Connections, Policies, Schedule — each expandable inline. Plus a danger zone (pause agent, delete agent).

Changes save immediately. No "save" button.

---

## Screen 0: Homepage & ProjectHome Updates

### Homepage

- Replace mock `Project` type with real `ProjectView`
- Fix all `fontSize: 11` to `fontSize: 12` minimum
- Align spacing to 8px grid (replace 14px → 12px or 16px, 28px → 24px or 32px, etc.)
- Agent mini-list in each project card shows real status computed from pending actions

### ProjectHome

- Replace mock `Agent` type with real `AgentView`
- Agent cards show real data: skill count from config, last run time from runs table, status computed from pending actions
- Empty state guides action: "Create your first agent to start monitoring"
- "Add agent" card navigates to setup flow

---

## Data Layer: Mock → Real

### Current Mock Types (to remove)

```ts
interface Agent {
  id: string;
  name: string;
  status: "attention" | "running";
  statusText: string;          // fabricated
  lastRun: string;             // fabricated
  skills: number;              // fabricated
  lessons: number;             // fabricated
  confidence: number;          // fabricated
  domain?: string;             // fabricated
}

interface Project {
  id: string;
  name: string;
  icon: string;
  color: string;
  sharedTools: string[];       // fabricated
  agents: Agent[];
  attentionCount: number;      // fabricated
}
```

### New Types (from real DB)

```ts
interface AgentView {
  id: string;
  name: string;                    // from agents.config JSON
  description: string;             // from agents.config JSON
  intent: string;                  // from agents.config JSON
  skills: string[];                // from agents.config JSON (skill IDs)
  schedule: string;                // from agents.config JSON
  policyRules: string[];           // from agents.config JSON
  status: "running" | "attention" | "idle" | "error";  // computed
  lastRunAt: number | null;        // from runs.completedAt
  lastRunRelative: string | null;  // computed ("2h ago")
  nextRunAt: number | null;        // computed from schedule
  pendingCount: number;            // COUNT pending_actions WHERE status = "pending"
  lessonCount: number;             // COUNT lessons
  runCount: number;                // COUNT runs
  createdAt: number;
}

interface ProjectView {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  agents: AgentView[];
  connectionCount: number;         // COUNT connections WHERE status = "active"
  attentionCount: number;          // SUM agents where pendingCount > 0
  createdAt: number;
}
```

### Server Function Changes

**`server/agents.ts`** — `getAgent()` and `listAgents()` join against runs, lessons, and pending_actions tables to compute AgentView fields.

**`server/projects.ts`** — `getProject()` and `listProjects()` aggregate AgentView data per project.

---

## Visual Polish Checklist

- [ ] All font sizes >= 12px (fix 11px occurrences)
- [ ] All spacing aligned to 8px scale (4, 8, 12, 16, 24, 32, 48, 64)
- [ ] Loading states with contextual messages ("Understanding your intent..." → "Building blueprint...")
- [ ] Empty states that guide action ("No runs yet — your agent will check in at 3:00 PM")
- [ ] Insight cards with proper three-tier color treatment (yellow/green/gray left border)
- [ ] Chat drawer slides in at 0.15s ease, feed dims behind
- [ ] Settings saves immediately, no save button
- [ ] Responsive: below 1024px, sidebar collapses; below 768px, single column
- [ ] All transitions use 0.15s ease (per .impeccable.md)
- [ ] Respect prefers-reduced-motion

---

## Implementation Order

1. **Data layer** — New types, server functions returning real computed data
2. **AgentWorkspace** — Feed-first view with chat drawer and settings (daily-use screen)
3. **SetupWorkspace** — Chat + emerging blueprint (creation screen)
4. **Homepage/ProjectHome** — Wire to real data, fix spacing/fonts
5. **Polish pass** — Loading states, empty states, animations, responsive

---

## What This Design Kills

- `SetupFlow.tsx` → replaced by `SetupWorkspace.tsx`
- `AgentDetail.tsx` → replaced by `AgentWorkspace.tsx`
- 5-tab bar (Monitor/Feed/Chat/Memory/Settings) → dissolved into feed + drawer + settings
- Mock `Agent` and `Project` types → replaced by `AgentView` and `ProjectView`
- Blueprint/Activity mode toggle → separate screens instead
- Skeleton ghost blocks → clean empty state
- Streaming block animation → complete blueprint render

## What This Design Preserves

- `generateBlueprint()` server function — still powers the setup flow
- `handleChat()` from harness — powers the chat drawer
- Three-tier insight card pattern from `ux-moments.md`
- Dark theme, purple accent, Raycast/Arc energy from `.impeccable.md`
- Navigation: Homepage (lobby, no sidebar) → Project (sidebar appears) → Agent
- Sidebar agent list with status dots
- Policy framed as autonomy decisions, not settings
