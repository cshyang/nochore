# AgentSession API Reference

## CreateAgentSessionOptions

| Option | Type | Default | Notes |
|---|---|---|---|
| `cwd` | `string` | `process.cwd()` | Working directory for tools |
| `model` | `Model<any>` | Auto-resolved | LLM model |
| `thinkingLevel` | `ThinkingLevel` | — | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh"` |
| `tools` | `Tool[]` | `codingTools` | **Defaults to [read, bash, edit, write] if omitted.** Pass `[]` to disable all. |
| `customTools` | `ToolDefinition[]` | `[]` | Your custom tool definitions |
| `sessionManager` | `SessionManager` | — | See SessionManager section below |
| `authStorage` | `AuthStorage` | `AuthStorage.create()` | API key storage |
| `modelRegistry` | `ModelRegistry` | — | Model resolution |
| `scopedModels` | `Array<{ model, thinkingLevel? }>` | — | Per-scope model overrides |
| `resourceLoader` | `ResourceLoader` | — | Custom resource loading |
| `settingsManager` | `SettingsManager` | — | Settings persistence |
| `agentDir` | `string` | `~/.pi/agent` | Agent config directory |

## AgentSession Class

```typescript
class AgentSession {
  // State
  readonly agent: Agent;
  state: AgentState;
  model: Model<any> | undefined;
  thinkingLevel: ThinkingLevel;
  systemPrompt: string;           // getter only — set via _baseSystemPrompt
  messages: AgentMessage[];
  isStreaming: boolean;
  sessionId: string;
  sessionFile: string | undefined;

  // Events
  subscribe(listener: (e: AgentSessionEvent) => void): () => void;

  // Prompting
  prompt(text: string, options?: PromptOptions): Promise<void>;

  // Message injection
  steer(text: string): void;                        // Interrupt mid-turn
  followUp(text: string): void;                     // Queue for after turn
  sendUserMessage(content: string | ContentBlock[],
    options?: { deliverAs?: "steer" | "followUp" }): Promise<void>;
  sendCustomMessage<T>(
    message: { customType: string; content: string | ContentBlock[]; display: boolean; details?: T },
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" }
  ): Promise<void>;

  // Control
  abort(): Promise<void>;                           // Cancel in-flight prompt
  dispose(): void;                                  // Required cleanup

  // Tool management
  getActiveToolNames(): string[];
  getAllTools(): ToolInfo[];
  setActiveToolsByName(toolNames: string[]): void;

  // Model management
  setModel(model: Model<any>): Promise<void>;
  setThinkingLevel(level: ThinkingLevel): void;

  // Session management
  newSession(options?): Promise<boolean>;
  reload(): Promise<void>;
  clearQueue(): { steering: string[]; followUp: string[] };
  pendingMessageCount: number;
}
```

## PromptOptions

```typescript
interface PromptOptions {
  images?: ImageContent[];
  streamingBehavior?: "steer" | "followUp";   // Required when prompting during streaming
  expandPromptTemplates?: boolean;            // Default: true
  source?: InputSource;
}
```

## SessionManager

```typescript
// Factory methods — choose one for createAgentSession
SessionManager.inMemory()                           // Ephemeral, no persistence
SessionManager.create(cwd, sessionDir?)             // New persistent JSONL session
SessionManager.open(path, sessionDir?)              // Open specific JSONL file
SessionManager.continueRecent(cwd, sessionDir?)     // Resume most recent session
SessionManager.forkFrom(path, cwd, sessionDir?)     // Branch from existing session

// Query methods
SessionManager.list(cwd, sessionDir?): Promise<SessionInfo[]>
SessionManager.listAll(): Promise<(SessionInfo & { cwd: string })[]>
```

Session entries stored as **append-only JSONL** with tree structure (`id` + `parentId`). Crash-safe: at most one line lost. Auto-compaction when approaching context limits.
