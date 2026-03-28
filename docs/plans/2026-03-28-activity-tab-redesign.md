# Activity Tab Redesign

**Date:** 2026-03-28
**Status:** Draft
**Supersedes:** Timeline tab in AgentWorkspace

## Problem

The current Timeline tab is a reverse-chronological feed of cards mixing run status, findings, tool calls, approvals, and lessons. Users see "Run completed / Triggered by manual" and don't know what the agent actually did. The value (the agent's findings and reports) is buried in card summaries that truncate content.

## Design

Replace the Timeline tab with an **Activity** tab. The core change: each run produces a **report** (the agent's finding text). The Activity tab shows the selected run's report front and center, with a run rail for navigation.

### Layout

```
┌──────────────────────────────────────────────────────┐
│  Header: Agent name, status badge, [Run now] [⚙]     │
├──────────────────────────────────────────────────────┤
│  [ Activity ]  [ Chat ]  [ Objective ]  [ Tools ]  [ Memory ] │
├────┬─────────────────────────────────────────────────┤
│    │                                                 │
│ ●  │  Report content (full markdown)                 │
│ ●  │                                                 │
│ ●  │  - Headers, tables, lists, code blocks          │
│ ○  │  - Full width, proper typography                │
│    │  - This is the value the agent delivers         │
│    │                                                 │
│    │  When a run is active:                          │
│    │  → LiveRunView streams events here              │
│    │  → Transitions to report on completion          │
│    │                                                 │
│    │  When approval is needed:                       │
│    │  → Approval card appears inline                 │
│    │                                                 │
└────┴─────────────────────────────────────────────────┘
```

### Run Rail (Left)

A thin vertical strip (~48px) showing past runs as dots.

- **Green dot** — completed run
- **Red dot** — failed run
- **Yellow dot** — waiting for approval
- **Purple dot (pulsing)** — currently running
- **Gray dot** — queued

Click a dot to load that run's report into the main area. The latest run is selected by default.

Each dot shows a tooltip on hover: date, trigger type, duration.

The rail scrolls independently if there are many runs.

### Report Area (Center)

The selected run's `finding_recorded` text, rendered as full markdown:
- Headers (h1-h4)
- Tables
- Lists (ordered/unordered)
- Code blocks
- Bold/italic
- Links

If the selected run has no finding (e.g., it failed before producing output), show the error message or a brief status card.

If no runs exist yet, show an empty state: "Run your agent to see results here."

### Active Run State

When a run is in progress, the LiveRunView component replaces the report area:
- Streaming narrated events
- Pulsing "Live" indicator
- Approval buttons inline
- On completion, automatically transitions to the rendered report

### Approvals

When the selected run has a pending approval:
- An approval card appears at the top of the report area
- Shows: tool name, input summary, reason
- Approve/Reject buttons
- The report content (if any so far) appears below

## What Changes

### Files to Modify

- `apps/web/src/components/AgentWorkspace.tsx`
  - Rename "timeline" tab to "activity"
  - Replace `TimelinePanel` with new `ActivityPanel` component
  - `ActivityPanel` contains: `RunRail` (left) + report area (center)
  - Remove `toTimelineItems` function (no longer needed)
  - Remove `TimelineCard` component (replaced by markdown report view)

### New Components

- `apps/web/src/components/RunRail.tsx` — Vertical dot timeline for run navigation
- `apps/web/src/components/RunReport.tsx` — Markdown renderer for a single run's finding

### Dependencies

- Need a markdown renderer. `react-markdown` is already in the root `package.json`. May need to add it to `apps/web/package.json`.

## What Stays the Same

- All other tabs (Chat, Objective, Tools, Memory) — unchanged
- LiveRunView component — reused as-is in the report area
- Header, Run now button, settings gear
- Backend data flow (runs, events, findings all stay the same)
- Run rail data comes from the existing `runs` prop (already loaded)

## Empty States

- **No runs yet:** "Your agent hasn't run yet. Click 'Run now' to see it in action."
- **Run with no finding:** Show run status card (completed/failed) with error or "Run completed with no findings."
- **Run in progress:** LiveRunView takes over automatically.
