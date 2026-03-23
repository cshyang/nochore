# Agent Page Redesign — Overview + Activity Tabs

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current AgentWorkspace (gear icon toggles settings vs feed) with a two-tab layout: Overview (always-editable settings) and Activity (feed). Remove gear icon, status badges, and "back to feed" link.

**Architecture:** Refactor `AgentWorkspace` in-place. The `SettingsPanel` becomes the default `OverviewPanel` (first tab). The `ActivityFeed` becomes the second tab. The header gets simplified: tabs replace icon buttons, gear icon removed. Chat drawer stays unchanged.

**Tech Stack:** React, TypeScript, existing SettingsComponents, Phosphor icons

---

### File Map

- Modify: `apps/web/src/components/AgentWorkspace.tsx` — main refactor
- Modify: `apps/web/src/components/SetupWorkspace.tsx` — change "Launch agent" to "Create agent", navigate to agent page after creation
- No new files needed — this is a refactor of existing components

---

### Task 1: Refactor Header — Tabs Replace Gear Icon

**Files:**
- Modify: `apps/web/src/components/AgentWorkspace.tsx:1229-1392`

- [ ] **Step 1: Replace state variables**

In `AgentWorkspace` main component, replace:
```tsx
const [chatOpen, setChatOpen] = useState(false);
const [settingsOpen, setSettingsOpen] = useState(false);
```
With:
```tsx
const [activeTab, setActiveTab] = useState<"overview" | "activity">("overview");
const [chatOpen, setChatOpen] = useState(false);
```

- [ ] **Step 2: Rewrite header — remove color bar, add tabs, remove gear icon**

Replace the entire header section (lines 1254-1392) with this structure:

```tsx
{/* Header */}
<div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 16,
    marginBottom: 0,
    paddingBottom: 0,
  }}
>
  {/* Back */}
  <button
    onClick={onBack}
    style={{
      background: "transparent",
      border: "none",
      cursor: "pointer",
      color: COLORS.textSecondary,
      padding: 6,
      borderRadius: RADIUS.button,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.15s ease",
      flexShrink: 0,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.background = COLORS.surfaceHover;
      e.currentTarget.style.color = COLORS.text;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "transparent";
      e.currentTarget.style.color = COLORS.textSecondary;
    }}
  >
    <ArrowLeft size={18} weight="light" />
  </button>

  {/* Agent name */}
  <h1
    style={{
      fontSize: 20,
      fontWeight: 700,
      color: COLORS.text,
      margin: 0,
      fontFamily: '"Satoshi", sans-serif',
      lineHeight: 1.2,
      flex: 1,
      minWidth: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }}
  >
    {agent.name}
  </h1>

  {/* Chat button — only icon remaining */}
  <IconButton
    active={chatOpen}
    onClick={() => setChatOpen((v) => !v)}
    label="Chat"
  >
    <ChatCircle size={18} weight="light" />
  </IconButton>
</div>

{/* Tab bar */}
<div
  style={{
    display: "flex",
    gap: 0,
    borderBottom: `1px solid ${COLORS.border}`,
    marginBottom: 24,
    marginTop: 16,
  }}
>
  {(["overview", "activity"] as const).map((tab) => (
    <button
      key={tab}
      onClick={() => setActiveTab(tab)}
      style={{
        background: "none",
        border: "none",
        borderBottom: `2px solid ${activeTab === tab ? COLORS.accent : "transparent"}`,
        color: activeTab === tab ? COLORS.text : COLORS.textSecondary,
        fontSize: 14,
        fontWeight: activeTab === tab ? 600 : 400,
        padding: "10px 16px",
        cursor: "pointer",
        fontFamily: '"Satoshi", sans-serif',
        transition: "all 0.15s ease",
        textTransform: "capitalize",
      }}
      onMouseEnter={(e) => {
        if (activeTab !== tab) e.currentTarget.style.color = COLORS.text;
      }}
      onMouseLeave={(e) => {
        if (activeTab !== tab) e.currentTarget.style.color = COLORS.textSecondary;
      }}
    >
      {tab === "overview" ? "Overview" : "Activity"}
    </button>
  ))}
</div>
```

- [ ] **Step 3: Remove status bar**

Delete the status bar section (lines 1397-1442). Status information moves into the Overview tab.

- [ ] **Step 4: Update main content area**

Replace:
```tsx
{settingsOpen ? (
  <SettingsPanel ... />
) : (
  <ActivityFeed ... />
)}
```
With:
```tsx
{activeTab === "overview" ? (
  <OverviewPanel agent={agent} onDeleteAgent={onDeleteAgent} />
) : (
  <ActivityFeed
    runs={runs}
    pendingActions={pendingActions}
    onApprove={onApprove}
    onReject={onReject}
  />
)}
```

- [ ] **Step 5: Remove unused imports**

Remove `Gear` from the Phosphor imports. Remove `getAgentColor` import. Remove `agentColor`, `statusDot`, `statusBadgeColor`, `lastRunText`, `nextRunText` variables.

- [ ] **Step 6: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors (or only pre-existing ones)

---

### Task 2: Convert SettingsPanel to OverviewPanel — Always Editable

**Files:**
- Modify: `apps/web/src/components/AgentWorkspace.tsx:1006-1222`

- [ ] **Step 1: Rename SettingsPanel to OverviewPanel, remove "Back to feed" link**

Rename the function from `SettingsPanel` to `OverviewPanel`. Remove the `onBack` prop and the "Back to feed" button at the top of the component.

- [ ] **Step 2: Add Instructions row with editable textarea**

Replace the first SettingsRow (which just shows agent.name + description) with an Instructions row that shows the agent's description in an editable textarea:

```tsx
<SectionHeading>Identity</SectionHeading>
<SettingsCard>
  <SettingsRow
    icon="✦"
    title="Instructions"
    defaultExpanded={true}
  >
    <p style={{
      color: COLORS.textSecondary,
      fontSize: 13,
      margin: 0,
      lineHeight: 1.7,
      whiteSpace: "pre-wrap",
    }}>
      {agent.description || agent.intent || "No instructions set."}
    </p>
  </SettingsRow>
  <SettingsRow
    icon="◷"
    title="Schedule"
    description="How often the agent runs"
    value={scheduleLabels[agent.schedule] ?? agent.schedule}
  />
</SettingsCard>
```

Note: Full editability (textarea, skill toggles, etc.) requires server functions for updating agent config. For Phase 1, display the current config as readable text. The editable textarea will be wired in Phase 2 when we connect SetupWorkspace output directly.

- [ ] **Step 3: Remove the Intent row**

The old SettingsPanel had a separate "Intent" row showing `agent.intent`. This is redundant with Instructions. Remove it.

- [ ] **Step 4: Update the Activity feed empty state**

In the `ActivityFeed` component, change the empty state message from:
```
"No activity yet — your agent will check in soon."
```
To:
```
"No activity yet. Turn on the schedule to start your agent's first run."
```

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/AgentWorkspace.tsx
git commit -m "feat: redesign agent page — Overview + Activity tabs, remove gear icon

Replace settings-behind-gear-icon with Overview as default tab.
Overview shows agent identity, skills, schedule, policy.
Activity shows the insight feed.
Remove color bar, status badges, status bar from header.
Simplify header to: back + name + tabs + chat icon."
```

---

### Task 3: Update SetupWorkspace — "Create agent" instead of "Launch"

**Files:**
- Modify: `apps/web/src/components/SetupWorkspace.tsx`

- [ ] **Step 1: Rename button text**

Change "Launch agent" to "Create agent" in the button label. Change "Launching..." to "Creating...".

- [ ] **Step 2: Remove post-launch state**

Remove `launchedAgentId` state variable. Remove the "View agent →" button. Remove the "Live" badge in the header. Remove the chat confirmation message about agent being live.

- [ ] **Step 3: Navigate immediately after creation**

After agent is created (both the draft-then-launch path and the direct-create path), navigate immediately to the agent page:
```tsx
navigate({
  to: "/$projectId/agents/$agentId",
  params: { projectId: finalProjectId!, agentId: agentId! },
});
```

- [ ] **Step 4: Simplify header label**

Remove the conditional "Creating agent" vs "Agent for" text. Always show: "Creating agent for **{projectName}**"

- [ ] **Step 5: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/SetupWorkspace.tsx
git commit -m "feat: replace Launch with Create — navigate to agent page after creation

Remove launch ceremony, Live badge, View agent button.
Create agent navigates directly to agent page (Overview tab).
No intermediate state — agent exists immediately."
```

---

### Task 4: Clean Up Unused Code

**Files:**
- Modify: `apps/web/src/components/AgentWorkspace.tsx`
- Modify: `apps/web/src/lib/types.ts`

- [ ] **Step 1: Remove old SettingsPanel function**

After renaming to OverviewPanel, ensure the old `SettingsPanel` function is fully removed (not just renamed — check no references remain).

- [ ] **Step 2: Remove lifecycleStatus references**

In `apps/web/src/lib/types.ts`, the `LifecycleStatus` type and `lifecycleStatus` field on `AgentView` can be kept for now but are no longer used in the UI. Add a comment: `// TODO: simplify — schedule on/off replaces draft/live lifecycle`

- [ ] **Step 3: Remove the color bar system**

In `AgentWorkspace`, the `agentColor` / `getAgentColor` usage is removed in Task 1. Verify no remaining references.

- [ ] **Step 4: Visual test**

Run the dev server: `cd apps/web && npm run dev`

Test manually:
1. Navigate to an existing agent — should see Overview tab (default) with Instructions, Schedule, Skills, Policy
2. Click Activity tab — should see feed (empty state with actionable message, or insight cards if runs exist)
3. Click chat icon — drawer opens
4. Click back — returns to project page
5. Create new agent via SetupWorkspace — after creation, should land directly on agent page Overview tab

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: clean up unused agent lifecycle code"
```
