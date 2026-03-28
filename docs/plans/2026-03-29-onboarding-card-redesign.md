# Onboarding Card Redesign

**Date:** 2026-03-29
**Status:** Approved

## Problem

The current onboarding cards (`OptionCards` + `request_input` tool) support basic radio/checkbox selection but lack features that make the onboarding flow feel polished and efficient. Users see every question one at a time (extra LLM round-trips), can't skip irrelevant questions, and "Something else" awkwardly focuses the main chat input instead of letting users type inline.

Reference: Relay.app's onboarding cards demonstrate batched questions, skip, inline text, and progress indicators — all within a single card component.

## Design

### Approach: Evolve `request_input`

Extend the existing tool schema and `OptionCards` component. No new tools. The LLM decides when to batch questions (multiple `request_input` calls in one response) and when to offer skip/custom — the schema supports it, the prompt doesn't prescribe it.

### 1. Tool Schema Changes

`request_input` gets two new optional input fields and two new output fields:

```typescript
inputSchema: z.object({
  question: z.string(),
  options: z.array(z.object({
    key: z.string(),
    label: z.string(),
    description: z.string().optional(),
    selected: z.boolean().optional(),
  })),
  multiSelect: z.boolean().default(false),
  allowCustom: z.boolean().default(false),  // NEW
  skippable: z.boolean().default(false),    // NEW
}),
outputSchema: z.object({
  selectedKeys: z.array(z.string()),
  customText: z.string().optional(),        // NEW
  skipped: z.boolean().optional(),          // NEW
}),
```

- `allowCustom: true` → appends a "Something else" option with inline text input
- `skippable: true` → shows a Skip button in the card footer
- `customText` → carries the user's freeform text when they used "Something else"
- `skipped: true` → tells the LLM this question was intentionally skipped

### 2. Batched Rendering (Paginated Cards)

When the LLM sends multiple `request_input` calls in a single assistant message, render a **single paginated card** instead of stacking them.

```
┌─────────────────────────────────────────┐
│  What to track?                   1 / 3 │
├─────────────────────────────────────────┤
│  ○ Ad campaigns                         │
│  ○ Social media                         │
│  ○ Website changes                      │
│  ○ Something else                       │
│                          Skip    Next → │
└─────────────────────────────────────────┘
```

**Navigation:**
- **Next** → saves current answer, advances to next question. Disabled if nothing selected (unless skippable).
- **Skip** → saves `skipped: true` for this question, advances. Only shown when `skippable: true`.
- **← Back** → returns to previous question (shown on questions 2+). Answer is preserved.
- On the last question, "Next" becomes **"Submit"** (or "Confirm" for multi-select).

**State management:**
- An `answers` Map keyed by question index stores each answer as `{ selectedKeys, customText?, skipped? }`
- On Submit (last question), all answers are sent as a single user message — one text per question, joined with newlines
- The `request_input` tool outputs are populated with the corresponding answers

**Single question (no pagination):**
- When only one `request_input` exists in the message, render exactly as today — no pagination chrome, no "1 of 1". Skip button and "Something else" still appear if their flags are set.

### 3. "Something else" Inline Text

When `allowCustom: true`, a "Something else" option appears at the bottom of the option list.

- Default state: shows "Something else" as placeholder text, styled like other labels but dimmer
- When clicked: the row gets selected (radio fills / checkbox checks), the placeholder text becomes an editable input, cursor appears, user types directly in place
- The row itself is the input — no separate textarea, no expansion, no extra UI
- Typing replaces the placeholder entirely

```
Before click:
  ○ Something else          ← placeholder, dimmer text

After click:
  ● Track their blog posts|  ← editable, cursor active
```

In the output: `selectedKeys: ["_custom"]`, `customText: "Track their blog posts"`

Selecting "Something else" deselects other options in single-select mode. In multi-select, it adds alongside existing selections. Clicking a different radio option clears the custom text and deselects it.

The current `handleOptionClick` regex that detects "else/other/custom" and focuses the main input gets removed — the behavior moves entirely into the card component.

### 4. Skip Button

When `skippable: true`, a "Skip" text button appears in the card footer.

**Placement:**
- In paginated cards: left side of the footer, opposite Next/Submit
- In single cards: left side, opposite the Confirm button (multi-select) or alone in the footer (single-select)

**Behavior:**
- Single card: Skip sends the message immediately with `skipped: true`, `selectedKeys: []`
- Paginated card: Skip saves `skipped: true` for this question and advances to the next one
- Skip is always a text button (no background), low emphasis — we want users to answer, not skip

**Past messages:**
- A skipped question shows as dimmed "Skipped" text where the selected option would normally be highlighted

### 5. Past Message Collapse

Past cards collapse to a compact summary instead of showing the full dimmed option list.

```
Current (verbose):
┌─────────────────────────────────────┐
│  What to track?                     │
│  ○ Ad campaigns          (dimmed)   │
│  ○ Social media          (dimmed)   │
│  ● Website changes    (highlighted) │
│  ○ Something else        (dimmed)   │
└─────────────────────────────────────┘

New (collapsed):
  ☑ What to track? → Website changes
```

For paginated (batched) cards:
```
  ☑ 3 questions answered
```

Skipped questions don't appear in the summary — only answered ones count.

Expanding collapsed summaries to show individual answers is a nice-to-have, not in scope for v1.

## Files Changed

**`apps/web/src/routes/api.onboard.ts`**
- Add `allowCustom` and `skippable` to `request_input` inputSchema
- Add `customText` and `skipped` to outputSchema
- Remove the "else/other/custom" regex from `handleOptionClick`

**`apps/web/src/components/OnboardingChat.tsx`**
- **`OptionCards`** — add Skip button, "Something else" inline input, handle new props
- **`ConversationMessage`** — detect multiple `request_input` tool calls in one message, render as paginated card instead of stacking
- **New: `PaginatedCard`** — local wrapper component managing pagination state (current step, answers map, back/next/skip). Wraps `OptionCards` for each step.
- **Past message rendering** — collapse answered cards to single-line summary
- **Remove** the `handleOptionClick` regex for "else/other/custom"

**`apps/web/src/server/onboard-prompt.ts`**
- No changes needed. The LLM decides when to batch and when to use `allowCustom`/`skippable`. The schema describes the capability; the prompt doesn't prescribe it.

## Behavioral Note: Single-Select in Paginated vs Non-Paginated

- **Non-paginated single card:** clicking a radio option sends immediately (current behavior, unchanged)
- **Paginated card:** clicking a radio saves the answer locally and enables Next — does NOT send immediately. Sending only happens on the last question's Submit.

## What Stays the Same

- `request_input` tool name and core schema (question, options, multiSelect)
- Multi-select toggle + confirm behavior
- The `useChat` transport and message protocol
- The `search_tools` and `create_agent` tools
- All other tabs and components outside onboarding
