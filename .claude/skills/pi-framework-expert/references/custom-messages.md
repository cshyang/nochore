# CustomMessages Reference

## Source Files

- Message types: `@mariozechner/pi-coding-agent/dist/core/messages.d.ts`
- Session API: `@mariozechner/pi-coding-agent/dist/core/agent-session.d.ts`

## CustomMessage Interface

```typescript
interface CustomMessage<T = unknown> {
  role: "custom";
  customType: string;     // e.g. "select_direction", "confirm_guardrails", "pick_theme"
  content: string | (TextContent | ImageContent)[];  // display text
  display: boolean;       // show in chat UI
  details?: T;            // arbitrary structured data
  timestamp: number;
}
```

## Session API

```typescript
// Send a custom message into the conversation
session.sendCustomMessage<T>(
  message: { customType: string; content: string | ContentBlock[]; display: boolean; details?: T },
  options?: {
    triggerTurn?: boolean;         // Trigger an LLM response immediately
    deliverAs?: "steer" | "followUp" | "nextTurn";  // How to inject into conversation
  }
): Promise<void>;

// Send a plain user message with delivery control
session.sendUserMessage(
  content: string | ContentBlock[],
  options?: { deliverAs?: "steer" | "followUp" }
): Promise<void>;
```

**Delivery modes:**
| Mode | Effect |
|---|---|
| `"steer"` | Injects mid-turn, interrupts current tool execution |
| `"followUp"` | Queues for after current turn completes |
| `"nextTurn"` | Queues for the next `prompt()` call |

## Behavior

- Custom messages are **visible in the chat UI** (when `display: true`)
- Custom messages are **filtered out of LLM context** — they don't pollute the conversation
- The client renders each `customType` as a rich UI component
- User responses are fed back via `session.steer()` or `session.sendUserMessage()`

## Pattern: Progressive Requirements Collection

Instead of upfront wizards/forms, the agent collects requirements conversationally via CustomMessages.

```
Agent turn 1:
  → sendCustomMessage({ customType: "confirm_guardrails", details: { guardrails: [...] } })
  → User reviews, edits, confirms
  → session.steer("User confirmed guardrails: [...]")

Agent turn 2:
  → sendCustomMessage({ customType: "select_direction", details: { options: [...] } })
  → User picks direction B
  → session.steer("User selected direction B: Guided Flow")

Agent turn 3:
  → Starts building with confirmed guardrails + selected direction
  → Mid-build, needs auth decision
  → sendCustomMessage({ customType: "select_option", details: { question: "Auth flow?", options: [...] } })
  → User picks "magic_link"
  → session.steer("User selected: magic_link")
```

## Example: Multiple Choice Question

```typescript
session.sendCustomMessage({
  customType: "select_option",
  content: "Which auth flow should we use?",
  display: true,
  details: {
    options: [
      { id: "magic_link", label: "Magic link", description: "Email-based, passwordless" },
      { id: "oauth", label: "OAuth (Google/GitHub)", description: "Social login" },
      { id: "email_pass", label: "Email + password", description: "Traditional auth" },
    ],
  },
});
```

## Example: Confirmation Card

```typescript
session.sendCustomMessage({
  customType: "confirm_summary",
  content: "Here's my interpretation of your product idea.",
  display: true,
  details: {
    briefTitle: "Invoice Builder",
    briefSummary: "SaaS invoicing for freelancers...",
    guardrails: ["Keep workflow under 2 minutes", "Mobile-first"],
    actions: ["confirm", "refine", "restart"],
  },
});
```

## Example: Design Token Picker

```typescript
session.sendCustomMessage({
  customType: "pick_theme",
  content: "What visual direction fits your brand?",
  display: true,
  details: {
    current: { color: "blue", radius: "md", font: "system" },
    presets: [
      { name: "Clean", color: "slate", radius: "sm", font: "sans" },
      { name: "Warm", color: "amber", radius: "lg", font: "serif" },
    ],
  },
});
```

## Client-Side Rendering

The client maps `customType` to React components:

```typescript
function renderCustomMessage(msg: CustomMessage) {
  switch (msg.customType) {
    case "select_option": return <OptionCards details={msg.details} onSelect={handleSelect} />;
    case "confirm_summary": return <SummaryCard details={msg.details} onConfirm={handleConfirm} />;
    case "pick_theme": return <ThemePicker details={msg.details} onChange={handleThemeChange} />;
    default: return <p>{msg.content}</p>;
  }
}
```
