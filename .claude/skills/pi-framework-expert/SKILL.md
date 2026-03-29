---
name: pi-framework-expert
description: Use when writing code with pi-mono packages (pi-ai, pi-agent-core, pi-coding-agent), building agents, or debugging agent behavior like tool execution, steering, follow-up, or background agent patterns
---

# pi-framework-expert

Reference guide for `@mariozechner/pi-*` TypeScript agent framework. Three packages: **pi-ai** (LLM API), **pi-agent-core** (agent runtime), **pi-coding-agent** (coding session with built-in tools).

For extensions and subagent orchestration, see **pi-extensions-expert**.

## Package Selection

| Scenario | Use |
|---|---|
| One-shot JSON, summaries, classification | `stream()` / `complete()` from pi-ai (~1s TTFT) |
| Multi-turn chat with history | `createAgentSession()` with cached sessions |
| Agent with tools (bash, read, edit) | `createAgentSession()` with built-in tools (~25s TTFT) |

## pi-ai — LLM API

```typescript
import { getModel, stream, complete } from "@mariozechner/pi-ai";
const model = getModel("anthropic", "claude-sonnet-4-6");

const s = stream(model, {
  messages: [{ role: "user", content: "Generate JSON", timestamp: Date.now() }],
});
for await (const event of s) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}
```

See `references/pi-ai-direct-api.md` for full types, stream events, and options.

## pi-agent-core — Agent Runtime

```typescript
import { Agent } from "@mariozechner/pi-agent-core";
const agent = new Agent({ initialState: { systemPrompt, model, tools, thinkingLevel } });
agent.subscribe((e) => { /* handle events */ });
await agent.prompt("Do the thing");

agent.steer(msg);     // Interrupt mid-turn, skip remaining tools
agent.followUp(msg);  // Queue for after turn ends (does NOT restart loop)
```

**AgentTool interface:**
```typescript
interface AgentTool<TParams, TDetails = any> {
  name: string;
  label: string;
  description: string;
  parameters: TParams;     // TypeBox or plain JSON Schema
  execute: (toolCallId: string, params: Static<TParams>, signal?: AbortSignal, onUpdate?) => Promise<AgentToolResult<TDetails>>;
}

interface AgentToolResult<T> {
  content: (TextContent | ImageContent)[];  // { type: "text", text: string }
  details: T;                                // side-channel data (not sent to LLM)
}
```

## pi-coding-agent — Session Layer

```typescript
import { createAgentSession, SessionManager } from "@mariozechner/pi-coding-agent";

const { session } = await createAgentSession({
  model,
  thinkingLevel: "off",
  tools: [],              // Default: codingTools [read, bash, edit, write]. Pass [] to disable.
  customTools: [myTool],  // Your ToolDefinition objects
  sessionManager: SessionManager.inMemory(),
  cwd: "/path/to/project",
});
session.subscribe((e) => { /* same event types */ });
await session.prompt("Do the thing");
session.dispose();  // Required cleanup!
```

**`ToolDefinition` vs `AgentTool`** — different `execute` signatures:
```typescript
// AgentTool (pi-agent-core)
execute: (toolCallId, params, signal?, onUpdate?) => Promise<AgentToolResult>
// ToolDefinition (pi-coding-agent) — extra ctx parameter
execute: (toolCallId, params, signal, onUpdate, ctx) => Promise<AgentToolResult>
```

**`systemPrompt`** — not in `createAgentSession` options. `session.systemPrompt` is a **read-only getter**. To set a custom system prompt, use `session._baseSystemPrompt = "..."` — the LLM sees this on the next `prompt()` call. Alternatively, prefix instructions to the first user prompt string.

- **Full Session API, SessionManager, PromptOptions**: See `references/agent-session.md`
- **Custom Messages (structured UI in chat)**: See `references/custom-messages.md`

## Built-in Tools

```typescript
import { codingTools, readOnlyTools, createCodingTools } from "@mariozechner/pi-coding-agent";

// Default tool sets
const { session } = await createAgentSession({ tools: codingTools });     // [read, bash, edit, write]
const { session } = await createAgentSession({ tools: readOnlyTools });   // [read, grep, find, ls]

// Custom working directory — use factory functions
const { session } = await createAgentSession({ cwd, tools: createCodingTools(cwd) });
```

Individual imports: `readTool, bashTool, editTool, writeTool, grepTool, findTool, lsTool` (and `create*` variants).

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Return raw string from tool | Always return `{ content: [{ type: "text", text }], details: {} }` |
| Expect followUp to trigger new turns | Call `prompt()` again to process queued followUp |
| Forget `session.dispose()` in pi-coding-agent | Always dispose sessions |
| Use `systemPrompt` in `createAgentSession` options | Set via `session._baseSystemPrompt = "..."`, or prefix to prompt string |
| Omit `tools` expecting no tools | Default is `codingTools`. Pass `[]` to disable. |
| Loose tool param schema (`data: {}`) | LLM may serialize as string. Parse at boundary. See `references/tool-design.md` |
| Assume parallel tool execution | pi-* is always sequential. Batch inside single tool. |
| Dump full bg result into followUp | Use lightweight notification + explicit check tool |

## Resource Discovery

| Resource | Global | Project-local |
|----------|--------|---------------|
| Settings | `~/.pi/agent/settings.json` | `.pi/settings.json` |
| System prompt | `~/.pi/agent/SYSTEM.md` | `.pi/SYSTEM.md` |
| Skills | `~/.pi/agent/skills/` | `.pi/skills/` |
| Prompts | `~/.pi/agent/prompts/` | `.pi/prompts/` |
| Context | walked from cwd up: `AGENTS.md`, `CLAUDE.md` | |

## References

| File | When to read |
|------|-------------|
| `references/agent-session.md` | Full AgentSession API, SessionManager, CreateAgentSessionOptions |
| `references/agent-patterns.md` | followUp/steer behavior, background agents, child agents, output capture |
| `references/tool-design.md` | Custom tool schemas, AJV coercion, argument parsing, structured output |
| `references/event-payloads.md` | Exact shapes of tool_execution_end, message_end, and other events |
| `references/pi-ai-direct-api.md` | pi-ai types, stream events, options |
| `references/custom-messages.md` | CustomMessage interface, progressive requirements pattern |
| `references/pi-skills.md` | Creating `.pi/skills/`, discovery, format, loading, SYSTEM.md vs skills |
