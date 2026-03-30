# ExtensionUIContext Reference

## Source Files

- UI types: `@mariozechner/pi-coding-agent/dist/core/extensions/types.d.ts`
- Dialog options: same file

## ExtensionUIContext Interface

```typescript
interface ExtensionUIContext {
  // Interactive dialogs — block until user responds
  select(title: string, options: string[], opts?: ExtensionUIDialogOptions): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: ExtensionUIDialogOptions): Promise<boolean>;
  input(title: string, placeholder?: string, opts?: ExtensionUIDialogOptions): Promise<string | undefined>;

  // Non-blocking UI
  notify(message: string): void;
  setStatus(text: string): void;
  setWidget(component: any): void;  // Custom React/Ink component
}

interface ExtensionUIDialogOptions {
  // Options vary by dialog type — check source for latest
}
```

## Accessed via ExtensionContext

```typescript
pi.on("tool_call", async (event, ctx: ExtensionContext) => {
  // ctx.ui.select(), ctx.ui.confirm(), ctx.ui.input()
  const choice = await ctx.ui.select("Pick one", ["Option A", "Option B", "Option C"]);
  const confirmed = await ctx.ui.confirm("Proceed?", "This will deploy to production.");
  const name = await ctx.ui.input("Project name", "my-project");
});
```

## Behavior

- `select()` returns the selected string, or `undefined` if cancelled
- `confirm()` returns `true`/`false`
- `input()` returns the entered string, or `undefined` if cancelled
- All three block the extension handler until the user responds
- `notify()` shows a non-blocking toast/notification
- `setStatus()` updates a persistent status line
- `setWidget()` renders a custom component (interactive mode only)

## Extension UI vs CustomMessages

| | ExtensionUIContext | CustomMessages |
|---|---|---|
| **Scope** | Extension hooks only | Any session code |
| **Persistence** | Ephemeral dialog, not in chat history | Persisted in chat history |
| **Rendering** | Built-in select/confirm/input dialogs | Custom UI per `customType` |
| **Use when** | Extension needs quick user confirmation | Agent needs structured decision from user |
| **LLM visibility** | Not visible to LLM | Filtered out of LLM context |

For CustomMessages (structured messages in chat for rich UI), see `pi-framework-expert/references/custom-messages.md`.
