---
name: pi-extensions-expert
description: Use when building or using pi-coding-agent extensions, working with the subagent orchestration system, or configuring agent definitions
---

# pi-extensions-expert

Reference guide for the **pi-coding-agent extension system** — plugins that hook into agent events, register custom tools/commands/shortcuts, and orchestrate multi-agent workflows.

Extensions live at `~/.pi/agent/extensions/*.ts` (global) or `.pi/extensions/*.ts` (project-local). Can also load via CLI: `pi -e ./extension.ts`. Directory extensions (with `index.ts`) can have their own `package.json`.

## Extension Skeleton

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

export default function (pi: ExtensionAPI) {
  // Subscribe to events, register tools/commands/shortcuts
}
```

## Event Lifecycle

```
session_start (once)
  └─ input → before_agent_start → agent_start
       └─ turn_start
            ├─ message_start → message_update → message_end
            ├─ tool_call → tool_execution_start → tool_execution_update → tool_execution_end → tool_result
            └─ turn_end
  └─ agent_end
  └─ (optional) auto_compaction_start → auto_compaction_end
  └─ session_shutdown (once)
```

See **pi-framework-expert** `references/event-payloads.md` for exact event shapes.

## Extension API Surface

```typescript
interface ExtensionAPI {
  registerTool(config: ToolConfig): void;
  setActiveTools(toolNames: string[]): void;
  registerCommand(name: string, config: CommandConfig): void;
  registerShortcut(key: string, config: ShortcutConfig): void;
  registerFlag(name: string, config: FlagConfig): void;
  registerProvider(name: string, config: ProviderConfig): void;
  on(event: string, handler: (event, ctx: ExtensionContext) => void): void;
  sendUserMessage(content: string): void;
  exec(command: string, args?: string[]): Promise<ExecResult>;
}

interface ExtensionContext {
  cwd: string;
  hasUI: boolean;
  model?: Model;
  sessionManager: SessionManager;
  ui: ExtensionUIContext;  // select, confirm, input, notify, setStatus, setWidget
}
```

`ctx.ui.select()` / `ctx.ui.confirm()` / `ctx.ui.input()` block until user responds. See `references/extension-ui-context.md` for full interface.

## Custom Messages in Extensions

Extensions can inject structured messages via `sendCustomMessage()` — rendered as rich UI but filtered out of LLM context. See **pi-framework-expert** `references/custom-messages.md` for the interface and examples.

## Common Patterns

**Block dangerous commands:**
```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "bash" && event.input.command?.includes("rm -rf")) {
    const ok = await ctx.ui.confirm("Dangerous!", "Allow rm -rf?");
    if (!ok) return { block: true, reason: "Blocked by user" };
  }
});
```

**Register custom tools:**
```typescript
pi.registerTool({
  name: "deploy",
  label: "Deploy",
  description: "Deploy to an environment",
  parameters: Type.Object({ env: Type.String() }),
  async execute(toolCallId, params, signal, onUpdate, ctx) {
    onUpdate?.({ content: [{ type: "text", text: `Deploying to ${params.env}...` }] });
    const result = await pi.exec("deploy.sh", [params.env], { signal });
    return { content: [{ type: "text", text: result.stdout }], details: { exitCode: result.code } };
  },
});
```

**Override built-in tools** — register with the same name to replace:
```typescript
pi.registerTool({ name: "read", /* custom logic, then delegate to original */ });
```

**Commands and shortcuts:**
```typescript
pi.registerCommand("stats", { handler: async (args, ctx) => { ctx.ui.notify("..."); } });
pi.registerShortcut("ctrl+shift+d", { handler: async (ctx) => { /* ... */ } });
```

## Shipped Extensions

Located at `examples/extensions/` in pi-coding-agent. Copy to `~/.pi/agent/extensions/` to enable.

| Extension | Purpose |
|-----------|---------|
| `subagent/` | **Multi-agent orchestration** — spawns isolated `pi` subprocesses. See `references/subagent-orchestration.md` |
| `plan-mode.ts` | Read-only exploration with `/plan` or `Ctrl+Alt+P` |
| `permission-gate.ts` | Confirm before dangerous bash |
| `protected-paths.ts` | Block writes to .env, .git/, node_modules/ |
| `sandbox/` | OS-level sandboxing (macOS/Linux) |
| `preset.ts` | Named presets for model/tools/thinking |
| `handoff.ts` | Transfer context to new session (`/handoff <goal>`) |
| `todo.ts` | Todo list with state persistence |
| `git-checkpoint.ts` | Git stash checkpoints per turn |
| `ssh.ts` | Delegate tool operations to remote machine |
| `interactive-shell.ts` | Run interactive commands (vim, htop) |

## Resource Discovery

| Resource | Global | Project-local |
|----------|--------|---------------|
| Extensions | `~/.pi/agent/extensions/` | `.pi/extensions/` |
| Agents | `~/.pi/agent/agents/*.md` | `.pi/agents/*.md` |
| Presets | `~/.pi/agent/presets.json` | `.pi/presets.json` |

## References

| File | When to read |
|------|-------------|
| `references/subagent-orchestration.md` | Building multi-agent workflows, agent definitions, execution modes |
| `references/extension-ui-context.md` | Using select/confirm/input dialogs in extensions |
