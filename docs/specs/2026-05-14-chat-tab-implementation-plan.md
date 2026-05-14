# Chat Tab Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the agent chat tab as a chat-first surface — header dropdown for threads, centered conversation column, asymmetric message styling, hero empty state, inline approvals, and a floating connections island.

**Architecture:** Pure presentation-layer refactor. The data layer (`useAgentChatFlow`, `getConversationState`, `listConversationThreads`, approval handlers) is unchanged. A new `apps/web/src/components/chat/` subdirectory holds 12 focused components; `agent-chat-pane.tsx` becomes a thin composition root. Existing `ApprovalCard.tsx` is superseded by a new chat-scoped version (kept side-by-side until phase 5 lands).

**Tech Stack:** TanStack Start (React 19), inline styles with `COLORS`/`TYPE`/`RADIUS`/`SPACE`/`MOTION` design tokens, Phosphor icons, AI SDK `streamText`, Vitest (server-side + lib tests only — components verified via TS compile + visual checks).

**Spec:** `docs/specs/2026-05-14-chat-tab-design.md`

**Verification approach:** This project has no component test runner. Each task ends with:
1. `npx tsc --noEmit -p apps/web` clean
2. `npx biome check apps/web/src/components/chat/` clean (after Phase 1; for new files)
3. Browser screenshot at the relevant chat tab URL via Playwright MCP

---

## File Structure

```
apps/web/src/components/
├─ agent-chat-pane.tsx              ← MODIFY: progressive rewrite (composition root)
├─ agent-chat-flow.ts               ← UNCHANGED
├─ ApprovalCard.tsx                 ← KEEP (used by ProjectHome too). Chat-scoped variant lives in chat/
└─ chat/                            ← NEW SUBDIRECTORY
   ├─ ChatHeader.tsx                ← Phase 1
   ├─ ThreadPicker.tsx              ← Phase 1
   ├─ ChatColumn.tsx                ← Phase 1
   ├─ UserMessage.tsx               ← Phase 2
   ├─ AgentMessage.tsx              ← Phase 2
   ├─ ChatInput.tsx                 ← Phase 2
   ├─ EmptyThreadHero.tsx           ← Phase 3
   ├─ RunCard.tsx                   ← Phase 4
   ├─ ChatApprovalCard.tsx          ← Phase 5 (chat-scoped variant of ApprovalCard)
   ├─ ScrollPastPill.tsx            ← Phase 5
   ├─ ConnectionsIsland.tsx         ← Phase 6
   └─ ConnectionDetail.tsx          ← Phase 6

apps/web/src/lib/
├─ chat-suggestions.ts              ← Phase 3 (pure config + lookup)
└─ chat-suggestions.test.ts         ← Phase 3
```

Each phase ends with the chat tab working in its new shape — partial migration is fine. The original `agent-chat-pane.tsx` is rewritten incrementally; never broken between phases.

---

## Phase 0: Branch + Baseline Screenshot

### Task 0.1: Confirm branch and baseline state

**Files:** No code changes.

- [ ] **Step 1: Confirm on `chat-tab-redesign` branch (or create it)**

```bash
cd /Users/cshyang/Documents/Coding\ Repositories/nochore
git branch --show-current
# If not on chat-tab-redesign:
git switch chat-tab-redesign 2>/dev/null || git checkout -b chat-tab-redesign
```

- [ ] **Step 2: Start the dev server in a separate terminal (or background it)**

```bash
cd apps/web && npm run dev
# → http://localhost:3000
```

- [ ] **Step 3: Capture a baseline screenshot of the current chat tab**

Use Playwright MCP `browser_navigate` to `http://localhost:3000/homescape/agents/3f75aba9-7e2?tab=chat`, then `browser_take_screenshot` with `filename: .scratch/screenshots/chat-baseline.png`. This is your "before" reference.

- [ ] **Step 4: Confirm `tsc` baseline is clean**

```bash
cd /Users/cshyang/Documents/Coding\ Repositories/nochore
npx tsc --noEmit -p apps/web
```

Expected: no output (clean).

---

## Phase 1: Composition Shell

Builds the new layout container (no left rail, header dropdown, flex chat column). Existing messages reflow into the new shape. No behavior changes.

### Task 1.1: Create `ChatColumn` layout wrapper

**Files:**
- Create: `apps/web/src/components/chat/ChatColumn.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/ChatColumn.tsx
import { type ReactNode, type RefObject } from "react";
import { SPACE } from "~/lib/colors";

interface ChatColumnProps {
  /** Children render inside the centered max-width container. */
  children: ReactNode;
  /** Scrollable region ref — `useAgentChatFlow` provides this. */
  scrollRef?: RefObject<HTMLDivElement | null>;
  /** Max width of message content. Defaults to 560px (closed-panel state). */
  contentMaxWidth?: number;
}

/**
 * Flex layout wrapper for the chat conversation. Fills available horizontal
 * space (between page edge and the right island); internal max-width caps
 * message content so reading width stays readable. Scrollable; the parent
 * connects scrollRef to autoscroll behavior via useAgentChatFlow.
 */
export function ChatColumn({ children, scrollRef, contentMaxWidth = 560 }: ChatColumnProps) {
  return (
    <div
      ref={scrollRef}
      style={{
        flex: 1,
        minWidth: 0,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        padding: `${SPACE[4]}px 0 ${SPACE[3]}px`,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: contentMaxWidth,
          margin: "0 auto",
          padding: `0 ${SPACE[4]}px`,
          display: "flex",
          flexDirection: "column",
          gap: SPACE[3],
          flex: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p apps/web
```

Expected: clean.

- [ ] **Step 3: Lint the new file**

```bash
npx biome check apps/web/src/components/chat/ChatColumn.tsx
```

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/ChatColumn.tsx
git commit -m "feat(chat): add ChatColumn layout wrapper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.2: Create `ThreadPicker` dropdown flyout

**Files:**
- Create: `apps/web/src/components/chat/ThreadPicker.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/ThreadPicker.tsx
import { CaretDown, Plus } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import type { ConversationThreadSummaryView } from "~/lib/types";

interface ThreadPickerProps {
  threads: ConversationThreadSummaryView[];
  activeThreadId?: string;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

/**
 * Header dropdown showing the active thread title. Clicking opens a flyout
 * with all threads + a "New thread" action. Replaces the left rail of the
 * previous design.
 */
export function ThreadPicker({ threads, activeThreadId, onSelectThread, onCreateThread }: ThreadPickerProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const active = threads.find((t) => t.id === activeThreadId) ?? threads[0];
  const activeTitle = active?.title ?? "New thread";

  // Click-away to close
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          padding: "4px 10px",
          fontSize: TYPE.scale.sm,
          color: COLORS.text,
          fontWeight: TYPE.weight.medium,
          cursor: "pointer",
          fontFamily: "inherit",
          transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.borderStrong)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
      >
        <span style={{ maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {activeTitle}
        </span>
        <CaretDown size={12} color={COLORS.textDim} weight="bold" />
      </button>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            minWidth: 240,
            maxWidth: 320,
            background: COLORS.cardRaised,
            border: `1px solid ${COLORS.borderStrong}`,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
            borderRadius: RADIUS.lg,
            padding: 4,
            zIndex: 10,
          }}
        >
          {threads.map((t) => (
            <button
              type="button"
              key={t.id}
              onClick={() => {
                onSelectThread(t.id);
                setOpen(false);
              }}
              style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 2,
                padding: "8px 10px",
                background: t.id === activeThreadId ? COLORS.accentSurface : "transparent",
                border: "none",
                borderRadius: RADIUS.sm,
                cursor: "pointer",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                if (t.id !== activeThreadId) e.currentTarget.style.background = COLORS.surfaceHover;
              }}
              onMouseLeave={(e) => {
                if (t.id !== activeThreadId) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  fontSize: TYPE.scale.sm,
                  color: COLORS.text,
                  fontWeight: TYPE.weight.medium,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 280,
                }}
              >
                {t.title}
              </span>
              <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
                {t.lastMessageAt ? new Date(t.lastMessageAt).toLocaleDateString() : "Empty"}
              </span>
            </button>
          ))}
          <div style={{ height: 1, background: COLORS.border, margin: "4px 0" }} />
          <button
            type="button"
            onClick={() => {
              onCreateThread();
              setOpen(false);
            }}
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "8px 10px",
              background: "transparent",
              border: "none",
              borderRadius: RADIUS.sm,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: TYPE.scale.sm,
              color: COLORS.accent,
              fontWeight: TYPE.weight.medium,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.accentSurface)}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
          >
            <Plus size={12} weight="bold" />
            <span>New thread</span>
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ThreadPicker.tsx
```

Both clean.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ThreadPicker.tsx
git commit -m "feat(chat): add ThreadPicker dropdown

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.3: Create `ChatHeader`

**Files:**
- Create: `apps/web/src/components/chat/ChatHeader.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/ChatHeader.tsx
import { COLORS, SPACE, TYPE } from "~/lib/colors";
import { ThreadPicker } from "~/components/chat/ThreadPicker";
import type { AgentView, ConversationThreadSummaryView } from "~/lib/types";

export type ChatStatus = "idle" | "running" | "needs-you";

interface ChatHeaderProps {
  agent: AgentView;
  threads: ConversationThreadSummaryView[];
  activeThreadId?: string;
  status: ChatStatus;
  onSelectThread: (threadId: string) => void;
  onCreateThread: () => void;
}

const STATUS_COPY: Record<ChatStatus, { label: string; color: string; pulse: boolean }> = {
  idle: { label: "Idle", color: COLORS.textDim, pulse: false },
  running: { label: "Running", color: COLORS.green, pulse: true },
  "needs-you": { label: "Needs you", color: COLORS.orange, pulse: true },
};

export function ChatHeader({
  agent,
  threads,
  activeThreadId,
  status,
  onSelectThread,
  onCreateThread,
}: ChatHeaderProps) {
  const s = STATUS_COPY[status];
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: SPACE[3],
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        borderBottom: `1px solid ${COLORS.border}`,
      }}
    >
      <span
        style={{
          fontSize: TYPE.scale.md,
          fontWeight: TYPE.weight.semibold,
          fontFamily: TYPE.display,
          color: COLORS.text,
          letterSpacing: TYPE.tracking.tight,
        }}
      >
        {agent.name}
      </span>
      <ThreadPicker
        threads={threads}
        activeThreadId={activeThreadId}
        onSelectThread={onSelectThread}
        onCreateThread={onCreateThread}
      />
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 99,
            background: s.color,
            ...(s.pulse ? { animation: "pulse 2s ease-in-out infinite" } : {}),
          }}
        />
        <span style={{ fontSize: TYPE.scale.xs, color: s.color, fontWeight: TYPE.weight.medium }}>{s.label}</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ChatHeader.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ChatHeader.tsx
git commit -m "feat(chat): add ChatHeader with thread picker + status pill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 1.4: Wire new layout into `agent-chat-pane.tsx` (kill the rail)

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx`

This is the largest single edit. The goal: keep `useAgentChatFlow` and all the data props identical, but replace the visual shell (left rail + chat column with messages) with `<ChatHeader>` + `<ChatColumn>` + existing message rendering. Approval, run, and input wiring stays as-is for now (changes in later phases).

- [ ] **Step 1: Read the current pane to identify the chunks that survive**

```bash
wc -l apps/web/src/components/agent-chat-pane.tsx
# Read the file fully — you need to know what the existing return JSX looks like.
```

The existing JSX has a top-level wrapper, a left thread rail (`<div>...</div>` with thread cards), a right-column wrapper with messages map + input. Identify these three regions.

- [ ] **Step 2: Replace the return JSX with the new shell**

Replace everything from the `return (` line to the matching closing `);` with:

```tsx
  return (
    <>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
      <ChatHeader
        agent={agent}
        threads={displayedThreads}
        activeThreadId={draftThreadOpen ? DRAFT_THREAD_ID : activeThreadId ?? conversation?.threadId}
        status={derivePaneStatus(runs, pendingApproval)}
        onSelectThread={(id) => onSelectThread?.(id)}
        onCreateThread={() => onCreateThread?.()}
      />
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <ChatColumn scrollRef={scrollRef}>
          {/* Existing message rendering — leave the inner loop intact until Phase 2 */}
          {messages.map((m) => (
            <ConversationMessage
              key={m.id}
              message={m}
              isLatestAssistant={false}
              latestAssistantRef={latestAssistantRef}
              onOptionClick={handleOptionClick}
            />
          ))}
          {pendingApproval && onApprove && onReject && (
            <ApprovalCard
              approval={pendingApproval}
              onApprove={(reason) => onApprove(pendingApproval.id, reason)}
              onReject={(reason) => onReject(pendingApproval.id, reason)}
              onClear={onClearPendingApproval}
            />
          )}
          <ChatInputStub
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            inputRef={inputRef}
            isLoading={isLoading}
          />
        </ChatColumn>
      </div>
    </>
  );
```

- [ ] **Step 3: Add imports and the helper functions used above**

At the top of the file:

```tsx
import { ChatColumn } from "~/components/chat/ChatColumn";
import { ChatHeader, type ChatStatus } from "~/components/chat/ChatHeader";
```

Below the component (or anywhere file-scoped):

```tsx
function derivePaneStatus(runs: RunView[], pendingApproval: PendingActionView | null | undefined): ChatStatus {
  if (pendingApproval && pendingApproval.status === "pending") return "needs-you";
  if (runs.some((r) => r.status === "running" || r.status === "waiting_for_tasks")) return "running";
  return "idle";
}

/**
 * Temporary inline input wrapper. Replaced by chat/ChatInput.tsx in Phase 2.
 * Kept inline here so the chat keeps working between phases.
 */
function ChatInputStub(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
      style={{ marginTop: "auto", paddingTop: 8 }}
    >
      <textarea
        ref={props.inputRef}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={props.onKeyDown}
        placeholder="Brief or ask anything…"
        rows={2}
        disabled={props.isLoading}
        style={{
          width: "100%",
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.lg,
          padding: "12px 14px",
          fontSize: TYPE.scale.sm,
          color: COLORS.text,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
        }}
      />
    </form>
  );
}
```

- [ ] **Step 4: Remove now-unused thread-rail JSX and helpers from the pane file**

After replacing the JSX, search the file for any thread-rail-specific JSX still hanging out (orphaned variables, unused functions). The `displayedThreads` variable is still used (by ThreadPicker), so keep it. The `DRAFT_THREAD_ID` constant is still used. But thread-card rendering JSX, hover handlers for thread cards, and the rail wrapper are gone.

If `onDeleteThread` is unused after this edit, leave the prop in the interface for now — Phase 7 will revisit prop cleanup.

- [ ] **Step 5: Verify TS compiles**

```bash
npx tsc --noEmit -p apps/web
```

Fix any "unused variable" warnings by removing the unused declarations (the rail kept some helper consts/variables alive).

- [ ] **Step 6: Visual check**

Reload `http://localhost:3000/homescape/agents/3f75aba9-7e2?tab=chat` in the browser. Use Playwright MCP to take a screenshot to `.scratch/screenshots/phase-1-shell.png`.

**Expected:**
- No left rail (thread cards gone).
- Header strip with agent name + `Main chat ▾` picker + status pill on the right.
- Clicking the picker opens a flyout with threads + "+ New thread".
- Conversation messages still render in the center column.
- Input still works (sending a message still triggers the agent).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): wire new shell into agent-chat-pane (no left rail)

Replaces the left thread rail and old column layout with ChatHeader +
ChatColumn. Thread navigation moves to the header picker dropdown.
Existing message rendering, input, and approval card stay in place
behind a temporary ChatInputStub until Phase 2.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2: Message Styling Split

Replace generic `ConversationMessage` rendering with role-specific `UserMessage` + `AgentMessage`. Extract the input into `ChatInput`.

### Task 2.1: Create `UserMessage`

**Files:**
- Create: `apps/web/src/components/chat/UserMessage.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/UserMessage.tsx
import { type ReactNode } from "react";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";

interface UserMessageProps {
  /** Plain text body. Children allowed for future rich content (mentions, etc.). */
  children: ReactNode;
}

/**
 * Right-aligned bubble for user-authored messages. Periwinkle background,
 * white text, max-width 65% of the column so the asymmetry against the
 * full-width agent message reads clearly.
 */
export function UserMessage({ children }: UserMessageProps) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div
        style={{
          background: COLORS.accent,
          color: COLORS.white,
          borderRadius: RADIUS.lg,
          padding: `${SPACE[2]}px ${SPACE[3]}px`,
          fontSize: TYPE.scale.sm,
          lineHeight: TYPE.leading.snug,
          maxWidth: "65%",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/UserMessage.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/UserMessage.tsx
git commit -m "feat(chat): add UserMessage bubble

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.2: Create `AgentMessage`

**Files:**
- Create: `apps/web/src/components/chat/AgentMessage.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/AgentMessage.tsx
import { type ReactNode } from "react";
import { COLORS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";

interface AgentMessageProps {
  /** Message body — markdown-rendered prose, RunCard, ApprovalCard, etc. */
  children: ReactNode;
  /** ISO timestamp of when the message was authored. Optional. */
  timestamp?: string;
}

/**
 * Full-column-width container for agent-authored messages. No background,
 * no bubble — just text on the page. A small meta line (green dot +
 * "Agent · {relative time}") sits above the content.
 */
export function AgentMessage({ children, timestamp }: AgentMessageProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE[1] }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: COLORS.green }} />
        <span>Agent{timestamp ? ` · ${formatRelativeTime(new Date(timestamp).getTime())}` : ""}</span>
      </div>
      <div
        style={{
          color: COLORS.text,
          fontSize: TYPE.scale.sm,
          lineHeight: TYPE.leading.normal,
          width: "100%",
        }}
      >
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/AgentMessage.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/AgentMessage.tsx
git commit -m "feat(chat): add AgentMessage full-width container

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.3: Create `ChatInput`

**Files:**
- Create: `apps/web/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/ChatInput.tsx
import { ArrowUp } from "@phosphor-icons/react";
import { type KeyboardEvent, type RefObject } from "react";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";

interface ChatInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  /** Visual size: `default` for bottom-anchored, `hero` for empty-state centered. */
  variant?: "default" | "hero";
  placeholder?: string;
}

/**
 * Multi-line text input + send button. Send via Cmd/Ctrl+Enter (handled by
 * the caller via onKeyDown) or clicking the send circle. Disabled while a
 * stream is in flight.
 */
export function ChatInput({
  value,
  onChange,
  onSubmit,
  onKeyDown,
  inputRef,
  isLoading,
  variant = "default",
  placeholder = "Brief or ask anything…",
}: ChatInputProps) {
  const isHero = variant === "hero";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      style={{
        display: "flex",
        gap: SPACE[2],
        alignItems: "flex-end",
        background: COLORS.surface,
        border: `1px solid ${COLORS.border}`,
        borderRadius: isHero ? 14 : RADIUS.lg,
        padding: isHero ? `${SPACE[3]}px ${SPACE[3]}px` : `${SPACE[2]}px ${SPACE[2]}px`,
        transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
      }}
      onFocusCapture={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
      onBlurCapture={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
    >
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={isHero ? 2 : 1}
        disabled={isLoading}
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          padding: 6,
          fontSize: isHero ? TYPE.scale.base : TYPE.scale.sm,
          color: COLORS.text,
          fontFamily: "inherit",
          resize: "none",
          outline: "none",
          lineHeight: TYPE.leading.normal,
          minHeight: 24,
        }}
      />
      <button
        type="submit"
        disabled={isLoading || value.trim().length === 0}
        aria-label="Send"
        style={{
          width: isHero ? 32 : 26,
          height: isHero ? 32 : 26,
          borderRadius: 99,
          background: value.trim().length > 0 && !isLoading ? COLORS.accent : COLORS.surfaceHover,
          color: COLORS.white,
          border: "none",
          cursor: value.trim().length > 0 && !isLoading ? "pointer" : "default",
          display: "grid",
          placeItems: "center",
          transition: `background ${MOTION.duration} ${MOTION.ease}`,
        }}
      >
        <ArrowUp size={isHero ? 14 : 12} weight="bold" />
      </button>
    </form>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ChatInput.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ChatInput.tsx
git commit -m "feat(chat): add ChatInput component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2.4: Replace `ConversationMessage` + `ChatInputStub` in the pane

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx`

- [ ] **Step 1: Swap message rendering**

In `agent-chat-pane.tsx`, replace the `messages.map(...)` block (which currently renders `<ConversationMessage>`) with a role-aware loop:

```tsx
{messages.map((m) => {
  if (m.role === "user") {
    return (
      <UserMessage key={m.id}>
        {textOfMessage(m)}
      </UserMessage>
    );
  }
  return (
    <AgentMessage key={m.id} timestamp={m.metadata?.createdAt as string | undefined}>
      <MessageBody message={m} latestAssistantRef={latestAssistantRef} onOptionClick={handleOptionClick} />
    </AgentMessage>
  );
})}
```

- [ ] **Step 2: Add the helpers**

In the same file, define the helpers right above the export:

```tsx
function textOfMessage(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/**
 * Renders the agent message body. For now defers to ConversationMessage's
 * existing rendering for parts; future phases (RunCard, ApprovalCard inline)
 * will swap this for richer rendering.
 */
function MessageBody({
  message,
  latestAssistantRef,
  onOptionClick,
}: {
  message: UIMessage;
  latestAssistantRef: React.RefObject<HTMLDivElement | null>;
  onOptionClick: (value: string) => void;
}) {
  return (
    <ConversationMessage
      message={message}
      isLatestAssistant={false}
      latestAssistantRef={latestAssistantRef}
      onOptionClick={onOptionClick}
    />
  );
}
```

- [ ] **Step 3: Swap the input**

Replace `<ChatInputStub …/>` with:

```tsx
<ChatInput
  value={inputValue}
  onChange={setInputValue}
  onSubmit={handleSubmit}
  onKeyDown={handleKeyDown}
  inputRef={inputRef}
  isLoading={isLoading}
/>
```

Remove the `ChatInputStub` function definition (no longer used).

- [ ] **Step 4: Add imports**

```tsx
import { ChatInput } from "~/components/chat/ChatInput";
import { UserMessage } from "~/components/chat/UserMessage";
import { AgentMessage } from "~/components/chat/AgentMessage";
```

- [ ] **Step 5: TS check**

```bash
npx tsc --noEmit -p apps/web
```

Resolve any type mismatches (likely around `UIMessage`'s `parts` shape — the filter narrows the union).

- [ ] **Step 6: Visual check**

Reload chat. Take screenshot → `.scratch/screenshots/phase-2-messages.png`.

**Expected:**
- User messages: right-aligned periwinkle bubbles, ~65% max width
- Agent messages: full-width prose with a small "● Agent · 4m ago" meta line above
- Input: rounded, send button on the right that's brighter when there's text to send

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): asymmetric message styling + ChatInput

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3: Empty Thread Hero

When a thread has zero messages, replace the empty conversation with a hero (title + suggestions + big input).

### Task 3.1: Create `chat-suggestions.ts` config + test

**Files:**
- Create: `apps/web/src/lib/chat-suggestions.ts`
- Create: `apps/web/src/lib/chat-suggestions.test.ts`

- [ ] **Step 1: Write the test first**

```ts
// apps/web/src/lib/chat-suggestions.test.ts
import { describe, expect, it } from "vitest";
import { getSuggestionsForAgent, DEFAULT_SUGGESTIONS } from "./chat-suggestions";

describe("getSuggestionsForAgent", () => {
  it("returns skill-specific suggestions when first skill matches", () => {
    const result = getSuggestionsForAgent({ skills: ["google-ads-optimizer", "other-skill"] });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.title).toBe("Why is CPL up this week?");
  });

  it("falls back to defaults when no skills match", () => {
    const result = getSuggestionsForAgent({ skills: ["unknown-skill"] });
    expect(result).toEqual(DEFAULT_SUGGESTIONS);
  });

  it("falls back to defaults when skills is empty", () => {
    const result = getSuggestionsForAgent({ skills: [] });
    expect(result).toEqual(DEFAULT_SUGGESTIONS);
  });

  it("uses only the first skill (no blending)", () => {
    const result = getSuggestionsForAgent({ skills: ["unknown-first", "google-ads-optimizer"] });
    expect(result).toEqual(DEFAULT_SUGGESTIONS);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails (file doesn't exist yet)**

```bash
cd /Users/cshyang/Documents/Coding\ Repositories/nochore
npx vitest run apps/web/src/lib/chat-suggestions.test.ts
```

Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

```ts
// apps/web/src/lib/chat-suggestions.ts
export interface ChatSuggestion {
  icon: string;
  title: string;
  description: string;
}

export const SKILL_SUGGESTIONS: Record<string, ChatSuggestion[]> = {
  "google-ads-optimizer": [
    { icon: "📊", title: "Why is CPL up this week?", description: "Diagnose recent change" },
    { icon: "🔍", title: "Find waste in search terms", description: "Scan low-converting keywords" },
    { icon: "📈", title: "Review last week's runs", description: "What did you find recently?" },
    { icon: "⚙️", title: "Adjust approval rules", description: "Update thresholds" },
  ],
};

export const DEFAULT_SUGGESTIONS: ChatSuggestion[] = [
  { icon: "📰", title: "What did you find this week?", description: "Recent findings review" },
  { icon: "▶️", title: "What's running right now?", description: "Live status" },
  { icon: "⚙️", title: "Update my instructions", description: "Evolve scope or behavior" },
];

/**
 * Returns the suggestion list to show in an empty thread for the given agent.
 * Looks up by the agent's first skill; falls back to DEFAULT_SUGGESTIONS.
 */
export function getSuggestionsForAgent(agent: { skills: string[] }): ChatSuggestion[] {
  const primarySkill = agent.skills[0];
  if (!primarySkill) return DEFAULT_SUGGESTIONS;
  return SKILL_SUGGESTIONS[primarySkill] ?? DEFAULT_SUGGESTIONS;
}
```

- [ ] **Step 4: Run the test — confirm it passes**

```bash
npx vitest run apps/web/src/lib/chat-suggestions.test.ts
```

Expected: all 4 tests pass.

- [ ] **Step 5: Add to the root `test:web` script**

Modify `package.json` (root) — append the new test file path to the `test:web` script:

```json
"test:web": "vitest run apps/web/src/server/deps.test.ts ... apps/web/src/lib/chat-suggestions.test.ts"
```

(Insert it in the same flat list of paths the script currently uses.)

- [ ] **Step 6: Run the full web test suite**

```bash
npm run test:web
```

Expected: all tests pass including the new one.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/chat-suggestions.ts apps/web/src/lib/chat-suggestions.test.ts package.json
git commit -m "feat(chat): add chat-suggestions config + lookup

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.2: Create `EmptyThreadHero`

**Files:**
- Create: `apps/web/src/components/chat/EmptyThreadHero.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/EmptyThreadHero.tsx
import { type RefObject } from "react";
import { ChatInput } from "~/components/chat/ChatInput";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { getSuggestionsForAgent } from "~/lib/chat-suggestions";
import type { AgentView } from "~/lib/types";

interface EmptyThreadHeroProps {
  agent: AgentView;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSubmit: () => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  isLoading: boolean;
  /** Called when a suggestion card is clicked — passes the suggestion's `title` as the message text. */
  onPickSuggestion: (text: string) => void;
}

export function EmptyThreadHero({
  agent,
  inputValue,
  onInputChange,
  onSubmit,
  onKeyDown,
  inputRef,
  isLoading,
  onPickSuggestion,
}: EmptyThreadHeroProps) {
  const suggestions = getSuggestionsForAgent({ skills: agent.skills });
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: SPACE[5],
        maxWidth: 580,
        margin: "0 auto",
        padding: `0 ${SPACE[4]}px`,
      }}
    >
      <h2
        style={{
          fontSize: TYPE.scale.lg,
          fontWeight: TYPE.weight.semibold,
          fontFamily: TYPE.display,
          color: COLORS.text,
          letterSpacing: TYPE.tracking.tight,
          margin: 0,
          textAlign: "center",
        }}
      >
        What should we look at?
      </h2>
      <div style={{ width: "100%" }}>
        <ChatInput
          value={inputValue}
          onChange={onInputChange}
          onSubmit={onSubmit}
          onKeyDown={onKeyDown}
          inputRef={inputRef}
          isLoading={isLoading}
          variant="hero"
        />
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: SPACE[2],
          width: "100%",
        }}
      >
        {suggestions.slice(0, 4).map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPickSuggestion(s.title)}
            style={{
              textAlign: "left",
              background: COLORS.bgRaised,
              border: `1px solid ${COLORS.border}`,
              borderRadius: RADIUS.lg,
              padding: `${SPACE[3]}px ${SPACE[3]}px`,
              cursor: "pointer",
              fontFamily: "inherit",
              transition: `border-color ${MOTION.duration} ${MOTION.ease}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = COLORS.accent)}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = COLORS.border)}
          >
            <div style={{ fontSize: 16, marginBottom: 4 }} aria-hidden>
              {s.icon}
            </div>
            <div
              style={{
                fontSize: TYPE.scale.sm,
                color: COLORS.text,
                fontWeight: TYPE.weight.medium,
                lineHeight: TYPE.leading.snug,
                marginBottom: 2,
              }}
            >
              {s.title}
            </div>
            <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>{s.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/EmptyThreadHero.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/EmptyThreadHero.tsx
git commit -m "feat(chat): add EmptyThreadHero with skill-driven suggestions

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3.3: Wire empty hero into the pane

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx`

- [ ] **Step 1: Render the hero when `messages.length === 0`**

Replace the `<ChatColumn>` body to branch on whether there are messages:

```tsx
<ChatColumn scrollRef={scrollRef}>
  {messages.length === 0 ? (
    <EmptyThreadHero
      agent={agent}
      inputValue={inputValue}
      onInputChange={setInputValue}
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      inputRef={inputRef}
      isLoading={isLoading}
      onPickSuggestion={(text) => {
        setInputValue(text);
        // Auto-submit after pick — small UX detail; remove if it feels too eager.
        setTimeout(() => handleSubmit(), 0);
      }}
    />
  ) : (
    <>
      {messages.map((m) => /* existing role-aware mapping from Task 2.4 */ null)}
      {pendingApproval && /* existing approval card render */ null}
      <ChatInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        inputRef={inputRef}
        isLoading={isLoading}
      />
    </>
  )}
</ChatColumn>
```

(Keep the existing message map / approval card render from Phase 2; only the wrap-in-conditional is new.)

- [ ] **Step 2: Add the import**

```tsx
import { EmptyThreadHero } from "~/components/chat/EmptyThreadHero";
```

- [ ] **Step 3: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 4: Visual check — fresh thread**

Click `+ New thread` in the picker. Take screenshot → `.scratch/screenshots/phase-3-hero.png`.

**Expected:**
- Centered "What should we look at?" heading
- Hero-variant input below the heading
- 2×2 grid of suggestion cards (Google Ads–specific if testing the existing Homescape agent)
- Sending a message OR clicking a suggestion collapses the hero into the normal conversation view

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): show EmptyThreadHero when thread has no messages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4: Run Card Refactor

Extract the existing run rendering into a focused `RunCard` styled with the `cardRaised` recipe.

### Task 4.1: Create `RunCard`

**Files:**
- Create: `apps/web/src/components/chat/RunCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/RunCard.tsx
import { Link } from "@tanstack/react-router";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";

interface RunCardFinding {
  /** Short, single-line summary. */
  text: string;
}

interface RunCardProps {
  runId: string;
  agentId: string;
  projectId: string;
  /** One-line summary the agent emitted for this run. */
  headline: string;
  /** Top 3 findings — list is truncated to 3 max. */
  findings: RunCardFinding[];
  /** Run duration in milliseconds. */
  durationMs?: number;
  /** ISO timestamp of completion. */
  completedAt?: string;
  /** Optional title; falls back to "Run completed". */
  title?: string;
}

export function RunCard({
  runId,
  agentId,
  projectId,
  headline,
  findings,
  durationMs,
  completedAt,
  title,
}: RunCardProps) {
  const top = findings.slice(0, 3);
  const durationText = durationMs ? formatDuration(durationMs) : null;
  const timeText = completedAt ? formatRelativeTime(new Date(completedAt).getTime()) : null;
  return (
    <div
      style={{
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[4]}px`,
        marginTop: SPACE[2],
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: SPACE[2] }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: COLORS.green }} />
          <span style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
            {title ?? "Run completed"}
          </span>
        </div>
        <span style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
          {[durationText, timeText].filter(Boolean).join(" · ")}
        </span>
      </div>
      <div style={{ fontSize: TYPE.scale.sm, color: COLORS.text, lineHeight: TYPE.leading.normal, marginTop: SPACE[2] }}>
        {headline}
      </div>
      {top.length > 0 && (
        <div
          style={{
            background: COLORS.bg,
            borderRadius: RADIUS.md,
            padding: `${SPACE[2]}px ${SPACE[3]}px`,
            marginTop: SPACE[2],
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          {top.map((f, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                gap: 8,
                fontSize: TYPE.scale.xs,
                color: COLORS.textSecondary,
                lineHeight: TYPE.leading.snug,
              }}
            >
              <span style={{ color: COLORS.accent, fontWeight: TYPE.weight.semibold, minWidth: 14 }}>{i + 1}</span>
              <span>{f.text}</span>
            </div>
          ))}
        </div>
      )}
      <Link
        to="/$projectId/agents/$agentId/runs/$runId"
        params={{ projectId, agentId, runId }}
        style={{
          display: "inline-block",
          marginTop: SPACE[2],
          fontSize: TYPE.scale.xs,
          color: COLORS.accent,
          fontWeight: TYPE.weight.medium,
          textDecoration: "none",
        }}
      >
        Open full report →
      </Link>
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}
```

- [ ] **Step 2: Confirm the run report route exists at the path used**

```bash
ls apps/web/src/routes | grep runs
```

If the route file is `$projectId.agents.$agentId.runs.$runId.tsx`, the `Link` `to` value above is correct. If the route exists at a different path (e.g., only `$projectId.agents.$agentId.tsx?tab=runs&runId=...`), adjust the `Link` to use search params instead:

```tsx
<Link
  to="/$projectId/agents/$agentId"
  params={{ projectId, agentId }}
  search={{ tab: "runs", runId }}
  style={{ ... }}
>
```

Pick whichever matches the actual route surface and update the component accordingly.

- [ ] **Step 3: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/RunCard.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/chat/RunCard.tsx
git commit -m "feat(chat): add RunCard with cardRaised recipe

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4.2: Wire `RunCard` into agent message rendering

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx`
- Modify: `apps/web/src/components/chat/AgentMessage.tsx` (only if needed; props likely unchanged)

The agent chat stream emits parts that may include a `tool-finishRun` / `run-complete` part with a run id (check `agent-chat-flow.ts` or the existing `ConversationMessage` to confirm the exact part type). When such a part is present in a message, render `<RunCard>` instead of plain text for that part.

- [ ] **Step 1: Identify the run-complete signal in the message parts**

```bash
grep -n "runId\|run_complete\|tool-finishRun\|runCompletion" apps/web/src/components/onboarding-chat-messages.tsx apps/web/src/components/agent-chat-flow.ts | head -20
```

Find how the existing pane detects "this message contains a run result." Match that detection in the new path.

- [ ] **Step 2: Update `MessageBody` (defined in Task 2.4) to render `RunCard` for run-result parts**

```tsx
function MessageBody({
  message,
  runs,
  projectId,
  agentId,
  latestAssistantRef,
  onOptionClick,
}: {
  message: UIMessage;
  runs: RunView[];
  projectId: string;
  agentId: string;
  latestAssistantRef: React.RefObject<HTMLDivElement | null>;
  onOptionClick: (value: string) => void;
}) {
  // For each part, render plain text or RunCard depending on part shape.
  return (
    <>
      {message.parts.map((p, i) => {
        if (p.type === "text") {
          return (
            <div key={i} style={{ whiteSpace: "pre-wrap" }}>
              {p.text}
            </div>
          );
        }
        // Adjust this check to match the actual part type from your stream
        if (p.type === "tool-finishRun" || (p as { runId?: string }).runId) {
          const runId = (p as { runId?: string }).runId;
          const run = runs.find((r) => r.id === runId);
          if (run && run.summary) {
            return (
              <RunCard
                key={i}
                runId={run.id}
                agentId={agentId}
                projectId={projectId}
                headline={run.summary.headline}
                findings={(run.summary.details ?? []).map((text) => ({ text }))}
                completedAt={run.completedAt}
                durationMs={
                  run.completedAt && run.startedAt
                    ? new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()
                    : undefined
                }
              />
            );
          }
        }
        return null;
      })}
    </>
  );
}
```

- [ ] **Step 3: Pass `runs`, `projectId`, `agentId` to `MessageBody` from the pane**

Update the call site:

```tsx
<MessageBody
  message={m}
  runs={runs}
  projectId={projectId}
  agentId={agent.id}
  latestAssistantRef={latestAssistantRef}
  onOptionClick={handleOptionClick}
/>
```

- [ ] **Step 4: Add the import**

```tsx
import { RunCard } from "~/components/chat/RunCard";
```

- [ ] **Step 5: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 6: Visual check**

Trigger a run from chat ("Why is CPL up this week?" or any briefing that completes a run). When the run finishes, the result should appear as a RunCard inline.

Screenshot → `.scratch/screenshots/phase-4-runcard.png`.

**Expected:**
- Compact card with green dot + "Run completed" title + duration/time on the right
- Headline below
- 3 findings list with periwinkle numbers
- "Open full report →" link at the bottom that navigates to the run report

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agent-chat-pane.tsx apps/web/src/components/chat/AgentMessage.tsx
git commit -m "feat(chat): render run results as RunCard inside agent messages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5: Approval Refactor

Replace the standalone `ApprovalCard` rendering at the bottom of the chat with inline, message-attached approval cards. Add the scroll-past pill.

### Task 5.1: Create `ChatApprovalCard`

**Files:**
- Create: `apps/web/src/components/chat/ChatApprovalCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/ChatApprovalCard.tsx
import { useState } from "react";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { humanizeToolName } from "~/lib/narrate";
import type { PendingActionView } from "~/lib/types";

interface ChatApprovalCardProps {
  approval: PendingActionView;
  onApprove: (reason: string) => void | Promise<void>;
  onReject: (reason: string) => void | Promise<void>;
}

/**
 * Inline approval card rendered as part of an agent message. Two display
 * states: `pending` (full card with buttons) and `resolved` (collapsed
 * chip with decision label + reason).
 */
export function ChatApprovalCard({ approval, onApprove, onReject }: ChatApprovalCardProps) {
  const [decision, setDecision] = useState<"approved" | "skipped" | null>(null);
  const [reason, setReason] = useState("");

  if (decision !== null) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background: decision === "approved" ? COLORS.greenSubtle : COLORS.grayDim,
          border: `1px solid ${decision === "approved" ? COLORS.greenBorder : COLORS.border}`,
          borderRadius: RADIUS.pill,
          padding: `${SPACE[1]}px ${SPACE[3]}px`,
          marginTop: SPACE[2],
          fontSize: TYPE.scale.xs,
          color: decision === "approved" ? COLORS.green : COLORS.textSecondary,
          fontWeight: TYPE.weight.medium,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: decision === "approved" ? COLORS.green : COLORS.textDim,
          }}
        />
        {decision === "approved" ? "Approved" : "Skipped"}
        {reason ? ` · ${reason}` : ""}
      </div>
    );
  }

  return (
    <div
      data-approval-id={approval.id}
      style={{
        background: COLORS.orangeSubtle,
        border: `1px solid ${COLORS.orangeBorder}`,
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[3]}px`,
        marginTop: SPACE[2],
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: TYPE.scale.xs,
          color: COLORS.orange,
          fontWeight: TYPE.weight.semibold,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
          marginBottom: SPACE[2],
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: COLORS.orange,
            animation: "pulse 2s ease-in-out infinite",
          }}
        />
        Needs your call
      </div>
      <div style={{ fontSize: TYPE.scale.sm, fontWeight: TYPE.weight.semibold, color: COLORS.text }}>
        {humanizeToolName(approval.proposal.toolName)}
      </div>
      <div
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textSecondary,
          marginTop: 4,
          marginBottom: SPACE[3],
          lineHeight: TYPE.leading.normal,
        }}
      >
        {approval.proposal.reason}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={async () => {
            await onApprove(reason);
            setDecision("approved");
          }}
          style={{
            background: COLORS.green,
            border: "none",
            borderRadius: RADIUS.md,
            padding: "6px 14px",
            color: COLORS.bg,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.semibold,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Approve
        </button>
        <button
          type="button"
          onClick={async () => {
            await onReject(reason);
            setDecision("skipped");
          }}
          style={{
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "6px 12px",
            color: COLORS.textSecondary,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Skip
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ChatApprovalCard.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ChatApprovalCard.tsx
git commit -m "feat(chat): add inline ChatApprovalCard with resolved state

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.2: Create `ScrollPastPill`

**Files:**
- Create: `apps/web/src/components/chat/ScrollPastPill.tsx`

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/chat/ScrollPastPill.tsx
import { ArrowUp } from "@phosphor-icons/react";
import { useEffect, useState, type RefObject } from "react";
import { COLORS, RADIUS, TYPE } from "~/lib/colors";

interface ScrollPastPillProps {
  /** Ref to the scroll container so we can detect scroll position. */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** The element id of the pending-approval card. Used to scroll into view. */
  approvalElementId?: string;
  /** Number of pending approvals — pluralizes the label. */
  pendingCount: number;
}

/**
 * Sticky pill that surfaces a pending approval when the user has scrolled
 * past it. Click to scroll the approval back into view.
 */
export function ScrollPastPill({ scrollRef, approvalElementId, pendingCount }: ScrollPastPillProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!approvalElementId || pendingCount === 0) {
      setVisible(false);
      return;
    }
    const scroller = scrollRef.current;
    if (!scroller) return;
    function check() {
      const target = approvalElementId ? document.querySelector(`[data-approval-id="${approvalElementId}"]`) : null;
      if (!target || !scroller) {
        setVisible(false);
        return;
      }
      const tRect = target.getBoundingClientRect();
      const sRect = scroller.getBoundingClientRect();
      // Approval is "scrolled past" when its bottom is above the scroller's visible top.
      setVisible(tRect.bottom < sRect.top);
    }
    check();
    scroller.addEventListener("scroll", check);
    return () => scroller.removeEventListener("scroll", check);
  }, [scrollRef, approvalElementId, pendingCount]);

  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => {
        if (!approvalElementId) return;
        document
          .querySelector(`[data-approval-id="${approvalElementId}"]`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      style={{
        position: "absolute",
        bottom: 80,
        left: "50%",
        transform: "translateX(-50%)",
        background: COLORS.orange,
        color: COLORS.bg,
        border: "none",
        borderRadius: RADIUS.pill,
        padding: "6px 14px",
        fontSize: TYPE.scale.xs,
        fontWeight: TYPE.weight.semibold,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 6,
        zIndex: 5,
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <ArrowUp size={12} weight="bold" />
      {pendingCount} pending approval{pendingCount === 1 ? "" : "s"}
    </button>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ScrollPastPill.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ScrollPastPill.tsx
git commit -m "feat(chat): add ScrollPastPill for buried approvals

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5.3: Wire inline approval + pill into the pane

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx`

- [ ] **Step 1: Move approval rendering from "below messages" to "inside the message it belongs to"**

The current pane renders `<ApprovalCard>` at the end of the message list. Instead, render `<ChatApprovalCard>` *inside* the agent message body when that message corresponds to the run that requested approval. Approvals are linked to runs via `pendingApproval.runId`.

Update `MessageBody` to detect the approval-linked agent message:

```tsx
function MessageBody({
  message,
  runs,
  pendingApproval,
  onApprove,
  onReject,
  projectId,
  agentId,
  latestAssistantRef,
  onOptionClick,
}: {
  message: UIMessage;
  runs: RunView[];
  pendingApproval: PendingActionView | null | undefined;
  onApprove: (id: string, reason: string) => void | Promise<void>;
  onReject: (id: string, reason: string) => void | Promise<void>;
  projectId: string;
  agentId: string;
  latestAssistantRef: React.RefObject<HTMLDivElement | null>;
  onOptionClick: (value: string) => void;
}) {
  // Render parts as in Task 4.2.
  // Then, if this message has the same runId as the pending approval, render ChatApprovalCard.
  const messageRunId = (message.metadata as { runId?: string } | undefined)?.runId;
  const showApproval = pendingApproval && messageRunId && pendingApproval.runId === messageRunId;
  return (
    <>
      {/* Parts loop from Task 4.2 */}
      {showApproval && pendingApproval && (
        <ChatApprovalCard
          approval={pendingApproval}
          onApprove={(reason) => onApprove(pendingApproval.id, reason)}
          onReject={(reason) => onReject(pendingApproval.id, reason)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Remove the old `<ApprovalCard>` block from the pane**

The legacy bottom-anchored `<ApprovalCard>` rendering (under the messages map) is now redundant. Delete it.

- [ ] **Step 3: Render the `ScrollPastPill` inside the chat area**

Wrap the chat region in a positioned container so the pill can absolutely-position:

```tsx
<div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
  <ChatColumn scrollRef={scrollRef}>
    {/* messages + input */}
  </ChatColumn>
  <ScrollPastPill
    scrollRef={scrollRef}
    approvalElementId={pendingApproval?.id}
    pendingCount={pendingApproval && pendingApproval.status === "pending" ? 1 : 0}
  />
</div>
```

- [ ] **Step 4: Add imports**

```tsx
import { ChatApprovalCard } from "~/components/chat/ChatApprovalCard";
import { ScrollPastPill } from "~/components/chat/ScrollPastPill";
```

Remove the now-unused `ApprovalCard` import.

- [ ] **Step 5: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 6: Visual check**

Trigger an approval-requiring action (e.g., approve a tool that the policy gates). Screenshot → `.scratch/screenshots/phase-5-approval.png`.

**Expected:**
- Approval card renders inline below the agent message that requested it (orange-tinted, "Needs your call" label, pulsing dot, Approve/Skip buttons)
- After clicking Approve or Skip, the card collapses to a small green or gray chip in the same position
- Scrolling past the approval triggers a `↑ 1 pending approval` pill at the bottom of the column; clicking scrolls back

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): inline approvals + ScrollPastPill

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 6: Floating Connections Island

Adds the right-side floating island. Closed state ships first; expanded state ships in a follow-up task.

### Task 6.1: Plumb connections through to the pane

**Files:**
- Modify: `apps/web/src/routes/$projectId.agents.$agentId.tsx`
- Modify: `apps/web/src/components/AgentWorkspace.tsx`
- Modify: `apps/web/src/components/agent-chat-pane.tsx`

- [ ] **Step 1: Load connections in the route loader**

In `$projectId.agents.$agentId.tsx`, the loader already fetches `agent`, `runs`, `conversation`, `threads`. Add `listConnections`:

```ts
// In the loader function:
const connections = await listConnections({ data: { projectId } });
return {
  // existing fields…
  connections,
};
```

Confirm `listConnections` is imported from `~/server/connections`. If the loader already loads connections at a higher route (e.g., the `$projectId` parent), pass them down via `Route.useRouteContext()` or similar instead.

- [ ] **Step 2: Parse the connections in the route component**

```ts
const initialConnections = parseConnectionViews(loaderData.connections);
```

Pass into `<AgentWorkspace connections={initialConnections} …/>`.

- [ ] **Step 3: Thread connections through `AgentWorkspace` to `AgentChatPane`**

Add `connections: ConnectionView[]` to both components' props. Workspace passes them to the chat pane when rendering the `chat` tab.

- [ ] **Step 4: Accept connections in `agent-chat-pane.tsx`**

```tsx
interface AgentChatPaneProps {
  // existing props
  connections: ConnectionView[];
}
```

- [ ] **Step 5: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/routes/\$projectId.agents.\$agentId.tsx apps/web/src/components/AgentWorkspace.tsx apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): thread connections prop through route → workspace → chat pane

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.2: Create `ConnectionsIsland` (closed state only)

**Files:**
- Create: `apps/web/src/components/chat/ConnectionsIsland.tsx`

- [ ] **Step 1: Write the closed-state component**

```tsx
// apps/web/src/components/chat/ConnectionsIsland.tsx
import { useState } from "react";
import { COLORS, MOTION, RADIUS, SPACE, TYPE } from "~/lib/colors";
import type { ConnectionView } from "~/lib/types";

interface ConnectionsIslandProps {
  connections: ConnectionView[];
  projectId: string;
}

const CLOSED_WIDTH = 220;
const EXPANDED_WIDTH = 340;

export function ConnectionsIsland({ connections, projectId }: ConnectionsIslandProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeId ? connections.find((c) => c.id === activeId) ?? null : null;

  return (
    <aside
      style={{
        flexShrink: 0,
        width: active ? EXPANDED_WIDTH : CLOSED_WIDTH,
        background: COLORS.cardRaised,
        border: `1px solid ${COLORS.borderStrong}`,
        boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.04)",
        borderRadius: RADIUS.lg,
        padding: `${SPACE[3]}px ${SPACE[3]}px`,
        margin: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[3]}px 0`,
        transition: `width 220ms cubic-bezier(0.16, 1, 0.3, 1)`,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontSize: TYPE.scale.xs,
          color: COLORS.textDim,
          fontWeight: TYPE.weight.semibold,
          textTransform: "uppercase",
          letterSpacing: TYPE.tracking.wide,
          marginBottom: SPACE[2],
        }}
      >
        Connections
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1 }}>
        {connections
          .filter((c) => c.status === "active")
          .map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveId(activeId === c.id ? null : c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `${SPACE[2]}px ${SPACE[2]}px`,
                background: activeId === c.id ? COLORS.accentSurface : "transparent",
                border: "none",
                borderRadius: RADIUS.md,
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                width: "100%",
                transition: `background ${MOTION.duration} ${MOTION.ease}`,
              }}
              onMouseEnter={(e) => {
                if (activeId !== c.id) e.currentTarget.style.background = COLORS.surfaceHover;
              }}
              onMouseLeave={(e) => {
                if (activeId !== c.id) e.currentTarget.style.background = "transparent";
              }}
            >
              <ConnLogo logo={c.logo} fallback={(c.providerName ?? c.provider).charAt(0).toUpperCase()} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: TYPE.scale.sm,
                    color: COLORS.text,
                    fontWeight: TYPE.weight.medium,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {c.providerName ?? c.provider}
                </div>
                {c.accountLabel && c.accountLabel !== c.connectedAccountId && (
                  <div
                    style={{
                      fontSize: TYPE.scale.xs,
                      color: COLORS.textDim,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.accountLabel}
                  </div>
                )}
              </div>
              <span style={{ width: 6, height: 6, borderRadius: 99, background: COLORS.green, flexShrink: 0 }} />
            </button>
          ))}
      </div>

      <div
        style={{
          marginTop: SPACE[2],
          paddingTop: SPACE[2],
          borderTop: `1px solid ${COLORS.border}`,
        }}
      >
        <a
          href={`/${projectId}`}
          style={{
            display: "block",
            textAlign: "center",
            fontSize: TYPE.scale.xs,
            color: COLORS.accent,
            fontWeight: TYPE.weight.medium,
            textDecoration: "none",
          }}
        >
          Manage in project →
        </a>
      </div>

      {active && (
        <div style={{ marginTop: SPACE[3], paddingTop: SPACE[3], borderTop: `1px solid ${COLORS.border}` }}>
          {/* Expanded detail content lands in Task 6.3 */}
          <div style={{ fontSize: TYPE.scale.xs, color: COLORS.textDim }}>
            Detail for {active.providerName ?? active.provider} — coming next task.
          </div>
        </div>
      )}
    </aside>
  );
}

function ConnLogo({ logo, fallback }: { logo: string | null | undefined; fallback: string }) {
  const [errored, setErrored] = useState(false);
  if (logo && !errored) {
    return (
      <img
        src={logo}
        alt=""
        width={20}
        height={20}
        loading="lazy"
        onError={() => setErrored(true)}
        style={{ width: 20, height: 20, borderRadius: 4, background: COLORS.bgRaised, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 20,
        height: 20,
        borderRadius: 4,
        background: COLORS.bgRaised,
        color: COLORS.accent,
        fontSize: 10,
        fontWeight: TYPE.weight.semibold,
        flexShrink: 0,
      }}
    >
      {fallback}
    </span>
  );
}
```

- [ ] **Step 2: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ConnectionsIsland.tsx
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/chat/ConnectionsIsland.tsx
git commit -m "feat(chat): add ConnectionsIsland (closed state)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.3: Create `ConnectionDetail` (expanded content)

**Files:**
- Create: `apps/web/src/components/chat/ConnectionDetail.tsx`
- Modify: `apps/web/src/components/chat/ConnectionsIsland.tsx`

- [ ] **Step 1: Write `ConnectionDetail`**

```tsx
// apps/web/src/components/chat/ConnectionDetail.tsx
import { X } from "@phosphor-icons/react";
import { COLORS, RADIUS, SPACE, TYPE } from "~/lib/colors";
import { formatRelativeTime } from "~/lib/time-format";
import type { ConnectionView } from "~/lib/types";

interface ConnectionDetailProps {
  connection: ConnectionView;
  otherConnections: ConnectionView[];
  projectId: string;
  onClose: () => void;
  onSelectOther: (id: string) => void;
}

export function ConnectionDetail({
  connection,
  otherConnections,
  projectId,
  onClose,
  onSelectOther,
}: ConnectionDetailProps) {
  const isHealthy = connection.status === "active";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE[3], minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: SPACE[2] }}>
        <DetailLogo
          logo={connection.logo}
          fallback={(connection.providerName ?? connection.provider).charAt(0).toUpperCase()}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: TYPE.scale.base,
              color: COLORS.text,
              fontWeight: TYPE.weight.semibold,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {connection.providerName ?? connection.provider}
          </div>
          {connection.accountLabel && connection.accountLabel !== connection.connectedAccountId && (
            <div
              style={{
                fontSize: TYPE.scale.xs,
                color: COLORS.textDim,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              Account · {connection.accountLabel}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          style={{
            background: "transparent",
            border: "none",
            color: COLORS.textDim,
            cursor: "pointer",
            padding: 4,
            display: "grid",
            placeItems: "center",
          }}
        >
          <X size={14} weight="bold" />
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <DetailRow k="Status">
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: isHealthy ? COLORS.green : COLORS.red }}>
            <span
              style={{ width: 6, height: 6, borderRadius: 99, background: isHealthy ? COLORS.green : COLORS.red }}
            />
            {isHealthy ? "Healthy" : "Disconnected"}
          </span>
        </DetailRow>
        <DetailRow k="Connected">{formatRelativeTime(connection.createdAt)}</DetailRow>
        {connection.connector && <DetailRow k="Routed by">{connection.connector === "composio" ? "Composio" : "Direct"}</DetailRow>}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <a
          href={`/${projectId}/callback/composio?provider=${encodeURIComponent(connection.provider)}`}
          style={{
            flex: 1,
            background: COLORS.accent,
            border: "none",
            borderRadius: RADIUS.md,
            padding: "7px 12px",
            color: COLORS.white,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.semibold,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Reconnect
        </a>
        <a
          href={`/${projectId}`}
          style={{
            flex: 1,
            background: "transparent",
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            padding: "7px 12px",
            color: COLORS.text,
            fontSize: TYPE.scale.xs,
            fontWeight: TYPE.weight.medium,
            cursor: "pointer",
            fontFamily: "inherit",
            textDecoration: "none",
            textAlign: "center",
          }}
        >
          Open in project
        </a>
      </div>

      {otherConnections.length > 0 && (
        <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: SPACE[2] }}>
          <div
            style={{
              fontSize: TYPE.scale.xs,
              color: COLORS.textDim,
              fontWeight: TYPE.weight.semibold,
              textTransform: "uppercase",
              letterSpacing: TYPE.tracking.wide,
              marginBottom: 6,
            }}
          >
            Other connections
          </div>
          {otherConnections.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectOther(c.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: `${SPACE[2]}px ${SPACE[2]}px`,
                background: "transparent",
                border: "none",
                borderRadius: RADIUS.md,
                cursor: "pointer",
                width: "100%",
                textAlign: "left",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.surfaceHover)}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <DetailLogo logo={c.logo} fallback={(c.providerName ?? c.provider).charAt(0).toUpperCase()} small />
              <span style={{ fontSize: TYPE.scale.sm, color: COLORS.text, fontWeight: TYPE.weight.medium }}>
                {c.providerName ?? c.provider}
              </span>
              <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 99, background: c.status === "active" ? COLORS.green : COLORS.red }} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DetailRow({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: TYPE.scale.xs }}>
      <span style={{ color: COLORS.textDim }}>{k}</span>
      <span style={{ color: COLORS.text }}>{children}</span>
    </div>
  );
}

function DetailLogo({ logo, fallback, small = false }: { logo: string | null | undefined; fallback: string; small?: boolean }) {
  const size = small ? 18 : 28;
  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        style={{ width: size, height: size, borderRadius: 5, background: COLORS.bgRaised, objectFit: "contain", flexShrink: 0 }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 5,
        background: COLORS.bgRaised,
        color: COLORS.accent,
        fontSize: small ? 10 : 13,
        fontWeight: TYPE.weight.semibold,
        flexShrink: 0,
      }}
    >
      {fallback}
    </span>
  );
}
```

- [ ] **Step 2: Update `ConnectionsIsland` to render `ConnectionDetail` when expanded**

In `ConnectionsIsland.tsx`, replace the "Detail for ..." placeholder with:

```tsx
{active && (
  <div style={{ marginTop: SPACE[2] }}>
    <ConnectionDetail
      connection={active}
      otherConnections={connections.filter((c) => c.id !== active.id && c.status === "active")}
      projectId={projectId}
      onClose={() => setActiveId(null)}
      onSelectOther={(id) => setActiveId(id)}
    />
  </div>
)}
```

Also: when expanded, **hide the closed-state list** (the master-detail pattern shows EITHER the list OR the detail, with "other connections" inside the detail). Update the closed-state list render to be conditional on `!active`:

```tsx
{!active && (
  <>
    {/* list of connection rows + Manage link */}
  </>
)}
```

Add the import at the top of `ConnectionsIsland.tsx`:

```tsx
import { ConnectionDetail } from "~/components/chat/ConnectionDetail";
```

- [ ] **Step 3: TS + lint**

```bash
npx tsc --noEmit -p apps/web
npx biome check apps/web/src/components/chat/ConnectionDetail.tsx apps/web/src/components/chat/ConnectionsIsland.tsx
```

- [ ] **Step 4: Add ESC-to-close**

In `ConnectionsIsland.tsx`, add a `useEffect` that listens for ESC keypresses when `activeId !== null`:

```tsx
useEffect(() => {
  if (!activeId) return;
  function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") setActiveId(null);
  }
  document.addEventListener("keydown", onKey);
  return () => document.removeEventListener("keydown", onKey);
}, [activeId]);
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ConnectionDetail.tsx apps/web/src/components/chat/ConnectionsIsland.tsx
git commit -m "feat(chat): add ConnectionDetail + expand/collapse interaction

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.4: Wire the island into the pane

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx`

- [ ] **Step 1: Render the island next to the chat column**

Wrap the chat region in a flex row so chat + island sit side-by-side:

```tsx
<div style={{ position: "relative", flex: 1, display: "flex", minHeight: 0 }}>
  <ChatColumn scrollRef={scrollRef}>
    {/* messages + input */}
  </ChatColumn>
  <ScrollPastPill {...} />
  <ConnectionsIsland connections={connections} projectId={projectId} />
</div>
```

(The `ScrollPastPill`'s absolute positioning shouldn't be affected; verify after the change.)

- [ ] **Step 2: Add the import**

```tsx
import { ConnectionsIsland } from "~/components/chat/ConnectionsIsland";
```

- [ ] **Step 3: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 4: Visual check**

Reload chat tab. Screenshot → `.scratch/screenshots/phase-6-island.png`.

**Expected:**
- Floating island on the right side: rounded corners, raised surface, 12px gap from page edges
- "Connections" label at top
- Rows showing Google Ads + Search Console with status dots
- "Manage in project →" link at the bottom
- Clicking a row collapses the list and shows the detail view; clicking × or ESC returns to the list
- Chat column re-wraps when the island expands

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): mount ConnectionsIsland in chat tab

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6.5: Responsive drawer for narrow viewports

**Files:**
- Modify: `apps/web/src/components/chat/ConnectionsIsland.tsx`

- [ ] **Step 1: Add a window-width hook**

```tsx
function useViewportWidth(): number {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 1440);
  useEffect(() => {
    function onResize() {
      setW(window.innerWidth);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return w;
}
```

- [ ] **Step 2: Use the hook to switch between push-shrink and drawer-over modes**

Inside `ConnectionsIsland`:

```tsx
const viewportWidth = useViewportWidth();
const isNarrow = viewportWidth < 1100;

// When expanded AND narrow: position absolute, slide over chat.
const expandedDrawer = isNarrow && active;
```

Update the `<aside>` style:

```tsx
style={{
  flexShrink: 0,
  width: active ? EXPANDED_WIDTH : CLOSED_WIDTH,
  background: COLORS.cardRaised,
  // …other styles unchanged…

  ...(expandedDrawer
    ? {
        position: "absolute",
        top: SPACE[3],
        right: SPACE[3],
        bottom: SPACE[3],
        zIndex: 6,
      }
    : {
        position: "relative",
      }),
}}
```

- [ ] **Step 3: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 4: Visual check at narrow viewport**

In the browser, resize to ~1000px wide. Reload the chat tab. Open a connection. The expanded panel should slide over the chat rather than push it. Take a screenshot.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/chat/ConnectionsIsland.tsx
git commit -m "feat(chat): drawer-over-chat behavior for <1100px viewports

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Phase 7: Status Pill + Polish

Final cleanup: confirm status pill behavior, default tab, remove the deprecated Background run button, and final cleanup of the old `ApprovalCard` import path if unused.

### Task 7.1: Confirm status pill derivation

**Files:**
- Modify: `apps/web/src/components/agent-chat-pane.tsx` (only if status logic needs adjustment)

- [ ] **Step 1: Confirm `derivePaneStatus` (added in Task 1.4) covers all cases**

The function returns `"needs-you"` if a pending approval exists, `"running"` if any run is in `running` or `waiting_for_tasks`, else `"idle"`. Validate against the actual `runStatus` enum in `apps/web/src/lib/types.ts` — adjust if there are statuses like `queued` or `waiting_for_approval` that should also trigger `running` or `needs-you`.

```tsx
function derivePaneStatus(runs: RunView[], pendingApproval: PendingActionView | null | undefined): ChatStatus {
  if (pendingApproval && pendingApproval.status === "pending") return "needs-you";
  if (runs.some((r) => r.status === "waiting_for_approval")) return "needs-you";
  if (runs.some((r) => r.status === "running" || r.status === "waiting_for_tasks" || r.status === "queued")) return "running";
  return "idle";
}
```

- [ ] **Step 2: Visual check**

Trigger different states (idle, running, needs-you) and confirm the header pill updates. Screenshot each → `.scratch/screenshots/phase-7-status-{idle,running,needs-you}.png`.

- [ ] **Step 3: Commit if changed**

```bash
git add apps/web/src/components/agent-chat-pane.tsx
git commit -m "feat(chat): tighten status pill state mapping

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

(If no changes were needed, skip the commit.)

---

### Task 7.2: Default the agent detail tab to Chat

**Files:**
- Modify: `apps/web/src/routes/$projectId.agents.$agentId.tsx`

- [ ] **Step 1: Change the default-tab fallback**

In the route's search parser, the current default is whatever the existing code sets. Change it to `"chat"`:

```ts
const parsed = z
  .object({
    tab: z.enum(["runs", "chat", "learned", "settings"]).default("chat"),
    threadId: z.string().optional(),
  })
  .parse(search);
```

Adjust to match whatever validation pattern the route already uses (Zod or hand-rolled).

- [ ] **Step 2: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 3: Visual check**

Navigate to `/homescape/agents/3f75aba9-7e2` (no `?tab=...`). Should land directly on the Chat tab.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/routes/\$projectId.agents.\$agentId.tsx
git commit -m "feat(chat): default agent detail tab to Chat

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.3: Remove the "Background run" button

**Files:**
- Modify: `apps/web/src/components/AgentWorkspace.tsx` (or wherever the button lives)

- [ ] **Step 1: Locate the Background run button**

```bash
grep -rn "Background run" apps/web/src --include="*.tsx" --include="*.ts"
```

- [ ] **Step 2: Remove the button and any handlers it uniquely calls**

If a handler is shared with other surfaces, leave the handler and only remove the button render. If the handler is dead code after removal, delete it.

- [ ] **Step 3: TS check**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 4: Visual check**

Reload the agent detail page. No "Background run" button anywhere.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/AgentWorkspace.tsx
git commit -m "chore(chat): remove deprecated Background run button

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7.4: Final pass — lint, tsc, visual diff against spec

**Files:** No code changes; final verification.

- [ ] **Step 1: Full lint**

```bash
npx biome check apps/web/src/components/chat/ apps/web/src/components/agent-chat-pane.tsx
```

- [ ] **Step 2: Full TS**

```bash
npx tsc --noEmit -p apps/web
```

- [ ] **Step 3: Run all server + lib tests**

```bash
npm run test:web
```

Expected: all pass (including `chat-suggestions.test.ts`).

- [ ] **Step 4: Walk the verification checklist from the spec**

Open `docs/specs/2026-05-14-chat-tab-design.md` and confirm each of the 11 acceptance checks from the Verification section. Tick them off here:

- [ ] (1) Fresh thread shows hero with title, input, ≥3 suggestion cards
- [ ] (2) First message collapses hero, input docks to bottom
- [ ] (3) Header picker swaps threads without page reload
- [ ] (4) Run completes → compact card with working "Open full report" link
- [ ] (5) Approval renders inline; pill appears when scrolled past
- [ ] (6) Approve/Skip collapses card to chip in same position
- [ ] (7) Chat column flexes; message content stays within spec'd widths
- [ ] (8) Connections island is a floating card (12px radius, raised surface, 18px gap)
- [ ] (9) Click row expands 220 → 340px over ~220ms; chat re-wraps
- [ ] (10) Viewports <1100px get drawer-over behavior
- [ ] (11) No left rail. No "Background run" button.

- [ ] **Step 5: Final screenshot bundle**

Take screenshots of: empty thread, active thread mid-flow with run card, active thread with pending approval, island closed, island expanded, narrow viewport drawer state. Save under `.scratch/screenshots/final-*.png`.

- [ ] **Step 6: Commit any final fixes from the verification walk-through**

If you discovered issues in Step 4 that needed code changes, commit them now.

```bash
git add -A
git commit -m "fix(chat): final pass adjustments from verification walk-through

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Done

All seven phases complete. The chat tab now matches the spec:

- No left rail; threads in header dropdown
- Centered chat column with asymmetric message styling
- Hero empty state with skill-driven suggestions
- Compact run cards with link to full report
- Inline approvals with scroll-past pill
- Floating connections island with master/detail expansion
- Status pill in header
- Chat is the default agent detail tab

Each phase is independently shippable. The chat data layer (`useAgentChatFlow`, server endpoints) was not modified — only the presentation layer.
