# Agent Behavioral Patterns

## Table of Contents

1. [Sequential Tool Execution](#sequential-tool-execution)
2. [followUp vs steer](#followup-vs-steer)
3. [Background Agent Pattern](#background-agent-pattern)
4. [Capturing Agent Output](#capturing-agent-output)
5. [Creating Child Agents](#creating-child-agents)
6. [Structured Output](#structured-output)

## Sequential Tool Execution

pi-* executes tools **sequentially** — hardcoded `for` loop with `await` in the agent loop. No config to change this.

**Impact:** Models that try to fan out (spawn 5+ parallel agents) pay devastating cost. The model doesn't know execution is sequential.

**Workaround:** Batch tools — e.g., `analyze_documents` accepting an array, running `Promise.all` internally.

## followUp vs steer

| | steer | followUp |
|---|---|---|
| **Delivery** | After current tool completes | After entire turn completes |
| **Effect** | Skips remaining queued tools | Does not interrupt |
| **Use case** | User correction mid-flight | Background result delivery |

**Critical:** `followUp()` does NOT restart the agent loop.

```
prompt() → agent loop runs → followUp queued → agent loop ends → prompt() returns
                                                                  ↑ followUp sits here
```

To process a queued followUp, call `prompt()` again:
```typescript
await session.prompt("original task");
// followUp was queued by a background process...
await session.prompt("Process the notification above.");  // This picks up the followUp
```

## Background Agent Pattern

The LLM never auto-ingests background output. Use lightweight notification + explicit fetch:

```typescript
// In spawn_agent tool — start child, return immediately
const task = { result: "", status: "running", promise: null };
task.promise = child.prompt(childPrompt).then(() => {
  task.result = capturedChildOutput;
  task.status = "complete";
  parentSession.followUp("[NOTIFICATION] Background task bg-1 completed.");
});
return { content: [{ type: "text", text: `Started bg-1.` }], details: {} };

// In check_agent tool — explicit fetch
if (task.status === "complete") return { content: [{ type: "text", text: task.result }], details: {} };
await task.promise;  // Block if still running
return { content: [{ type: "text", text: task.result }], details: {} };
```

**Anti-pattern:** Dumping full result (27K chars) into followUp. Bloats context, model may miss it.

## Capturing Agent Output

Subscribe to events and capture assistant text from `message_end`:

```typescript
let capturedOutput = "";
agent.subscribe((e) => {
  if (e.type === "message_end") {
    const msg = e.message as any;
    if (msg?.role === "assistant" && msg.content) {
      for (const block of msg.content) {
        if (block.type === "text" && block.text?.trim()) capturedOutput = block.text;
      }
    }
  }
});
```

## Creating Child Agents

**pi-agent-core** (no dispose needed):
```typescript
const child = new Agent({ initialState: { systemPrompt: "...", model, tools } });
await child.prompt(taskPrompt);
```

**pi-coding-agent** (dispose required):
```typescript
const { session: child } = await createAgentSession({
  model, thinkingLevel: "off",
  tools: [], customTools: [tool1, tool2],
  sessionManager: SessionManager.inMemory(),
});
// Option A: Set system prompt via internal property (LLM sees this on next prompt)
child._baseSystemPrompt = childInstructions;
await child.prompt(taskPrompt);
// Option B: Prefix instructions to the prompt string
await child.prompt(`${childInstructions}\n\n${taskPrompt}`);
child.dispose();  // Required!
```

**Note:** `session.systemPrompt` is a read-only getter. Use `session._baseSystemPrompt = "..."` to override the system prompt, or prefix instructions to the user prompt string.

## Structured Output

pi-* has no structured output API (see [pi-mono#1086](https://github.com/badlogic/pi-mono/issues/1086)). The recommended approach: **use a tool the agent must call**, not constrained text output.

Pattern:
- Child produces full result, tool stores it in closure variable
- Tool returns only a summary ("Analysis complete: 5 docs, 57 decisions")
- Parent confirms completion in a short response
- Display uses stored result, not parent's output

**Anti-pattern:** Returning full JSON as tool result → parent re-generates same 22K chars (wasted tokens + ~100-200s).

See also `references/tool-design.md` for schema design and argument parsing details.
