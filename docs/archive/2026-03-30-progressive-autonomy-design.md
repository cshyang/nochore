# Progressive Autonomy — The Feedback Loop

**Date:** 2026-03-30
**Status:** Archived on 2026-03-31 after the core feedback loop shipped
**Builds on:** Policy engine (`packages/harness/src/policy/engine.ts`), approval flow (`agent-run.ts`), lessons system

> Archived note: the core implementation in this branch ships learned rule detection, suggestion/review UI, policy engine integration, and rule management in Settings. Later ideas in this draft, like a separate autonomy dashboard and deeper evidence drill-down, remain future work and should get a new plan if revived.

## Problem

Nochore's policy engine evaluates tool calls deterministically — but it never learns. An agent's 500th run is governed by the same static rules as its 1st. The "progressive trust" promised in the philosophy doesn't exist as a product feature.

Today's broken loop:

```
Agent proposes action
  → evaluatePolicy() checks static config (approvalMode, cooldown, budgetThreshold)
  → Human approves or rejects
  → Decision is recorded in `approvals` table
  → ... nothing feeds back into policy
  → Next identical action → same approval prompt → same human decision → repeat forever
```

The approval table captures rich signal — toolName, toolInput, decision, reason — but that signal is write-only. No system reads it to improve future behavior.

**Consequences:**
1. **User fatigue** — Approving the same action type repeatedly is friction without value
2. **No trust gradient** — Agent is either fully manual or fully autonomous per-tool, nothing in between
3. **No switching cost** — 6 months of approval decisions are trapped in a table nobody queries
4. **Hollow lessons** — The lessons system captures run summaries, not decision patterns

## Core Concept: Learned Policy Rules

Add a second layer to the policy engine: **learned rules** derived from human approval patterns, sitting alongside (never replacing) static rules.

```
┌─────────────────────────────────────────────────────────┐
│                    POLICY ENGINE                         │
│                                                         │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │  STATIC RULES   │    │      LEARNED RULES         │  │
│  │  (human-set)    │    │  (derived from decisions)  │  │
│  │                 │    │                            │  │
│  │  • approvalMode │    │  • pattern: toolName +     │  │
│  │  • cooldown     │    │    input conditions        │  │
│  │  • budget       │    │  • learned decision:       │  │
│  │    threshold    │    │    auto-approve / auto-deny │  │
│  │  • enabled      │    │  • evidence: N decisions    │  │
│  │  • global       │    │    over M days             │  │
│  │    override     │    │  • confidence: high/medium │  │
│  │                 │    │  • user-confirmed: bool    │  │
│  └────────┬────────┘    └─────────────┬──────────────┘  │
│           │                           │                  │
│           └───────────┬───────────────┘                  │
│                       ▼                                  │
│              STRICTEST RULE WINS                         │
│  (static "blocked" always overrides learned "auto")      │
└─────────────────────────────────────────────────────────┘
```

**Invariant: static rules always win.** If a human set `approvalMode: "blocked"` for a tool, no amount of learned rules can override it. Learned rules can only relax decisions within the bounds that static rules allow. This means the worst case of a bad learned rule is "asks for approval when it could auto-approve" — never "auto-approves when it should block."

## Design Decisions

### 1. Pattern Detection — Counting, Not ML

Pattern detection is deliberately simple: count consistent human decisions on the same action type within a time window.

```typescript
interface ApprovalPattern {
  agentId: string;
  toolName: string;
  decision: "approved" | "rejected";
  count: number;                    // How many times this decision was made
  consistencyRate: number;          // e.g., 0.95 = 95% same decision
  windowDays: number;              // Over what period
  commonConditions?: Record<string, unknown>; // Shared input traits
}
```

**Why not ML/embeddings?** Three reasons:
- Explainability — "You approved this 8 times in 30 days" is auditable. A cosine similarity score is not.
- Predictability — Counting is deterministic. The user knows exactly why a rule was suggested.
- Simplicity — This is a v1 feature. If counting solves 80% of cases, ship it. Add sophistication when data proves it's needed.

**Detection thresholds (configurable per agent):**

| Parameter | Default | Description |
|-----------|---------|-------------|
| `minDecisions` | 5 | Minimum consistent decisions before suggesting |
| `consistencyThreshold` | 0.9 | 90%+ same decision on same tool |
| `windowDays` | 30 | Look-back window |
| `cooldownAfterRejection` | 14 days | Don't re-suggest a rule the user rejected |

### 2. Suggestion, Never Silent Application

Learned rules are **always proposed to the user first.** The system never silently changes policy. This preserves the trust model: the user is always in control.

```
┌────────────────────────────────────────────────────────────┐
│  🔔 Policy Suggestion                                      │
│                                                            │
│  You've approved "GOOGLEADS_UPDATE_CAMPAIGN_BUDGET"        │
│  8 times in the last 30 days (100% approval rate).         │
│                                                            │
│  Common pattern: budget changes under $200                  │
│                                                            │
│  Suggestion: Auto-approve budget changes under $200         │
│                                                            │
│  [Accept]  [Accept with limit: $___]  [Dismiss]  [Never]  │
│                                                            │
│  Evidence: 8 approvals  ·  0 rejections  ·  30-day window  │
└────────────────────────────────────────────────────────────┘
```

**Four response options:**
- **Accept** — Create learned rule as suggested
- **Accept with modification** — User adjusts the threshold or conditions
- **Dismiss** — Not now; system may re-suggest after more evidence
- **Never suggest this** — Permanently suppress this suggestion for this agent

### 3. Rule Hierarchy — Strictest Wins

When static and learned rules disagree, the strictest decision wins:

| Static Rule | Learned Rule | Result | Rationale |
|-------------|-------------|--------|-----------|
| blocked | auto-approve | **blocked** | Static always wins |
| approval | auto-approve | **auto** | Learned relaxes within bounds |
| auto | auto-deny | **approval** | Learned can tighten, not block |
| approval | auto-deny | **blocked** | Learned tightening + static = block |
| (none) | auto-approve | **auto** | Learned rule fills the gap |

**Key principle:** Learned rules can make the agent MORE autonomous (relax approval → auto) or MORE cautious (relax auto → approval). They can never override an explicit human "blocked" setting.

### 4. Condition Extraction — Start Simple

For v1, conditions are extracted from the most obvious input fields:

```typescript
function extractConditions(
  approvals: ResolvedApproval[]
): Record<string, { operator: string; value: unknown }> | undefined {
  // Look for consistent numeric fields across all approved inputs
  // e.g., all approved budget changes had amount < 200
  // → { "amount": { operator: "lt", value: 200 } }

  // Look for consistent string fields
  // e.g., all approved actions targeted the same provider
  // → { "provider": { operator: "eq", value: "google_ads" } }

  // If no consistent conditions found, the rule is unconditional
  // (just "always auto-approve this tool")
  return undefined;
}
```

**v1 operators:** `eq`, `lt`, `gt`, `lte`, `gte`, `in`

**v1 does NOT attempt:**
- Cross-field conditions ("amount < 200 AND campaign_type = 'brand'")
- Temporal conditions ("only on weekdays")
- Relative conditions ("less than 10% of daily budget")

These are v2 candidates if data shows users need them.

### 5. Revocability — Users Can Always Undo

Every learned rule has a clear lifecycle:

```
suggested → accepted → active → (revoked | expired)
```

- **Active rules** are visible in agent Settings alongside static rules, clearly labeled as "Learned"
- **Revoke** removes the rule immediately. Policy reverts to static-only behavior for that tool.
- **Expiration** (optional) — rules can be set to expire after N days, forcing re-evaluation
- **Audit trail** — every learned rule records: when suggested, when accepted, evidence count, who confirmed

## Data Model

### New Table: `learned_policy_rules`

```sql
CREATE TABLE learned_policy_rules (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  tool_name       TEXT NOT NULL,
  learned_decision TEXT NOT NULL,        -- "auto" | "approval" | "blocked"
  conditions      TEXT,                  -- JSON: { field: { operator, value } } or null
  evidence_count  INTEGER NOT NULL,      -- Number of decisions this is based on
  consistency_rate REAL NOT NULL,         -- 0.0-1.0
  status          TEXT NOT NULL DEFAULT 'suggested',  -- "suggested" | "accepted" | "revoked" | "expired" | "dismissed"
  suggested_at    INTEGER NOT NULL,      -- ms timestamp
  accepted_at     INTEGER,              -- ms timestamp, nullable
  revoked_at      INTEGER,              -- ms timestamp, nullable
  expires_at      INTEGER,              -- ms timestamp, nullable
  user_note       TEXT,                  -- User's reason for accepting/modifying
  source_approval_ids TEXT NOT NULL,     -- JSON array of approval IDs used as evidence

  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE INDEX idx_learned_rules_agent_status ON learned_policy_rules(agent_id, status);
CREATE INDEX idx_learned_rules_agent_tool ON learned_policy_rules(agent_id, tool_name);
```

### New Table: `suggestion_suppressions`

```sql
CREATE TABLE suggestion_suppressions (
  id          TEXT PRIMARY KEY,
  agent_id    TEXT NOT NULL,
  tool_name   TEXT NOT NULL,
  suppressed_at INTEGER NOT NULL,       -- ms timestamp

  FOREIGN KEY (agent_id) REFERENCES agents(id)
);

CREATE UNIQUE INDEX idx_suppressions_agent_tool ON suggestion_suppressions(agent_id, tool_name);
```

### Modified: `evaluatePolicy` Signature

```typescript
// Before
function evaluatePolicy(request: PolicyRequest, context: PolicyContext): PolicyDecision

// After
function evaluatePolicy(request: PolicyRequest, context: PolicyContext): PolicyDecision

// Context gains a new field:
interface PolicyContext {
  now: Date;
  globalApprovalRequired: boolean;
  recentToolCalls: Array<{ toolName: string; timestamp: Date }>;
  learnedRules: LearnedPolicyRule[];     // ← NEW: active learned rules for this agent
}

interface LearnedPolicyRule {
  id: string;
  toolName: string;
  learnedDecision: "auto" | "approval" | "blocked";
  conditions: Record<string, { operator: string; value: unknown }> | null;
}
```

### Modified: Policy Evaluation Order

```
1. Tool enabled?              → if disabled: BLOCKED
2. Static approvalMode?       → if "blocked": BLOCKED
3. Cooldown active?           → if yes: BLOCKED
4. Budget threshold?          → if exceeded: APPROVAL
5. Global override + write?   → if yes: APPROVAL
6. ──── NEW ────
   Learned rule matches?      → if conditions match input:
                                  resolve(static, learned) using strictest-wins
7. Default to static approvalMode
```

Step 6 applies learned rules AFTER all static checks. A learned "auto" can only take effect if no static rule already decided "blocked" or "approval."

## Implementation

### Phase 1: Pattern Detection & Suggestion (ship first)

**New module:** `packages/harness/src/policy/pattern-detector.ts`

```typescript
export interface DetectionConfig {
  minDecisions: number;         // default: 5
  consistencyThreshold: number; // default: 0.9
  windowDays: number;           // default: 30
}

export async function detectApprovalPatterns(
  agentId: string,
  approvalRepo: ApprovalRepository,
  suppressions: SuppressionRepository,
  config: DetectionConfig,
): Promise<ApprovalPattern[]>
```

**New module:** `packages/harness/src/policy/condition-extractor.ts`

```typescript
export function extractConditions(
  approvals: ApprovalRecord[],
): Record<string, { operator: string; value: unknown }> | null
```

**New repository:** `packages/harness/src/repositories/learned-rule.ts`

```typescript
export class LearnedRuleRepository {
  async suggest(input: SuggestLearnedRuleInput): Promise<string>;
  async accept(id: string, userNote?: string, modifications?: Partial<LearnedPolicyRule>): Promise<void>;
  async dismiss(id: string): Promise<void>;
  async revoke(id: string): Promise<void>;
  async listActive(agentId: string): Promise<LearnedPolicyRule[]>;
  async listSuggested(agentId: string): Promise<LearnedPolicyRule[]>;
}
```

**Trigger point:** After each approval resolution in `agent-run.ts`:

```typescript
// After markResolved()
await detectAndSuggest(agentId, approvalRepo, learnedRuleRepo, suppressionRepo);
```

**Output:** Suggestions appear as a notification card in the agent's Activity feed and as a banner in Settings.

### Phase 2: Policy Engine Integration

Modify `evaluatePolicy()` to accept and apply learned rules (step 6 above).

**New module:** `packages/harness/src/policy/rule-resolver.ts`

```typescript
export function resolveDecision(
  staticDecision: PolicyDecision,
  learnedRule: LearnedPolicyRule | undefined,
  toolInput: Record<string, unknown>,
): PolicyDecision
```

Contains the strictest-wins logic from the hierarchy table.

**New module:** `packages/harness/src/policy/condition-matcher.ts`

```typescript
export function matchesConditions(
  conditions: Record<string, { operator: string; value: unknown }> | null,
  toolInput: Record<string, unknown>,
): boolean
```

### Phase 3: Settings UI

**Learned Rules section** in agent Settings tab:

```
┌─────────────────────────────────────────────────────────┐
│  Policy Rules                                            │
│                                                         │
│  ── Static (you set these) ──────────────────────────── │
│  GOOGLEADS_UPDATE_BUDGET    approval   cooldown: 30m    │
│  SLACK_SEND_MESSAGE         auto                        │
│                                                         │
│  ── Learned (from your decisions) ───────────────────── │
│  GOOGLEADS_PAUSE_CAMPAIGN   auto-approve                │
│    when: always  ·  based on 8 approvals  ·  30 days   │
│    [Revoke]                                             │
│                                                         │
│  GOOGLEADS_ADD_NEGATIVES    auto-approve                │
│    when: count < 20 keywords  ·  based on 5 approvals  │
│    [Revoke]                                             │
│                                                         │
│  ── Suggestions ─────────────────────────────────────── │
│  💡 Auto-approve budget changes under $200?             │
│     Based on 6 approvals (100% rate)                    │
│     [Accept] [Modify] [Dismiss] [Never]                 │
└─────────────────────────────────────────────────────────┘
```

### Phase 4: Autonomy Dashboard

A simple visualization of trust growth over time:

```
Approval Rate Over Time (GOOGLEADS_UPDATE_BUDGET)
                                                    ← auto-approve rule accepted
Month 1: ████████████████ 16 approvals, 0 rejections
Month 2: ████████ 8 approvals, 0 rejections
Month 3: ██ 2 approvals (edge cases above $200)
Month 4: █ 1 approval

Total decisions saved: ~45 approval prompts
```

This is the "Understanding My Agent" moment — visible proof that the agent is earning trust and reducing friction.

## Event Types

Two new event types for the run event log:

```typescript
// Add to RunEventTypeSchema
"policy_rule_suggested"     // Pattern detected, suggestion created
"policy_rule_accepted"      // User accepted a learned rule
```

**Payloads:**

```typescript
// policy_rule_suggested
{
  ruleId: string;
  toolName: string;
  learnedDecision: string;
  evidenceCount: number;
  consistencyRate: number;
  conditions: Record<string, unknown> | null;
}

// policy_rule_accepted
{
  ruleId: string;
  toolName: string;
  learnedDecision: string;
  userNote?: string;
}
```

## What This Does NOT Cover (Intentionally)

1. **Cross-agent rule sharing** — "Agent A learned to auto-approve X; should Agent B inherit that?" Not yet. Each agent's learned rules are isolated. Cross-pollination is a v2 concept that needs careful design (different agents have different risk profiles).

2. **Automatic rule application** — Rules are always suggested, never silently applied. Even if the consistency rate is 100% over 100 decisions, the user must confirm. Trust is earned, not assumed.

3. **Complex conditions** — v1 supports single-field conditions only. Multi-field AND/OR conditions, temporal conditions, and relative thresholds are deferred until usage data shows they're needed.

4. **LLM-based pattern analysis** — The pattern detector is pure counting + field comparison. No LLM is involved in detecting patterns or suggesting rules. This keeps the system deterministic, auditable, and cheap.

5. **Policy composition conflicts** — If two learned rules disagree (one says auto, another says approval), strictest wins. No sophisticated conflict resolution yet.

## Open Questions

1. **Expiration default** — Should learned rules expire after 90 days and require re-confirmation? Prevents stale rules from persisting after business context changes. Trade-off: adds friction for stable patterns.

2. **Suggestion timing** — Suggest after each approval resolution (immediate feedback) or batch suggestions at end-of-run (less noisy)? Leaning toward end-of-run to avoid interrupting the approval flow.

3. **Evidence visibility** — Should the user be able to click through to the actual approval decisions that produced the suggestion? Adds trust but requires UI work. Leaning yes for v1 — the evidence IS the trust signal.

4. **Chat integration** — Should the agent be able to say "I notice you always approve my budget changes under $200 — want me to stop asking?" in chat mode? Natural and conversational, but blurs the line between agent reasoning and system-level policy. Leaning toward keeping it as a system notification, not agent dialogue.

5. **Rejection patterns** — If a user rejects the same action type consistently, should the system suggest auto-blocking it? This is the mirror of auto-approve but more dangerous (might prevent legitimate future use). Leaning toward suggesting "require approval" (the middle ground) rather than "block."

## Success Metrics

| Metric | Target | How to measure |
|--------|--------|----------------|
| Approval fatigue reduction | 50% fewer manual approvals by month 3 | Count approvals per agent per month, before vs after |
| Rule acceptance rate | >60% of suggestions accepted | Accepted / (accepted + dismissed + never) |
| Rule revocation rate | <10% of accepted rules revoked | Revoked / accepted |
| Time-to-first-learned-rule | Within first 2 weeks of agent operation | Days from agent creation to first accepted rule |
| User retention correlation | Agents with learned rules have higher 30-day retention | Cohort comparison |
