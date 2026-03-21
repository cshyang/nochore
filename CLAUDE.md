# Nochore

A general-purpose agent platform where AI agents replace traditional functions. Agents have reasoning (LLM), skills (domain knowledge), tools (actions via Composio), and policy/guardrails. The name means "no more chores" — automate the boring stuff.

## Repository Structure

```
apps/web/         → TanStack Start frontend (the product UI)
services/         → Backend services (empty — future harness/API)
legacy/           → Campaign CLI (Python, being absorbed into platform)
docs/             → Product design docs (philosophy, UX, plans)
docs/archive/     → Superseded artifacts (original prototype.jsx)
.impeccable.md    → Design context (cross-cutting)
```

### Apps

**`apps/web/`** — TanStack Start (React 19, Vite 7, TypeScript). Run with:
```bash
cd apps/web && npm run dev  # → http://localhost:3000
```

Route structure matches the UX navigation model:
- `/` → Homepage (full-screen lobby, no sidebar)
- `/$projectId` → Project workspace (sidebar appears)
- `/$projectId/agents/$agentId` → Agent detail (5 tabs: Monitor/Feed/Chat/Memory/Settings)
- `/$projectId/agents/new` → Setup flow

Key directories inside `apps/web/src/`:
- `routes/` — TanStack Router file-based routes (thin wrappers)
- `components/` — 16 UI components migrated from prototype
- `lib/colors.ts` — Design tokens (source of truth: `.impeccable.md`)
- `lib/types.ts` — Shared TypeScript interfaces
- `lib/mock.ts` — Mock data (will become API calls via router loaders)

## Key Documents

- `docs/philosophy.md` — **The north star.** Core thesis, four pillars (Intent/Skills/Tools/Policy), six design axioms, two audiences, architecture overview, integration & credential architecture, competitive learnings from Relay.app, policy model, knowledge model. Read this first.
- `docs/ux-moments.md` — UX design document. Three moments (Setup, Found Something, Getting Smarter), two-mode navigation (full-screen lobby → project workspace with sidebar), wireframes.
- `docs/archive/prototype.jsx` — Original monolithic React prototype (~1700 lines). Superseded by `apps/web/`.

## Architecture Concepts

- **Four Pillars**: Intent (the why), Skills (know/reason), Tools (do), Policy (must/must not)
- **Projects**: Context boundary grouping agents that share tools, memory, and data scope
- **Skills consume data types, not tool outputs** — harness resolves which tool provides which data type
- **Policy tiers**: Action-type defaults → threshold-based tiers → per-action overrides
- **Composio**: Handles OAuth/credentials for 500+ app integrations; our Connection Manager adds context, health, permissions, rate limiting on top

## Open Design Questions (Next Topics)

These are ordered by priority — Tier 1 blocks implementation:

### Tier 1 — Must resolve before writing code
1. **Harness Layer internals** — How does an agent actually run? Scope resolution, execution pipeline, LLM injection points vs deterministic code
2. **SDK contracts** — What does a Skill, Policy, and Action look like in code? Typed interfaces for extension builders
3. **Memory schema** — How agents store/query history, what's a "lesson", how memory compounds across a project

### Tier 2 — Must resolve before multi-tool scenarios
4. **Policy composition** — Conflict resolution when policies disagree
5. **Data type → tool resolution** — When multiple tools provide the same data type, who wins?
6. **Connection Manager health protocol** — Polling, failure modes, token expiry handling

### Tier 3 — Can iterate later
7. **Marketplace** — Extension discovery, trust, ratings
8. **Economics** — Token cost model, pricing tiers

## Legacy: Campaign CLI

The original Campaign CLI lives in `legacy/`. It's a working ads analytics tool and may become the first "skill" built on the Nochore platform.

```bash
cd legacy
campaign check [client_id]        # health dashboard
campaign investigate --metric cpl # diagnostic deep dive
campaign brief [client_id]        # generate client report
```

### Campaign CLI Structure
- `legacy/src/cli/` — Click CLI (porcelain + plumbing pattern)
- `legacy/src/analyzers/` — 6 analyzers (search terms, impression share, quality score, trends, composition, diagnostic engine)
- `legacy/src/fetchers/` — Meta Ads + Google Ads API integrations
- `legacy/src/reporting/` — Markdown report generation
- `legacy/config/` — Per-client YAML configs
- `legacy/data/<client_id>/` — Partitioned Parquet storage

### Tech Stack
Python 3.9+, Click (CLI), Polars (dataframes), Rich (output), PyYAML (config), Parquet (storage), prompt_toolkit (REPL)

## Design Context

**Full design context lives in `.impeccable.md`.** Key points for all sessions:

### Brand: Calm, Competent, Precise
- Voice: Confident, direct, no hedging. "Your agent found 12 wasteful keywords" not "We think we may have identified..."
- Emotional goals: Trust, relief, quiet confidence. The user should feel "this is handled."

### Aesthetic: Raycast/Arc energy, dark-first
- Dark theme primary (`#0F1117` bg, `#6C5CE7` purple accent)
- Polish via micro-interactions, not decoration. Every animation communicates state.
- WCAG AA minimum (4.5:1 text contrast, 3:1 UI)
- 8px spacing grid, layered surfaces (depth via color, not shadows)

### Anti-references (NEVER look like)
- Zapier/Make.com (no workflow builders with nodes/wires)
- Generic SaaS (no blue gradients, stock illustrations)
- Enterprise dashboards (no dense tables, tiny fonts, gray everything)
- Over-designed AI tools (no glowing orbs, particle effects)

### Design Principles
1. **Agent-first, not data-first** — users interact with agents, not raw data
2. **Progressive trust** — start conservative, earn autonomy visibly
3. **Conversational over configurational** — briefing > forms
4. **Quiet until important** — three tiers: Needs Input (yellow) → Auto-Handled (green) → FYI (gray)
5. **Craft in the details** — smooth transitions, considered spacing, thoughtful states
6. **Browser** -- use agent-browser --help when need to check the FE design
