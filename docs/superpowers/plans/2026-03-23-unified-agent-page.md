# Unified Agent Page — Create and Manage on One Surface

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge agent creation into the agent page itself. When creating a new agent, the user lands on the agent page (Overview tab) with the chat drawer open. Blueprint streaming populates the Overview in real-time. No separate SetupWorkspace page.

**Architecture:** The `/$projectId/agents/new` route creates a blank agent record and redirects to `/$projectId/agents/$agentId`. AgentWorkspace detects a "blank" agent (no description) and auto-opens the chat drawer in blueprint mode. The chat drawer handles both blueprint streaming (for new agents) and regular chat (for existing agents). Blueprint results update agent config via server function, then reload.

**Tech Stack:** React, TypeScript, existing AgentWorkspace + ChatDrawer + OverviewPanel, NDJSON streaming

---

### File Map

- Modify: `apps/web/src/components/AgentWorkspace.tsx` — add blueprint mode to ChatDrawer, make OverviewPanel reactive
- Modify: `apps/web/src/routes/$projectId.agents.new.tsx` — create blank agent + redirect
- Modify: `apps/web/src/routes/$projectId.agents.$agentId.tsx` — pass availableSkills to AgentWorkspace
- Modify: `apps/web/src/server/agents.ts` — add updateAgentConfig server function
- Delete: `apps/web/src/components/SetupWorkspace.tsx` — no longer needed (delete AFTER everything works)

---

### Task 1: Route — Create Blank Agent and Redirect

**Files:**
- Modify: `apps/web/src/routes/$projectId.agents.new.tsx`
- Modify: `apps/web/src/server/agents.ts`

- [ ] **Step 1: Add createBlankAgent server function**

In `apps/web/src/server/agents.ts`, add a minimal function that creates an agent with an empty config:

```ts
export const createBlankAgent = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string }) => input)
  .handler(async ({ data: { projectId } }) => {
    const agentId = crypto.randomUUID().slice(0, 12);
    const { db } = getProjectDeps(projectId);
    const now = Date.now();
    const config = {
      name: "Untitled Agent",
      description: "",
      intent: "",
      skills: [],
      triggers: [],
      policyRules: [],
      globalApprovalRequired: false,
      scopeStrategy: "llm",
    };
    db.insert(agents)
      .values({
        id: agentId,
        projectId,
        config: JSON.stringify(config),
        status: "live",
        createdAt: now,
        updatedAt: now,
      })
      .run();
    return jsonSafe({ id: agentId });
  });
```

- [ ] **Step 2: Rewrite the new agent route to create + redirect**

Replace `$projectId.agents.new.tsx` entirely:

```tsx
import { createFileRoute, redirect } from "@tanstack/react-router";
import { createBlankAgent } from "~/server/agents";

export const Route = createFileRoute("/$projectId/agents/new")({
  loader: async ({ params }) => {
    const result = await createBlankAgent({ data: { projectId: params.projectId } });
    const agentId = (result as { id: string }).id;
    throw redirect({
      to: "/$projectId/agents/$agentId",
      params: { projectId: params.projectId, agentId },
    });
  },
});
```

- [ ] **Step 3: Verify route works**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | grep -i "agents.new\|createBlank" | head -10`

---

### Task 2: AgentWorkspace — Auto-Open Chat for New Agents

**Files:**
- Modify: `apps/web/src/components/AgentWorkspace.tsx`
- Modify: `apps/web/src/routes/$projectId.agents.$agentId.tsx`

- [ ] **Step 1: Pass availableSkills through to AgentWorkspace**

In `$projectId.agents.$agentId.tsx`, add `listAvailableSkills` to the loader and pass `availableSkills` as a prop to AgentWorkspace.

In AgentWorkspace, add `availableSkills` to the props interface:
```ts
export interface AgentWorkspaceProps {
  agent: AgentView;
  project: ProjectView;
  availableSkills?: Array<{ id: string; name: string; description: string }>;
  // ... existing props
}
```

- [ ] **Step 2: Auto-open chat drawer for blank agents**

In the AgentWorkspace main component, detect a blank agent and auto-open chat:

```ts
const isNewAgent = !agent.description && !agent.intent;

// Auto-open chat for new agents
useEffect(() => {
  if (isNewAgent) {
    setChatOpen(true);
  }
}, [isNewAgent]);
```

- [ ] **Step 3: Pass mode and skills to ChatDrawer**

Update the ChatDrawer rendering to pass a `mode` prop:

```tsx
{chatOpen && (
  <ChatDrawer
    agentId={agent.id}
    projectId={project.id}
    agentName={agent.name}
    mode={isNewAgent ? "blueprint" : "chat"}
    availableSkills={availableSkills}
    onBlueprintComplete={() => {
      // Reload the page to pick up the saved config
      window.location.reload();
    }}
    onClose={() => setChatOpen(false)}
  />
)}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

---

### Task 3: ChatDrawer — Blueprint Streaming Mode

**Files:**
- Modify: `apps/web/src/components/AgentWorkspace.tsx` (ChatDrawer function)
- Modify: `apps/web/src/server/agents.ts` (add updateAgentConfig)

This is the core task. The ChatDrawer needs to handle two modes:
1. **"chat" mode** (existing) — sends messages via `sendChat`, shows responses
2. **"blueprint" mode** (new) — streams to `/api/blueprint`, parses NDJSON, saves result via `updateAgentConfig`

- [ ] **Step 1: Add updateAgentConfig server function**

In `apps/web/src/server/agents.ts`:

```ts
export const updateAgentConfig = createServerFn({ method: "POST" })
  .inputValidator(
    (input: {
      agentId: string;
      projectId: string;
      name?: string;
      description?: string;
      skills?: string[];
      policyRules?: string[];
      globalApprovalRequired?: boolean;
      schedule?: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const { db } = getProjectDeps(data.projectId);
    const row = db.select().from(agents).where(eq(agents.id, data.agentId)).get();
    if (!row) throw new Error("Agent not found");

    const config = JSON.parse(row.config);
    if (data.name !== undefined) config.name = data.name;
    if (data.description !== undefined) config.description = data.description;
    if (data.skills !== undefined) config.skills = data.skills;
    if (data.policyRules !== undefined) config.policyRules = data.policyRules;
    if (data.globalApprovalRequired !== undefined) config.globalApprovalRequired = data.globalApprovalRequired;
    if (data.schedule !== undefined) {
      config.triggers = data.schedule === "manual" ? [] : [{ type: "cron", config: { cron: scheduleToCron(data.schedule) } }];
    }

    db.update(agents)
      .set({ config: JSON.stringify(config), updatedAt: Date.now() })
      .where(eq(agents.id, data.agentId))
      .run();

    return jsonSafe({ updated: true });
  });

function scheduleToCron(schedule: string): string {
  switch (schedule) {
    case "hourly": return "0 */1 * * *";
    case "6hours": return "0 */6 * * *";
    case "daily": return "0 9 * * *";
    case "weekly": return "0 9 * * 1";
    default: return "0 9 * * *";
  }
}
```

- [ ] **Step 2: Update ChatDrawer props and add blueprint mode**

Update ChatDrawer's props:

```ts
function ChatDrawer({
  agentId,
  projectId,
  agentName,
  mode = "chat",
  availableSkills = [],
  onBlueprintComplete,
  onClose,
}: {
  agentId: string;
  projectId: string;
  agentName: string;
  mode?: "chat" | "blueprint";
  availableSkills?: Array<{ id: string; name: string; description: string }>;
  onBlueprintComplete?: () => void;
  onClose: () => void;
})
```

- [ ] **Step 3: Add blueprint streaming handler**

Add a `handleBlueprintSend` function inside ChatDrawer that:
1. Sends the user's intent to `/api/blueprint` as a POST
2. Streams the NDJSON response
3. Shows reasoning/text/tool-status in chat messages
4. When blueprint is received, calls `updateAgentConfig` to save it
5. Calls `onBlueprintComplete()` to trigger a reload

Port the streaming logic from SetupWorkspace's `submitBlueprint` callback. Key difference: instead of setting editable state (agentName, agentSummary, selectedSkills), call `updateAgentConfig` with the blueprint data.

```ts
const handleBlueprintSend = async (text: string) => {
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content: text,
    createdAt: new Date(),
  };
  setMessages((prev) => [...prev, userMsg]);
  setInput("");
  setSending(true);

  try {
    const res = await fetch("/api/blueprint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intent: text,
        availableSkills: availableSkills.map((s) => ({
          id: s.id, name: s.name, description: s.description,
        })),
      }),
    });

    if (!res.ok || !res.body) throw new Error("Blueprint generation failed");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastBlueprint: Record<string, unknown> | null = null;
    let textAccumulator = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed._type === "text") {
            textAccumulator += parsed.text ?? "";
          } else if (parsed._type === "blueprint") {
            const { _type, ...bp } = parsed;
            lastBlueprint = bp;
          }
        } catch { /* skip unparseable */ }
      }
    }

    if (lastBlueprint) {
      // Save blueprint to DB
      const { updateAgentConfig } = await import("~/server/agents");
      await updateAgentConfig({
        data: {
          agentId,
          projectId,
          name: (lastBlueprint.agentName as string) || "Untitled Agent",
          description: (lastBlueprint.summary as string) || "",
          skills: (lastBlueprint.skills as string[]) || [],
          schedule: (lastBlueprint.trigger as { schedule?: string })?.schedule || "manual",
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I've set up **${lastBlueprint!.agentName}**. The overview shows your agent's configuration — adjust anything you'd like.`,
          createdAt: new Date(),
        },
      ]);

      onBlueprintComplete?.();
    } else if (textAccumulator.trim()) {
      // AI asked a question — show it
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: textAccumulator.trim(),
          createdAt: new Date(),
        },
      ]);
    }
  } catch (err) {
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Something went wrong generating the blueprint. Please try again.",
        createdAt: new Date(),
      },
    ]);
  } finally {
    setSending(false);
  }
};
```

- [ ] **Step 4: Update handleSend to route by mode**

In the existing `handleSend` function, add mode routing at the top:

```ts
const handleSend = async (text?: string) => {
  const content = (text ?? input).trim();
  if (!content || sending) return;

  if (mode === "blueprint") {
    return handleBlueprintSend(content);
  }

  // ... existing chat logic unchanged
};
```

- [ ] **Step 5: Update placeholder and quick actions for blueprint mode**

Change the input placeholder based on mode:
```ts
placeholder={mode === "blueprint" ? "What should this agent do?" : "Ask your agent anything..."}
```

Update quick actions based on mode:
```ts
const quickActions = mode === "blueprint"
  ? ["Monitor Google Ads for budget waste", "Research articles and publish to WordPress", "Track competitor pricing changes"]
  : ["Explain last run", "What should I review?", "Run analysis now"];
```

- [ ] **Step 6: Update drawer header for blueprint mode**

```ts
<div style={{ fontSize: 14, fontWeight: 600, color: COLORS.text, fontFamily: '"Satoshi", sans-serif' }}>
  {mode === "blueprint" ? "Set up your agent" : `Chat with ${agentName}`}
</div>
<div style={{ fontSize: 12, color: COLORS.textDim, marginTop: 2, fontFamily: '"General Sans", sans-serif' }}>
  {mode === "blueprint" ? "Describe what you want — I'll configure it" : "Ask anything about your campaigns"}
</div>
```

- [ ] **Step 7: Skip chat history loading in blueprint mode**

In the `useEffect` that loads chat history, skip it for blueprint mode:
```ts
useEffect(() => {
  if (mode === "blueprint") {
    setLoading(false);
    return;
  }
  getChatHistory({ data: { agentId, projectId, limit: 50 } })
    .then(...)
    .catch(...);
}, [agentId, projectId, mode]);
```

- [ ] **Step 8: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

---

### Task 4: Delete SetupWorkspace

**Files:**
- Delete: `apps/web/src/components/SetupWorkspace.tsx`
- Verify: no remaining imports reference it

- [ ] **Step 1: Search for SetupWorkspace imports**

```bash
grep -r "SetupWorkspace" apps/web/src/ --include="*.tsx" --include="*.ts"
```

The only reference should be in the old `$projectId.agents.new.tsx` which was already rewritten in Task 1. If other files reference it, update them.

- [ ] **Step 2: Delete SetupWorkspace.tsx**

```bash
rm apps/web/src/components/SetupWorkspace.tsx
```

- [ ] **Step 3: Verify it compiles**

Run: `cd apps/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: unified agent page — create and manage on one surface

Merge agent creation into the agent page itself. When navigating to
'new agent', a blank agent is created and the user lands on the agent
page with the chat drawer open in blueprint mode. Blueprint streaming
populates the agent config in real-time. No separate SetupWorkspace.

- Add createBlankAgent server function
- Add updateAgentConfig server function
- ChatDrawer supports blueprint + chat modes
- Auto-open chat for new agents (no description)
- Delete SetupWorkspace.tsx (~1600 lines removed)"
```
