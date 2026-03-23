# Agent UX Redesign — No Ceremony, One Surface

**Date:** 2026-03-23
**Status:** Design validated

## Problem

The current flow has 4 context switches: Homepage → Project → "New Agent" button → full-screen SetupWorkspace → "Launch" ceremony → AgentDetail page (blank). Each transition loses context. The "launch" creates a false lifecycle event. The agent detail page is empty after launch. The user feels like their work disappeared.

## Core Principle

**There is no "launch." You create an agent, it exists. You configure it, the configuration is there. You turn on the schedule, it runs.**

Like a spreadsheet — you don't launch a spreadsheet.

## Design

### 1. Project Page — Agent-Centric with Inline Creation

The project page IS the agent list. No sidebar. Agents organized by priority.

```
┌─────────────────────────────────────────────────────┐
│  ← Nochore    Homescape                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✦  What should your next agent do?       ⏎  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  NEEDS ATTENTION                                    │
│  ┌─────────────────────────────────────────────┐    │
│  │ ⚠ Google Ads Optimizer           2 pending  │    │
│  │   Budget waste in 3 campaigns · 12m ago     │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ACTIVE                                             │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✓ Meta Ads Monitor                          │    │
│  │   Auto-handled 5 items · 30m ago            │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  IDLE                                               │
│  ● Content Scheduler — next in 4h                   │
│  ● Competitor Tracker — next tomorrow               │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Priority-driven layout** — not a uniform grid (avoids AI slop card pattern):
- **Needs attention**: Full cards with detail and action count
- **Active/recently ran**: Medium cards with last activity
- **Idle**: Compressed single-line rows
- **No "Drafts" section** — drafts don't exist as a concept anymore

**Input bar at top**: Always visible. Type intent → navigate to agent creation flow (SetupWorkspace). This replaces the "+ New Agent" button.

**Clicking any agent** → navigates to the agent page.

### 2. Agent Creation Flow — Chat Co-Design (Existing SetupWorkspace)

The SetupWorkspace stays as the creation tool. It works well — 2-panel chat + blueprint is the right UX for co-designing an agent.

**What changes:**
- No "Launch agent →" button. Instead: "Create agent →"
- After creation, **immediately navigate to the agent page** (Overview tab) with all settings pre-populated from the blueprint
- The agent page is the same page you'll use forever — no transition, no ceremony
- Schedule defaults to off. User turns it on when ready.

### 3. Agent Page — One Surface, Two Tabs

This is the core of the redesign. One page that serves both "just created" and "running for 6 months."

```
┌─────────────────────────────────────────────────────┐
│  ← Back    Google Ads Optimizer                  💬 │
│            [Overview]  [Activity]                    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  IDENTITY                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │ ✦ Instructions                              │    │
│  │   ┌─────────────────────────────────────┐   │    │
│  │   │ You are a Google Ads optimization   │   │    │
│  │   │ specialist. Your primary mission is │   │    │
│  │   │ to continuously monitor and improve │   │    │
│  │   │ campaign performance by analyzing   │   │    │
│  │   │ search term data, identifying waste │   │    │
│  │   │ and recommending optimizations.     │   │    │
│  │   └─────────────────────────────────────┘   │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ◈ Skills                        1 selected  │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ○ Connections                   Google Ads  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  BEHAVIOR                                           │
│  ┌─────────────────────────────────────────────┐    │
│  │ ◎ Guardrails                      2 rules   │    │
│  ├─────────────────────────────────────────────┤    │
│  │ ◷ Schedule                          Off ○●  │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│  ⚠ Delete agent                                    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

#### Overview Tab (Default)

The agent's identity and configuration. **Always editable.**

- **Instructions** — editable textarea (the agent's system prompt). Default expanded. This is the most important field.
- **Skills** — expandable row, checkboxes for available skills
- **Connections** — expandable row, shows connected providers + OAuth setup
- **Guardrails** — expandable row, auto/ask/block level toggles per rule
- **Schedule** — expandable row with **on/off toggle visible in the header**. When off: agent doesn't run. When on: runs on selected schedule. This IS the "launch" — just a toggle.
- **Delete agent** — bottom of page, subdued

Uses the shared `SettingsCard`, `SettingsRow`, `SectionHeading` components.

#### Activity Tab

What the agent has done. Same as existing AgentWorkspace feed.

- **Empty state** (no runs yet): "No activity yet. Turn on the schedule to start your agent's first run." with a link/button to flip the schedule toggle.
- **With activity**: Three-tier insight cards (Needs input → Auto-handled → FYI)
- Pending approvals appear here with Approve/Dismiss buttons

The empty state is **actionable**, not passive. It tells you what to do next.

#### Chat Drawer

Slide-in from right (existing pattern). One chat surface for both:
- **During creation**: the co-design conversation from SetupWorkspace is preserved and continues here
- **After runs**: ask about results, trigger analysis, refine the agent

Chat history persists. The conversation that created the agent is the same conversation you use to manage it.

#### Header

```
← Back    Agent Name    [Overview]  [Activity]         💬
```

- **Back** — returns to project page
- **Agent name** — editable inline (click to edit)
- **Tabs** — Overview (default), Activity
- **Chat icon** — opens the chat drawer
- No gear icon (Overview IS the settings)
- No status badge (status is implicit in the Schedule toggle and Activity tab)

### 4. Flow Summary

```
Project Page                    Agent Page
┌──────────────┐               ┌──────────────────┐
│ Input bar:   │  type intent  │                  │
│ "What should │ ──────────── →│  SetupWorkspace  │
│  your next   │               │  (chat+blueprint)│
│  agent do?"  │               │                  │
│              │               │  "Create agent"  │
│ Agent list:  │               │       │          │
│ ● Agent A    │← ── ── ── ── │← ─ ─ ─┘          │
│ ● Agent B    │  back         └──────────────────┘
│ ● Agent C ◄──│─ click ─────→┌──────────────────┐
│              │               │  Agent Page      │
└──────────────┘               │  [Overview]      │
                               │  [Activity]  💬  │
                               │                  │
                               │  Same page for:  │
                               │  - just created  │
                               │  - 6 months old  │
                               └──────────────────┘
```

### 5. What Changes from Current Codebase

| Current | New |
|---------|-----|
| `SetupWorkspace` has "Launch agent →" button | "Create agent →" — creates and navigates to agent page |
| Full-screen "Your agent is live" animation | Deleted (already done) |
| `AgentWorkspace` has Settings panel behind gear icon | Overview tab IS the settings, first tab |
| `AgentWorkspace` has separate Monitor/Feed/Chat/Memory/Settings tabs | Two tabs: Overview, Activity. Chat is a drawer. |
| Sidebar navigation on project page | No sidebar. Agent list IS the page. |
| Draft → Live lifecycle states | No drafts. Agents exist or don't. Schedule on/off replaces launch. |
| Agent status: "draft", "live", "paused", "archived" | Simplify to: schedule on/off + operational status (running/idle/attention/error) |
| Homepage → Project page has flat agent list | Priority-driven layout (cards for attention, rows for idle) |

### 6. Implementation Sequence

**Phase 1: Agent page redesign** (highest impact)
1. Refactor `AgentWorkspace` to have Overview + Activity tabs
2. Overview tab = current SettingsPanel content, always visible, always editable
3. Move instructions textarea into Overview (from blueprint)
4. Schedule row gets an on/off toggle in the header
5. Activity tab = current feed
6. Remove gear icon, status badges, Monitor/Memory tabs

**Phase 2: Creation flow update**
1. SetupWorkspace "Launch" → "Create agent" — saves config + navigates to agent page
2. Agent page pre-populates Overview from blueprint data
3. Remove draft/live lifecycle — `status` column becomes just operational state
4. Chat history from creation persists into the agent's chat drawer

**Phase 3: Project page redesign**
1. Remove sidebar
2. Add input bar at top
3. Priority-driven agent layout (cards for attention, rows for idle)
4. Input bar navigates to SetupWorkspace (or inline creation later)

### 7. What We're NOT Doing

- **Not merging SetupWorkspace into the agent page** — the 2-panel chat co-design is a good creation UX. It stays as a focused flow. But it's a creation tool, not a lifecycle boundary.
- **Not building inline creation on the project page** — the input bar navigates to SetupWorkspace. Inline creation can come later if the pattern proves too heavy.
- **Not redesigning the chat system** — the existing chat drawer pattern works. We just make sure creation chat persists.
- **Not adding OAuth flow yet** — connections show as "needs setup" in Overview, linked to the existing ProjectConnections page.
