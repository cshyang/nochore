# Agent Evolution Design

**Date:** 2026-03-31
**Status:** Partially superseded  
**Superseded sections:** Runtime coordination model, capability ladder state model, policy inheritance → see `2026-04-04-coordinated-agent-runtime-architecture.md`  
**Still authoritative for:** Trust model (progressive autonomy, QA fixes, capability-level trust rationale, outcome-based trust direction), topology promotion patterns (L1→L2→L3), anti-patterns, open product questions
**Supersedes:** `2026-03-29-agent-chat-lifecycle-design.md` (V0.2/V0.3 sections)
**Builds on:** `2026-03-30-progressive-autonomy-design.md` (archived, core shipped), current sub-run runtime

## Why This Document Exists

This document emerged from three threads of work:

1. **Agent topology** — How agents evolve from single-agent projects to multi-agent topology. Evaluated three approaches (dispatcher, crew, three-layer evolution). Selected the three-layer model.
2. **Progressive autonomy** — The tool-level trust system shipped (pattern detection, learned rules, suggestion UX). QA review completed.
3. **Trust model rethink** — Explored capability-level trust as a middle layer. Adversarial review concluded the implementation is premature before the tool-level system has production data. The direction is preserved as future work.

## Core Thesis

**Single-face UX, multi-mind runtime.**

One agent per job. Delegation is an internal competence. Structure earns its way into the UI. Trust compounds from evidence, not from clicking Accept.

The governing principle: **topology and trust evolve the same way — observe, suggest, confirm.** Nothing starts at full autonomy.

## Product Principles

1. **One accountable agent on the surface.** The user creates an agent, not a manager.
2. **Delegation is an internal competence first.** Visible as narration, not setup burden.
3. **Structure earns its way into the UI.** Repeated patterns become suggestions, confirmed suggestions become durable capabilities.
4. **Policy flows down, never around.** No delegated worker can exceed the parent agent's policy.
5. **Peer agents and subordinate specialists are different.** A reusable helper is not the same as a full project-level agent.

## Capability Ladder

| Layer | What it is | Durable | User-visible | Own schedule/policy/chat |
|---|---|---:|---:|---:|
| **Skill** | Inline reasoning capability | No | Indirectly | No |
| **Ephemeral specialist** | One focused delegated sub-run | No | Activity only | No |
| **Pinned specialist** | Reusable helper for one parent | Yes | Settings + Activity | No |
| **Peer project agent** | Full agent in same project | Yes | Yes | Yes |
| **Coordinator capability** | Earned cross-agent trigger rights | Yes | Yes | Inherited |

## State Model

**Ephemeral specialists** are evented sub-runs within a parent run. No separate DB records.

**Pinned specialists** are workspace files (`specialists/*/SPECIALIST.md`) using the catalog system's `CapabilityEntry` pattern. Identity, not operational state.

**Peer agents** are separate `AgentRecord`s in the same project with independent lifecycle.

**Coordinator** is a `coordinationRights: string[]` field on an existing peer agent.

## UX Model

**Onboarding:** One agent for one job. Avoid "dispatcher", "manager", "crew."

**Activity:** Hidden orchestration becomes legible. "Your agent pulled in a researcher for competitor pricing."

**Chat:** Reasoning-heavy changes — scope expansion, specialist promotion, adding peer agents.

**Settings:** Direct manipulation of known values. Sections: Identity, Instructions, Skills, Connections, Notifications, Specialists (read-only), Autonomy.

## Roadmap

### V0.2: Hidden Dispatch Hardening

**Status:** Core delegation built and working.

`spawn_sub_run` in `agent-run.ts:78-195` implements ephemeral delegation. Three archetypes (scout, analyst, builder) loaded from `capabilities/agents/`. Max 3 sub-runs per main run. Tools filtered (no recursion). Policy inherited from parent.

**What still needs hardening:**
- Add `delegation` config block to agent record (enabled, allowedRoles, maxSubRuns, tokenBudget)
- Replace loose tool inheritance with explicit parent tool snapshot
- Enforce least-privilege for sub-runs

### V0.3: Pinned Specialists

Specialists stored as `SPECIALIST.md` in parent's workspace. Loaded via `discoverCapabilityEntries()`. `spawn_sub_run` gains optional `specialist` parameter. Policy inherited verbatim from parent. Chat mutations via `manage_specialist` tool. Read-only Specialists section in Settings.

### V1.0: Multi-Agent Projects

**Prerequisite:** V1.0-Phase0 technical foundation.

Projects gain multiple peer agents. Language: "Add another agent." Two creation paths: setup UI or chat with existing agent. Each agent gets independent workspace. Shared project context via `PROJECT.md` (human-curated, read-only for agents). Cross-agent findings via `listProjectFindings()` query.

### V1.5: Earned Coordination

Coordinator as earned capability. `trigger_sibling_run` tool gated by `coordinationRights`. System suggests when cross-agent dependency patterns detected. Revocable at any time.

## Trust Model

### What's Shipped: Tool-Level Progressive Autonomy

The core progressive autonomy system is implemented and passing tests (54/54). It works:

```
Approval patterns accumulate
  → pattern detector counts consistent decisions (5+, 90%+ consistency, 30-day window)
  → system suggests learned rule
  → user accepts/dismisses/suppresses/revokes
  → accepted rules affect policy evaluation at step 6
  → strictest-wins hierarchy preserved
```

**Policy evaluation order** (`engine.ts`):
1. Tool disabled → BLOCKED
2. Static `blocked` → BLOCKED
3. Cooldown → BLOCKED
4. Budget threshold → APPROVAL
5. Global override → APPROVAL
6. Learned rule matches → resolve(static, learned)
7. Default → static `approvalMode`

### QA Fixes Needed Before Production

**Fix 1: Learned `blocked` should cap at `approval`.**

`rule-resolver.ts:24` — When static=`approval` and learned=`blocked`, result is currently `blocked`. A pattern-derived rule should not have the power to fully block a tool the human configured as "ask me." Learned rules can escalate to `approval` (require human decision) but never to `blocked` (remove the tool entirely). Only direct human action in Settings should fully block.

**Fix 2: Conflicting learned rules for same tool.**

`progressive-autonomy.ts` + `learned-rule.ts:178-197` — `findExisting` matches on `(agentId, toolName, learnedDecision, conditions)`. If a tool has an accepted `auto` rule and the user's behavior later reverses, a new `blocked` suggestion is created without superseding the old `auto` rule. Two rules co-exist for the same tool. Add conflict detection: new suggestion for the same `(agentId, toolName)` should flag or supersede existing rules regardless of `learnedDecision`.

**Fix 3: Dead code sentinel in `listActive`.**

`learned-rule.ts:115` — `eq(learnedPolicyRules.expiresAt, 0)` treats epoch-zero as "no expiry." Nothing sets `expiresAt` to 0. Remove the branch.

**Fix 4: Missing tests for detection pipeline.**

`pattern-detector.ts`, `condition-extractor.ts`, `rule-resolver.ts`, `progressive-autonomy.ts`, and `LearnedRuleRepository` have zero unit tests. Only `engine-v2.test.ts` (10 tests) covers the integration. The condition matching operators (`lt`, `gt`, `gte`, `lte`, `in`) and the duplicate detection logic are never exercised.

### What We Decided NOT to Build Yet: Capability-Level Trust

An adversarial review challenged the proposal to add a capability layer (named groups of tools with trust levels) between tool-level and agent-level trust. The challenge was persuasive on several points:

**Why not now:**

1. **Zero production data.** The tool-level system shipped yesterday. We don't know if users reach the ceiling of tool-level trust, whether grouping is needed, or what the real pain points are.

2. **Tools span groups.** `LIST_CAMPAIGNS` serves budget management, search terms, quality scores, and every other Google Ads capability. Putting it in one group creates false boundaries. Multiple groups create cascading side effects.

3. **Five sources of truth.** Static config → learned rules → capability trust → tool overrides within capabilities → global override. Debugging "why was this tool auto-approved?" becomes archaeology.

4. **The cascading detector is too slow.** At 5 decisions per tool × 6 tools × 3 capabilities, the system needs ~90 approvals before capability-level suggestions emerge. That's 3+ months of daily use.

5. **Process-based vs outcome-based trust.** Counting how many times the user clicked Accept is ceremony accumulation, not trust compounding. Real trust should come from "this agent's recommendations were right."

**Why the direction is still right:**

Users think in domains of judgment ("I trust this agent on budget management") not individual API calls ("I trust `GOOGLEADS_ADJUST_BUDGET`"). That mental model gap is real. The question is when and how to address it.

**When to revisit:**

Revisit capability-level trust when:
- Tool-level progressive autonomy has 3+ months of production data
- Users report hitting the ceiling of tool-level trust
- The condition extractor has been improved beyond single-field v1
- Outcome tracking infrastructure exists (see Future Direction below)

If revisited, implement as a **UI view** first (show how tools cluster, let users batch-change approval modes) before making it a policy engine concept. Don't add `capabilityConfig` to `AgentConfig` until the view proves its value.

### Future Direction: Outcome-Based Trust

The 10-star version of progressive trust is outcome-based, not action-based. Instead of counting approval clicks, measure:

- Did the finding turn out to be correct?
- Did the agent's action produce the result it predicted?
- Did the user modify the agent's suggestion, or accept as-is?
- When the agent was wrong, did it catch it early?

This requires outcome tracking infrastructure that doesn't exist yet. Prerequisites:
- Finding acceptance/rejection tracking (did the user act on the finding?)
- Action outcome tracking (did the action achieve its goal?)
- Revert tracking (did the user undo the agent's action?)

Outcome-based trust would feed the agent promotion detectors more meaningfully than permission accumulation. "This specialist has a 92% finding acceptance rate over 6 weeks" is a stronger promotion signal than "the user accepted 15 learned rules."

**This is V2.0+ work.** Document it as the north star but do not design the implementation until the prerequisite infrastructure is scoped.

## Progressive Topology: Observe, Suggest, Confirm

### Pattern 1: Pin repeated delegation (L1 → L2)

- **Detection:** `sub_run_started` events grouped by role + task similarity. 5+ occurrences in 30 days, 80%+ instruction similarity.
- **Suggestion:** *"You delegated LinkedIn research 12 times. Save as a pinned specialist?"*
- **What changes:** `SPECIALIST.md` written to agent workspace.

### Pattern 2: Promote to peer agent (L2 → L3)

- **Detection:** Pinned specialist active 30+ days, used in 10+ runs, scope expanded at least once.
- **Suggestion:** *"Your LinkedIn specialist has matured. Promote to a project agent?"*
- **What changes:** New `AgentRecord`, new workspace, specialist removed from parent.

### Pattern 3: Grant coordination capability

- **Detection:** Repeated cross-agent dependency patterns. 5+ occurrences in 30 days, 80%+ consistency.
- **Suggestion:** *"Campaign Monitor triggers SEO Watcher before analysis 9 of 12 runs. Allow coordination?"*
- **What changes:** `coordinationRights` gains sibling ID. Agent gains `trigger_sibling_run` tool.

### Invariants

1. Suggestions are evidence-based.
2. Suggestions are always user-confirmed.
3. Static human-set policy always outranks learned topology or autonomy.
4. The agent never suggests increasing its own autonomy — the system does.

## Policy Inheritance

| Layer | Policy Source | Can Restrict? | Can Relax? |
|-------|-------------|--------------|-----------|
| Ephemeral | Parent's `toolConfig`, verbatim | No | No |
| Pinned | Parent's `toolConfig` as baseline | Yes | No |
| Peer | Independent `toolConfig` | N/A | N/A |

On promotion (Pinned → Peer): `toolConfig` copied from parent at time of promotion, independently editable afterward.

## Technical Prerequisites (V1.0-Phase0)

1. **Agent-level tool scoping** — Filter Composio tools by agent's `toolConfig.tools` keys, not project-wide.
2. **Cross-agent context API** — `listProjectFindings(projectId, options)` joining events across agents.
3. **Trigger ACLs** — `coordinationRights` field, checked by `trigger_sibling_run` tool.
4. **Memory boundary enforcement** — `PROJECT.md` at project level, `readProjectFile()` in WorkspaceStore.
5. **Token budget attribution** — Per-agent counters in `runs` table, populated from AI SDK usage.
6. **Finding conflict surfacing** — Best-effort keyword overlap detection across sibling findings.

## Immediate Priorities

1. **Fix progressive autonomy QA issues** (Fixes 1-4 above)
2. **Add tests for detection pipeline** (pattern-detector, condition-extractor, rule-resolver, repository)
3. **Instrument tool-level trust** — Track: rules suggested/accepted/revoked, time-to-first-rule, approval fatigue reduction
4. **Harden delegation** — delegation config block, least-privilege tool inheritance
5. **Build L1→L2 promotion detector** — reuse pattern infrastructure for pinned specialist suggestions

## Anti-Patterns

1. **Dispatcher as entity** — Coordination is an earned capability, not a new entity type.
2. **Workflow builder** — Topology emerges from evidence, not manual wiring.
3. **Crew/team metaphor** — Language is "add another agent." Projects are the container.
4. **Silent team formation** — Permanent structure always requires confirmation.
5. **Unlimited delegation** — Every level is policy-bound and budget-bound.
6. **Premature capability layer** — Don't add capability grouping before tool-level trust has production data.
7. **Self-promotion** — The agent never suggests increasing its own autonomy.
8. **Process-based trust** — Don't measure trust by how many times the user clicked Accept. Measure outcomes when infrastructure allows.

## Open Questions

1. **Specialist context accumulation.** Should pinned specialists have their own KNOWLEDGE.md within their workspace subfolder?
2. **Cross-project agents.** Can an agent belong to multiple projects? Current schema says no.
3. **Specialist versioning.** Preserve previous instructions when updated via chat?
4. **Coordination transitivity.** Proposal: no. Direct rights only.
5. **L2 specialist limits.** Proposal: start with 5, increase if users hit the limit.
6. **Outcome tracking scope.** What counts as a "successful" finding? User acts on it? Revenue changes? This needs its own design doc when prioritized.
