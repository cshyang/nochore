# Claude Code Hooks

Automate actions in response to Claude Code events.

---

## Overview

Hooks are shell commands or scripts that execute automatically when specific events occur in Claude Code. Use hooks for:

- Validating tool usage before execution
- Logging and auditing
- Custom notifications
- Enforcing project standards

## Hook Events

| Event | When Triggered |
|-------|----------------|
| `PreToolUse` | Before a tool executes |
| `PostToolUse` | After a tool completes |
| `Stop` | When Claude finishes responding |
| `SubagentStop` | When a subagent completes |
| `SessionStart` | When session begins |
| `SessionEnd` | When session ends |
| `UserPromptSubmit` | When user submits a prompt |
| `PreCompact` | Before context compaction |
| `Notification` | When notification is sent |

## Hook Configuration

### Location

Hooks are configured in:
```
~/.claude/settings.json
# or
project/.claude/settings.json
```

### Basic Structure

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "/path/to/script.sh"
      }
    ]
  }
}
```

## PreToolUse Hooks

### Block Dangerous Commands

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -qE \"rm -rf|sudo|chmod 777\"; then echo \"BLOCK: Dangerous command\"; exit 1; fi'"
      }
    ]
  }
}
```

### Validate File Edits

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit",
        "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"package.json\"; then echo \"BLOCK: Cannot edit package.json\"; exit 1; fi'"
      }
    ]
  }
}
```

## PostToolUse Hooks

### Log Tool Usage

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "*",
        "command": "bash -c 'echo \"$(date): $TOOL_NAME\" >> ~/.claude/tool_log.txt'"
      }
    ]
  }
}
```

### Auto-format After Edit

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "command": "bash -c 'npx prettier --write \"$FILE_PATH\" 2>/dev/null || true'"
      }
    ]
  }
}
```

## Environment Variables

Hooks receive context through environment variables:

| Variable | Description | Events |
|----------|-------------|--------|
| `TOOL_NAME` | Name of the tool | PreToolUse, PostToolUse |
| `TOOL_INPUT` | Tool input (JSON) | PreToolUse |
| `TOOL_OUTPUT` | Tool output | PostToolUse |
| `FILE_PATH` | File being operated on | Edit, Write, Read |
| `SESSION_ID` | Current session ID | All |
| `WORKING_DIR` | Current working directory | All |

## Matchers

### Exact Match

```json
{
  "matcher": "Bash"
}
```

### Wildcard

```json
{
  "matcher": "*"
}
```

### Multiple Tools

```json
{
  "matcher": "Edit|Write|Bash"
}
```

## Hook Responses

### Allow (Default)

Return exit code 0:
```bash
exit 0
```

### Block

Return exit code 1 with message:
```bash
echo "BLOCK: Reason for blocking"
exit 1
```

### Modify (Advanced)

Output JSON to modify tool input:
```bash
echo '{"modified_input": "new value"}'
exit 0
```

## Example Hook Scripts

### validate-bash.sh

```bash
#!/bin/bash
# Block destructive commands

INPUT="$TOOL_INPUT"

# Check for dangerous patterns
if echo "$INPUT" | grep -qE 'rm -rf /|sudo rm|chmod -R 777|:(){ :|:& };:'; then
    echo "BLOCK: Potentially destructive command detected"
    exit 1
fi

# Check for secrets in commands
if echo "$INPUT" | grep -qE 'password=|api_key=|secret='; then
    echo "BLOCK: Possible secret in command"
    exit 1
fi

exit 0
```

### log-edits.sh

```bash
#!/bin/bash
# Log all file edits

LOG_FILE="$HOME/.claude/edit_log.txt"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Edit: $FILE_PATH" >> "$LOG_FILE"
exit 0
```

### notify-complete.sh

```bash
#!/bin/bash
# Send notification when task completes

# macOS notification
osascript -e 'display notification "Claude completed the task" with title "Claude Code"'

# Or use terminal-notifier
# terminal-notifier -title "Claude Code" -message "Task completed"

exit 0
```

## Prompt-Based Hooks

For complex validation, use AI-powered hooks:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "type": "prompt",
        "prompt": "Analyze this command for safety. If it could delete files, modify system settings, or expose secrets, respond with BLOCK and explain why. Otherwise respond with ALLOW.\n\nCommand: $TOOL_INPUT"
      }
    ]
  }
}
```

## Best Practices

### Keep Hooks Fast

- Hooks run synchronously
- Slow hooks delay Claude's response
- Target <100ms execution time

### Handle Errors Gracefully

```bash
#!/bin/bash
# Always handle errors
set -e

# Your logic here
do_something || {
    echo "Warning: Hook failed but allowing" >&2
    exit 0
}
```

### Use Specific Matchers

```json
// Good: Specific matcher
{ "matcher": "Bash" }

// Avoid: Catch-all for intensive operations
{ "matcher": "*" }
```

### Test Hooks Thoroughly

```bash
# Test hook script directly
TOOL_NAME="Bash" TOOL_INPUT='{"command": "ls"}' ./my-hook.sh
echo "Exit code: $?"
```

## Debugging Hooks

### Enable Verbose Logging

```bash
#!/bin/bash
exec 2>> ~/.claude/hook_debug.log
echo "$(date): Hook started" >&2
echo "TOOL_NAME: $TOOL_NAME" >&2
echo "TOOL_INPUT: $TOOL_INPUT" >&2

# Your logic here
```

### Check Hook Execution

```bash
# Watch hook log
tail -f ~/.claude/hook_debug.log
```

## Common Patterns

### Protect Sensitive Files

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "command": "bash -c 'if echo \"$FILE_PATH\" | grep -qE \"\\.env|credentials|secrets\"; then echo \"BLOCK: Protected file\"; exit 1; fi'"
      }
    ]
  }
}
```

### Require Confirmation for Destructive Actions

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "command": "bash -c 'if echo \"$TOOL_INPUT\" | grep -q \"git push --force\"; then echo \"BLOCK: Force push requires manual confirmation\"; exit 1; fi'"
      }
    ]
  }
}
```

### Auto-Lint After Changes

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit",
        "command": "bash -c 'if [[ \"$FILE_PATH\" == *.py ]]; then python -m black \"$FILE_PATH\" 2>/dev/null; fi'"
      }
    ]
  }
}
```
