# Composio Integration Simplification

**Date:** 2026-03-28
**Status:** Draft
**Supersedes:** Static tool capability registry in `packages/harness/src/connections/capabilities.ts`

## Problem

The current Composio integration has 6 layers of abstraction:

1. `capabilities.ts` — 250 lines of static tool definitions (schemas, slugs, descriptions)
2. `composio.ts` → `buildAgentToolSet()` — wraps static defs in AI SDK `tool()`
3. `agent-runtime.ts` → `buildEffectiveToolConfig()` — merges agent config with defaults
4. `agent-runtime.ts` → `buildRuntimeTools()` — re-wraps every tool with approval modes
5. `agent-run.ts` — passes double-wrapped tools to `generateText()`
6. `executeComposioTool()` — calls back to Composio to execute

Meanwhile, Composio's SDK already provides `session.tools()` which returns AI SDK-ready tools with one call. We rebuilt what the SDK already does, and the agent can't even use the tools because the static definitions may not match what's actually available on Composio's platform.

## Design

Replace the 6-layer stack with Composio's native Tool Router pattern:

```
Setup time (UI):
  session.toolkits() → show connection status → user connects providers →
  user sets approval mode per provider → saved to agent config

Runtime (agent run):
  composio.create(userId, { toolkits }) → session.tools(modifiers) → generateText()
```

### Runtime Flow (agent-run.ts)

```typescript
const composio = new Composio({
  apiKey: process.env.COMPOSIO_API_KEY,
  provider: new VercelProvider(),
});

// Toolkits come from agent's active connections
const connectedToolkits = runtime.activeProviders; // ["googleads", "gmail"]

const session = await composio.create(runtime.userId, {
  toolkits: connectedToolkits,
});

// Approval gate via modifiers
const tools = await session.tools({
  beforeExecute: ({ toolSlug, params }) => {
    const mode = agent.toolConfig.approvalModes[toolSlug] ?? "auto";
    if (mode === "approval") {
      // Trigger wait.forToken flow (existing approval mechanism)
    }
    logger.info(`Tool executing: ${toolSlug}`, { params });
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    logger.info(`Tool completed: ${toolSlug}`, {
      success: result.successful,
    });
    return result;
  },
});

const result = await generateText({
  model,
  system: promptBundle.system,
  messages,
  tools,
  stopWhen: stepCountIs(10),
});
```

### Data Model Change

Current `agent.toolConfig`:
```typescript
{
  requiredProviders: [{ provider: "googleads", reason: "..." }],
  tools: {
    googleads_campaign_performance: {
      toolName, slug, provider, title, description,
      mode, enabled, approvalMode
    },
    // ... 10+ entries with full schemas
  }
}
```

New `agent.toolConfig`:
```typescript
{
  connectedToolkits: ["googleads", "gmail"],
  approvalMode: "auto" | "approval",  // provider-level default
  toolOverrides: {
    // optional per-tool overrides (phase 2 UI)
    "GOOGLEADS_PAUSE_KEYWORD": "approval",
  }
}
```

### UI: Tools Tab

**Connection management** — uses `session.toolkits()` to show:
- Provider name, logo, connection status (from Composio)
- Connect/Disconnect button (existing OAuth flow)
- Provider-level approval toggle: "Auto" or "Requires approval"

**Per-tool overrides** (progressive enhancement, not MVP):
- Expandable section per provider showing individual tools
- Toggle per tool to override provider default

### What Gets Deleted

| File | What | Lines |
|------|------|-------|
| `packages/harness/src/connections/capabilities.ts` | Static tool definitions, schemas | ~250 |
| `packages/harness/src/connections/composio.ts` | `buildAgentToolSet()`, `executeComposioTool()` | ~50 |
| `services/worker/src/lib/agent-runtime.ts` | `buildRuntimeTools()`, `buildEffectiveToolConfig()`, `getEffectiveToolEntry()`, `buildDefaultToolConfig()` | ~60 |

**Total: ~360 lines deleted**

### What Gets Added

| File | What | Lines (est.) |
|------|------|-------------|
| `services/worker/src/lib/composio-session.ts` | `createAgentSession()` — creates session, returns tools with modifiers | ~40 |
| `agent-run.ts` | Replace `buildRuntimeTools()` call with `createAgentSession()` | ~10 (net change) |

**Total: ~50 lines added**

### What Stays

- `createComposioClient()` — still needed to initialize SDK
- `getComposioUserId()` — user isolation pattern
- `sendApprovalNotification()` — notification flow (uses CLI-style execution)
- `evaluatePolicy()` — deterministic policy engine for approval decisions
- `wait.forToken` approval flow in agent-run.ts — unchanged
- `connections` table in DB — tracks which providers are connected per project

### Migration

1. Existing agents with `toolConfig.tools` entries: the old shape is ignored; runtime uses `connectedToolkits` from active connections
2. `requiredProviders` array: replaced by `connectedToolkits` (derived from DB connections, not config)
3. Approval modes: default to "auto" for all existing agents (preserves current behavior since static tools were all "auto")

## What This Fixes

1. **"Google Ads tools not available"** — tools come directly from Composio's session, not our static registry. If the connection is active on Composio, the tools work.
2. **Schema drift** — no more maintaining Zod schemas that may not match Composio's actual API.
3. **Double-wrapping** — tools go straight from `session.tools()` to `generateText()`.
4. **Trigger.dev logging** — `beforeExecute`/`afterExecute` modifiers log tool execution to trigger.dev natively.
