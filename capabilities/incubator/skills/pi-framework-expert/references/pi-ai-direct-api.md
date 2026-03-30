# pi-ai Direct API Reference

## Source Files

- Types: `@mariozechner/pi-ai/dist/types.d.ts`
- Stream functions: `@mariozechner/pi-ai/dist/stream.d.ts`
- Anthropic provider: `@mariozechner/pi-ai/dist/providers/anthropic.d.ts`

## Functions

```typescript
// Streaming — iterate events as they arrive
export function stream<TApi extends Api>(model: Model<TApi>, context: Context, options?: ProviderStreamOptions): AssistantMessageEventStream;

// Non-streaming — returns full response
export function complete<TApi extends Api>(model: Model<TApi>, context: Context, options?: ProviderStreamOptions): Promise<AssistantMessage>;

// With thinking level support
export function streamSimple<TApi extends Api>(model: Model<TApi>, context: Context, options?: SimpleStreamOptions): AssistantMessageEventStream;
export function completeSimple<TApi extends Api>(model: Model<TApi>, context: Context, options?: SimpleStreamOptions): Promise<AssistantMessage>;
```

## Core Types

```typescript
interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}

interface UserMessage {
  role: "user";
  content: string | (TextContent | ImageContent)[];
  timestamp: number;
}

interface AssistantMessage {
  role: "assistant";
  content: (TextContent | ThinkingContent | ToolCall)[];
  api: Api;
  provider: string;
  model: string;
  stopReason: StopReason;
  errorMessage?: string;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } };
  timestamp: number;
}

type StopReason = "stop" | "length" | "toolUse" | "error" | "aborted";
```

## Stream Event Types

```typescript
type AssistantMessageEvent =
  | { type: "start"; partial: AssistantMessage }
  | { type: "text_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "text_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "text_end"; contentIndex: number; content: string; partial: AssistantMessage }
  | { type: "toolcall_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "toolcall_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "toolcall_end"; contentIndex: number; toolCall: ToolCall; partial: AssistantMessage }
  | { type: "thinking_start"; contentIndex: number; partial: AssistantMessage }
  | { type: "thinking_delta"; contentIndex: number; delta: string; partial: AssistantMessage }
  | { type: "thinking_end"; contentIndex: number; partial: AssistantMessage }
  | { type: "done"; reason: StopReason; message: AssistantMessage }
  | { type: "error"; error: string; reason: "aborted" | "error"; message: AssistantMessage };
```

**Note:** Event names use `toolcall_*` (no underscore between tool and call) and `done`/`error` (not `end`).

## Stream Options

```typescript
interface ProviderStreamOptions {
  apiKey?: string;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
  cacheRetention?: "short" | "long";  // Anthropic: 5min default, 1hr with "long"
  temperature?: number;
  maxTokens?: number;
}

interface SimpleStreamOptions extends ProviderStreamOptions {
  reasoning?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}
```

## Usage Example

```typescript
import { getModel, stream } from "@mariozechner/pi-ai";

const model = getModel("anthropic", "claude-sonnet-4-6");

const s = stream(model, {
  messages: [{ role: "user", content: "Generate JSON: { name, age }", timestamp: Date.now() }],
});

let fullText = "";
for await (const event of s) {
  if (event.type === "text_delta") fullText += event.delta;
}

const finalMessage = await s.result();  // AssistantMessage with usage stats
console.log(finalMessage.usage);
```

## Performance

- `stream()` from pi-ai: ~1s TTFT (direct Anthropic API call)
- `session.prompt()` from pi-coding-agent: ~25s TTFT (agent loop overhead)
- Use pi-ai directly for stateless one-shot calls (JSON generation, summaries, classification)
- Use pi-coding-agent sessions for multi-turn chat, tool use, and persistent conversations
