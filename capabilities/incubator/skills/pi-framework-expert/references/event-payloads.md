# Agent Event Payloads

Exact shapes of key events emitted by pi-agent-core and pi-coding-agent.

## Event Lifecycle

```
agent_start
  └─ turn_start
       ├─ message_start → message_update (streaming) → message_end
       ├─ tool_execution_start → tool_execution_update → tool_execution_end
       └─ turn_end
  └─ (more turns if tool calls continue)
agent_end
```

## tool_execution_end

The most important event for intercepting tool results (e.g., forwarding card data to a frontend).

```typescript
{
  type: "tool_execution_end";
  toolCallId: string;       // Matches the LLM's tool_use ID
  toolName: string;         // e.g., "present_card", "bash", "read"
  result: AgentToolResult;  // Direct pass-through from tool.execute()
  isError: boolean;
}

// result is exactly what execute() returned:
{
  content: (TextContent | ImageContent)[];
  details: T;  // Your custom details — e.g., { _card: true, cardType, data }
}
```

**Key insight:** `result` is NOT validated or transformed — it's the exact object from `tool.execute()`. Use `details` as a side-channel for structured data that shouldn't go to the LLM.

**Example — intercepting card events:**
```typescript
session.subscribe((e) => {
  if (e.type === "tool_execution_end" && !e.isError) {
    const details = e.result?.details;
    if (details?._card) {
      emitToFrontend({ type: "card", cardType: details.cardType, data: details.data });
    }
  }
});
```

## message_update

Fired during streaming for each text delta.

```typescript
{
  type: "message_update";
  assistantMessageEvent: {
    type: "text_delta";
    delta: string;           // The new text chunk
    contentIndex: number;
    partial: AssistantMessage;
  };
}
```

**Note:** `message_update` wraps pi-ai's `AssistantMessageEvent` in an `assistantMessageEvent` field. Don't look for `delta` directly on the event — drill into `e.assistantMessageEvent.delta`.

## message_end

Fired when the assistant finishes a message (may include text, tool calls, or thinking).

```typescript
{
  type: "message_end";
  message: {
    role: "assistant";
    content: (TextContent | ThinkingContent | ToolCall)[];
    // ... full AssistantMessage fields
  };
}
```

**Capturing output:**
```typescript
session.subscribe((e) => {
  if (e.type === "message_end") {
    const msg = e.message as any;
    if (msg?.role === "assistant") {
      for (const block of msg.content ?? []) {
        if (block.type === "text" && block.text?.trim()) {
          lastOutput = block.text;
        }
      }
    }
  }
});
```

**Guard:** `message_end` fires for ALL messages including non-text ones. Always check `block.type === "text"` before using.

## tool_execution_start

```typescript
{
  type: "tool_execution_start";
  toolCallId: string;
  toolName: string;
  input: Record<string, any>;  // The parsed arguments passed to the tool
}
```

## tool_execution_update

Fired when a tool calls `onUpdate()` during execution (e.g., streaming progress).

```typescript
{
  type: "tool_execution_update";
  toolCallId: string;
  toolName: string;
  update: AgentToolResult;  // Partial result from onUpdate callback
}
```

## turn_start / turn_end

```typescript
{ type: "turn_start" }
{ type: "turn_end" }
```

A turn = one LLM call + its tool executions. Multiple turns happen when tools trigger follow-up LLM calls.

## agent_start / agent_end

```typescript
{ type: "agent_start" }
{ type: "agent_end" }
```

Wraps the entire prompt → response cycle. One `prompt()` call = one agent_start/agent_end pair.
