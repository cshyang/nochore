# Subagent Orchestration Reference

**Source:** `examples/extensions/subagent/` (index.ts, agents.ts, agents/*.md)

Spawns a separate `pi` process per task with isolated context. The child runs `pi --mode json -p --no-session`, stdout parsed as JSON events.

## Three Execution Modes

**Single** — one agent, one task:
```json
{ "agent": "scout", "task": "Find the auth implementation" }
```

**Parallel** — up to 8 tasks, concurrency limit of 4:
```json
{
  "tasks": [
    { "agent": "scout", "task": "Search models" },
    { "agent": "scout", "task": "Search providers" }
  ]
}
```

**Chain** — sequential, `{previous}` placeholder carries output forward:
```json
{
  "chain": [
    { "agent": "scout", "task": "Find auth code" },
    { "agent": "planner", "task": "Plan refactor based on: {previous}" }
  ]
}
```

## Agent Definitions

Agents are markdown files discovered from:
- **User agents:** `~/.pi/agent/agents/*.md` (default scope)
- **Project agents:** `.pi/agents/*.md` (requires `agentScope: "both"` + confirmation)

```markdown
---
name: scout
description: Fast codebase recon
tools: read, grep, find, ls, bash
model: claude-haiku-4-5
---

You are a scout. Quickly investigate and return structured findings...
```

Frontmatter: `name` (required), `description` (required), `tools` (comma-separated), `model` (override).

## Shipped Example Agents

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| `scout` | haiku | read, grep, find, ls, bash | Fast codebase recon |
| `planner` | sonnet | read, grep, find, ls | Implementation plans (read-only) |
| `reviewer` | sonnet | read, grep, find, ls, bash | Code review, quality/security |
| `worker` | sonnet | (all) | General-purpose execution |

## How It Runs

1. Finds agent config by name from discovered agents
2. Builds CLI args: `["--mode", "json", "-p", "--no-session"]` + optional `--model`, `--tools`
3. If agent has system prompt, writes to temp file → `--append-system-prompt <tempfile>`
4. Appends task as: `Task: ${task}`
5. Spawns `pi` with `stdio: ["ignore", "pipe", "pipe"]`
6. Parses stdout JSON line-by-line, captures `message_end` and `tool_result_end` events
7. Aggregates usage stats (tokens, cost, turns)
8. Streams partial results via `onUpdate` callback
9. Returns final output via `getFinalOutput(messages)`

## Design Details

- **Abort:** SIGTERM → 5s grace → SIGKILL
- **Temp cleanup:** System prompt files cleaned in `finally` block
- **Chain errors:** Stops at first failure (nonzero exit, error/aborted stopReason)
- **Parallel progress:** Tracks `allResults[]` with `-1` exitCode for running tasks
- **Concurrency:** Worker pool with `mapWithConcurrencyLimit(items, 4, fn)`

## Subagent vs In-Memory Child Sessions

| | Subagent Extension | `createAgentSession` (in-memory) |
|---|---|---|
| **Isolation** | Separate OS process | Same process, shared memory |
| **Communication** | stdout JSON events | Direct function calls, events |
| **Context** | Fully isolated window | Shares process memory |
| **Configuration** | Markdown files (zero TS) | TypeScript code |
| **Cleanup** | Process exit + temp files | `session.dispose()` |
| **Use when** | Production orchestration, agent reuse | Experiments, tight coupling |

## Limitations

- **One-shot delegation only** — no persistent background workers or mid-flight interaction
- **No spawn+check pattern** — tool blocks until completion (streaming, but blocking)
- **Subprocess overhead** — heavier than in-memory, simpler isolation
- **Requires `pi` CLI** — agents run as `pi` processes, not library calls

To evolve into spawn_agent/check_agent: persistent child process, agent registry (`agentId → { proc, buffers, status }`), stdin/RPC for follow-up prompts, kill_agent for cleanup.
