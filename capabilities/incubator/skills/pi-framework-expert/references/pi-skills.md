# pi-coding-agent Skills

Skills are markdown files that extend agent behavior with specialized knowledge, workflows, and instructions. They follow the [Agent Skills](https://agentskills.io/specification) standard.

## Discovery

Skills are found at two locations:

| Location | Scope | Loaded as |
|----------|-------|-----------|
| `~/.pi/agent/skills/` | Global (all projects) | `source: "user"` |
| `.pi/skills/` (relative to cwd) | Project-local | `source: "project"` |

Additional paths via `--skill <path>` CLI flag, `settings.json` `skills` array, or `skillPaths` in `loadSkills()`.

**Directory structure:**
```
.pi/skills/
├── my-skill.md              # Root-level .md files loaded directly
└── product-discovery/        # Subdirectories must have SKILL.md
    ├── SKILL.md              # Required — name must match directory
    └── references/           # Optional — loaded via read tool
        └── card-schemas.md
```

- Subdirectories: only `SKILL.md` is discovered (one skill per dir)
- Root-level `.md` files are loaded directly as skills
- Directories starting with `.` and `node_modules` are skipped
- Symlinks are followed, broken symlinks skipped
- `.gitignore` / `.ignore` patterns respected

## Format

```markdown
---
name: product-discovery
description: Guide PMs through product discovery — ask questions, synthesize directions, select themes. Use when a new project is created or setup is needed.
---

# Product Discovery

Instructions for the agent here...
```

**Required frontmatter:**
- `name`: 1-64 chars, lowercase a-z, 0-9, hyphens. Must match parent directory name.
- `description`: 1-1024 chars. This is the primary trigger — the agent sees it in the system prompt and decides whether to load the full content.

**Optional frontmatter:**
- `disable-model-invocation`: `true` → hidden from system prompt, only invoked via `/skill:name`
- `allowed-tools`: Space-delimited pre-approved tools
- `license`, `compatibility`, `metadata`: informational

## How Loading Works

**Two-phase loading (progressive disclosure):**

1. **Phase 1 (always):** `name` + `description` injected into system prompt as XML. Lightweight — the agent sees all available skills.
2. **Phase 2 (on-demand):** When the agent decides a skill is relevant, it uses the `read` tool to load the full SKILL.md content. References in subdirectories are loaded the same way.

This means:
- Full skill content does NOT bloat every prompt
- The `description` field is critical — it determines when the agent loads the skill
- The `read` tool must be available (skills are skipped if read tool is disabled)

## Programmatic Usage

```typescript
import { loadSkills } from "@mariozechner/pi-coding-agent";

const { skills, diagnostics } = loadSkills({
  cwd: process.cwd(),
  agentDir: "~/.pi/agent",
  skillPaths: ["/custom/path"],
  includeDefaults: true,  // Include ~/.pi/agent/skills and .pi/skills
});

// Skills are automatically picked up by createAgentSession when cwd has .pi/skills/
const { session } = await createAgentSession({
  cwd: workspacePath,  // .pi/skills/ in this dir will be discovered
  // ...
});
```

## Name Collisions

If two skills share a name (e.g., global and project-local), the first one discovered wins (global loads first). A warning is issued.

## Skill Commands

Users can explicitly invoke skills:
```
/skill:product-discovery
/skill:product-discovery with additional context
```

## SYSTEM.md

Not a skill, but related: `.pi/SYSTEM.md` (project-local) and `~/.pi/agent/SYSTEM.md` (global) are loaded directly into the system prompt on every turn. Use for always-present instructions (agent identity, project context). Use skills for on-demand specialized knowledge.

| | SYSTEM.md | Skills |
|---|---|---|
| **Loading** | Always in system prompt | On-demand via read tool |
| **Use for** | Agent identity, base behavior | Specialized workflows, domain knowledge |
| **Context cost** | Every turn | Only when relevant |
