# Skill Development Guide

Create custom skills to extend Claude Code capabilities.

---

## Skill Structure

```
skills/
└── my-skill/
    ├── SKILL.md              # Required: Main skill file
    └── references/           # Optional: Supporting documentation
        ├── patterns.md
        └── examples.md
    └── scripts/              # Optional: Executable utilities
        └── validate.sh
    └── assets/               # Optional: Templates, images
        └── template.md
```

## SKILL.md Format

### Required: YAML Frontmatter

```yaml
---
name: my-skill
description: This skill should be used when the user asks to "do X", "perform Y", or mentions "keyword Z". Provide specific trigger phrases.
version: 1.0.0
---
```

### Description Best Practices

**Good:**
```yaml
description: This skill should be used when the user asks to "analyze campaign performance", "check ad metrics", "review campaign data", or mentions client names like "Homescape" or "DMP".
```

**Bad:**
```yaml
description: Use this skill for campaigns.  # Too vague, wrong person
description: Helps with advertising stuff.   # No trigger phrases
```

### Body Content

Write in **imperative form** (verb-first):

**Good:**
```markdown
## Workflow

1. Read the configuration file
2. Validate the input data
3. Generate the report
```

**Bad:**
```markdown
## Workflow

1. You should read the configuration file
2. You need to validate the input data
3. You can generate the report
```

## Progressive Disclosure

### Level 1: Always Loaded (Description)
- ~100 words max
- Specific trigger phrases
- Third person ("This skill should be used when...")

### Level 2: Loaded When Triggered (SKILL.md Body)
- 1,500-2,000 words ideal
- Core workflows and quick reference
- Pointers to reference files

### Level 3: Loaded As Needed (References)
- Unlimited size
- Detailed documentation
- Examples and edge cases

## Reference Files

### When to Use References

Move content to `references/` when:
- Detailed patterns (>500 words on a topic)
- Comprehensive examples
- API documentation
- Edge cases and troubleshooting

### Referencing in SKILL.md

```markdown
## Additional Resources

### Reference Files

- **`references/patterns.md`** - Common implementation patterns
- **`references/troubleshooting.md`** - Error resolution guide

### Scripts

- **`scripts/validate.sh`** - Validate configuration
```

## Example: Simple Skill

```yaml
---
name: format-json
description: This skill should be used when the user asks to "format JSON", "prettify JSON", "validate JSON structure", or needs to work with JSON files.
version: 1.0.0
---

# JSON Formatter

Format and validate JSON files.

## Usage

Format a JSON file:
```bash
cat file.json | python -m json.tool > formatted.json
```

Validate JSON:
```bash
python -c "import json; json.load(open('file.json'))"
```

## Common Issues

| Issue | Solution |
|-------|----------|
| Trailing comma | Remove comma before `}` or `]` |
| Single quotes | Replace with double quotes |
| Unquoted keys | Add quotes around keys |
```

## Example: Complex Skill

```yaml
---
name: api-client
description: This skill should be used when the user asks to "call API", "make HTTP request", "fetch data from endpoint", "test API endpoint", or needs to interact with REST APIs.
version: 1.0.0
---

# API Client

Make HTTP requests and test API endpoints.

## Quick Reference

| Method | Use Case |
|--------|----------|
| GET | Retrieve data |
| POST | Create resource |
| PUT | Update resource |
| DELETE | Remove resource |

## Basic Requests

### GET Request
```bash
curl -X GET "https://api.example.com/users" \
  -H "Authorization: Bearer $TOKEN"
```

### POST Request
```bash
curl -X POST "https://api.example.com/users" \
  -H "Content-Type: application/json" \
  -d '{"name": "John", "email": "john@example.com"}'
```

## Additional Resources

### Reference Files

- **`references/authentication.md`** - Auth patterns (OAuth, JWT, API keys)
- **`references/error-handling.md`** - Status codes and error responses
```

## Skill Location

### Project-Level Skills

```
project/
└── .windsurf/skills/      # or .claude/skills/
    └── my-skill/
        └── SKILL.md
```

### Global Skills

```
~/.claude/skills/
└── my-skill/
    └── SKILL.md
```

## Testing Skills

### Verify Structure

1. Check SKILL.md exists with valid frontmatter
2. Verify description has trigger phrases
3. Confirm referenced files exist

### Test Triggering

Ask questions that should trigger the skill:
- Use exact phrases from description
- Mention keywords
- Describe the use case

### Iterate

1. Use the skill on real tasks
2. Note where it struggles
3. Update SKILL.md or add references
4. Test again

## Validation Checklist

**Structure:**
- [ ] SKILL.md exists with YAML frontmatter
- [ ] `name` and `description` fields present
- [ ] Body content is substantial

**Description:**
- [ ] Uses third person ("This skill should be used when...")
- [ ] Includes specific trigger phrases
- [ ] Lists concrete scenarios

**Content:**
- [ ] Uses imperative form (verb-first)
- [ ] Body is focused (<3,000 words)
- [ ] References are documented
- [ ] All referenced files exist

**Progressive Disclosure:**
- [ ] Core info in SKILL.md
- [ ] Details in references/
- [ ] Resources properly referenced
