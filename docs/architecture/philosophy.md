# Nochore — Product Philosophy

## The Core Thesis

The fundamental unit of work is shifting. Pre-LLM, it was the **function** — deterministic, rigid, requiring developers to anticipate every path. Post-LLM, it's the **agent** — a unit of work with reasoning built in, capable of handling ambiguity, learning from outcomes, and operating within defined boundaries.

**An agent is a function + reasoning.** What powers that function is agent skills, tools, and policy/guardrails.

Instead of building complex deterministic code for every workflow, you deploy an agent that knows *what* to do (skills), *how* to act on the world (tools), and *what it must and must not do* (policy) — all in service of a clearly defined intent.

---

## The Four Pillars

Every agent is defined by exactly four things:

```
              ┌─────────────┐
              │   INTENT     │
              │  (the why)   │
              └──────┬──────┘
                     │
         ┌───────────┼───────────┐
         │           │           │
    ┌────▼───┐  ┌────▼───┐  ┌───▼────┐
    │ SKILLS │  │ TOOLS  │  │ POLICY │
    │  know  │  │   do   │  │  must  │
    └────────┘  └────────┘  └────────┘
```

### Intent — "What is this agent trying to accomplish?"

The goal, the scope, and the success criteria. Not just *what* to do, but *why* and *what good looks like*.

- Defines the agent's purpose in plain language
- Sets the scope: which data, which clients/projects, what time range
- Establishes success criteria the agent can evaluate itself against
- Provides business context that shapes the agent's judgment

Intent is what separates an agent from a dumb automation. An automation follows instructions. An agent pursues an objective. Intent transforms an agent from a one-shot executor into an **outcome owner** — it pursues a measurable result across multiple runs, learning and adapting its approach over time.

**Configured by:** Non-technical users (with guidance from the platform)

### Skills — "What does this agent know and how does it reason?"

Domain knowledge and analytical capabilities. Skills are *knowledge + method* — they're what make an agent an expert rather than a generic LLM.

- Stateless analytical functions: data in, typed insights out
- Encode domain expertise (how to detect ad waste, how to forecast churn, how to assess code quality)
- Composable: multiple skills can be combined without conflicts
- Skills involve reasoning (fuzzy, LLM-assisted) as opposed to tools (precise, deterministic)

A skill is the difference between an agent that can "look at numbers" and one that can "diagnose why your cost-per-lead spiked last Tuesday."

**Skills also define what's monitorable.** Each skill can declare a set of **views** — metrics, tables, and trends it can render in the agent's Monitor tab. This is how different agents show completely different dashboards without building a generic BI tool. An Ad Spend skill surfaces keyword tables and CPL trends. A Funnel Analysis skill surfaces conversion stages and drop-off rates. The platform renders whatever the agent's skills expose. See `docs/architecture/ux-moments.md` for the full Monitor tab design.

**Built by:** Technical users (as extensions)
**Chosen by:** Non-technical users (from marketplace)

### Tools — "What can this agent do in the world?"

Actions the agent can take — API calls, mutations, notifications, data reads. Tools are the agent's hands.

- Mechanical and precise (not fuzzy — tools don't reason, they execute)
- Declare typed inputs/outputs and pre/post conditions
- Can be reversible or irreversible (the harness needs to know which)
- Provided primarily through Composio (250+ integrations) to solve cold start

Tools are commoditized. Every platform has Slack integrations and API connectors. The value isn't in having tools — it's in knowing *when and whether* to use them.

**Provided by:** Composio (primary), custom extensions (secondary)
**Connected by:** Non-technical users (OAuth flows, API keys)

### Policy — "What must and must not this agent do?"

Hard constraints and soft preferences that make agents trustworthy. Policies are the boundaries within which an agent operates.

**Three layers of policy, from coarse to fine:**

1. **Action-type defaults** — rules by category of action. "All negative keyword additions are auto-approved." "All budget changes require review." This is the broadest stroke — configured during agent setup.

2. **Threshold-based tiers** — conditional rules within an action type. "Budget changes under $50/day → auto-approve. $50–200 → ask me first. Over $200 → ask + show full reasoning." This is where the real nuance lives — the agent's autonomy scales with the stakes.

3. **Per-action override** — on any individual recommendation, the user can toggle "always ask me for actions like this" or "always auto-approve this pattern." These overrides accumulate over time as the user trains the agent's boundaries.

**Plus two safety mechanisms:**

- **Global override switch** — "Require approval for ALL actions regardless of policy." The panic button. Users who are new or nervous can start here and relax it as trust builds.
- **Operational constraints** — "Don't run during deployment freezes." "Active hours: 9am–6pm EST." "Max total change per day: $500." These are guardrails that apply regardless of action type.

Policy is the most underrated pillar and the biggest differentiator. Other platforms either auto-execute (dangerous) or require human approval for everything (defeats the purpose). Policy enables a middle ground: **automated judgment with configurable guardrails.**

**Built by:** Technical users (as extensions — domain-specific rules)
**Configured by:** Non-technical users (thresholds, approval preferences, overrides)

### Knowledge — Skill-Level Context

Each skill can have optional **domain knowledge** attached — context that enriches the LLM's reasoning for that specific analytical task. This is separate from the agent's memory (which is learned over time) and from the project's shared data (which is structural).

Examples of skill-level knowledge:

- Search Term Analysis: "Our brand terms are: acme, acme corp, acme marketing. Competitor terms to ignore: xyz corp. High-intent terms to protect: pricing, demo, free trial."
- Budget Allocation: "Q2 budget cap is $15,000/month. Brand campaigns have priority — don't reduce below $200/day. Weekend spend should be 30% lower than weekdays."

Knowledge is configured by non-technical users (in plain language, not code) and can be edited at any time. It's injected into the LLM's context when that skill runs, giving the agent domain expertise without requiring the skill builder to anticipate every use case.

---

## Projects — The Fifth Concept

While the four pillars define an individual agent, **Projects** define the *context boundary* within which agents operate. A project groups agents that share a common domain, client, or purpose.

```
┌─────────────── PROJECT ─────────────────┐
│  Shared context:                         │
│  • Tools (connections inherited)         │
│  • Memory (cross-agent learning)         │
│  • Data scope (same client/domain)       │
│                                          │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐ │
│  │ Agent A  │  │ Agent B  │  │ Agent C  │ │
│  │ (own     │  │ (own     │  │ (own     │ │
│  │  intent, │  │  intent, │  │  intent, │ │
│  │  skills, │  │  skills, │  │  skills, │ │
│  │  policy) │  │  policy) │  │  policy) │ │
│  └─────────┘  └─────────┘  └─────────┘ │
└──────────────────────────────────────────┘
```

**What projects provide:**

- **Shared tools/connections** — Connect Google Ads once at the project level; all agents within inherit access. No re-authenticating per agent.
- **Cross-agent memory** — Agent A's lesson ("weekends don't convert") is visible to Agent B when relevant. The harness manages this; agents don't message each other directly.
- **Data isolation** — Agents in "Acme Corp" project cannot see data from "Brightside Health" project. This is the enforcement mechanism for Axiom #1 (Bounded Context).
- **Unified attention view** — The project home shows "2 agents need attention" at a glance. Users manage at the project level, dive into agents when needed.

**What projects DON'T do:**

- Projects don't share policies. Each agent has its own autonomy rules. (A budget agent and a content agent need different guardrails.)
- Projects don't share intent. Each agent has a distinct job.
- Projects don't orchestrate agents. Agents within a project are independent peers, not steps in a pipeline. (If you need agent→agent handoff, that's a skill, not a project feature.)

**Configured by:** Non-technical users (create project → connect tools → add agents)

---

## Design Axioms

These are non-negotiable principles that every design decision must respect.

### 1. Bounded Context

Agents operate within a project scope. An agent in "Acme Corp" doesn't see "Brightside Health" data. Within a project, agents share context but maintain separate responsibilities. Narrow context = better reasoning = fewer hallucinations.

### 2. Typed Contracts at Every Boundary

Every handoff between components uses typed data structures. Skills declare what they consume and produce. Tools declare their inputs and effects. This is what makes composition reliable rather than fragile.

### 3. Separation of Judgment from Execution

Agents propose. Policies evaluate. Execution is gated. The agent's reasoning is always visible and auditable before anything happens in the real world.

### 4. Memory That Compounds

Agents learn from outcomes. "Last time I reduced the budget on Campaign X, conversions dropped 30% — I won't recommend that again." Memory is managed by the harness (not individual skills), so learning is shared across the agent's entire skill set.

### 5. Composability over Monoliths

Small, focused agents with clear responsibilities beat one mega-agent trying to do everything. Skills don't talk to each other directly. The harness orchestrates.

### 6. Agents Orchestrate, Tools Execute

When precision matters, agents delegate to deterministic tools rather than reasoning through the answer. The agent decides "calculate tax on this invoice" and calls a tax tool — it doesn't try to do arithmetic via LLM. Reasoning is fuzzy; execution is precise.

### 7. Constraints Enable Autonomy

The more tightly you constrain an agent's action space and evaluation criteria, the more autonomous it can safely operate. This is counterintuitive — constraints feel restrictive, but they're what make trust possible.

In Nochore:
- **Skills bound the action space** — the agent can only reason about what its skills know
- **Policy is always deterministic** — no LLM evaluates guardrails, ever
- **Tools are typed and declared** — the agent can't discover new capabilities at runtime
- **Instructions define the arena** — the human sets strategy, the agent executes within bounds

Design implication: when a user configures guardrails during setup, they're not restricting their agent — they're enabling it to act more independently. Karpathy's AutoResearch demonstrates this at the extreme: by locking the evaluation harness outside the agent's reach and bounding it to a single editable file with a clear metric, the agent runs hundreds of experiments overnight without supervision.

**Implementation: Learned Policy Rules.** Constraints aren't just static — they evolve as trust is earned. The policy engine detects consistent human approval patterns (e.g., "user approved budget changes under $200 eight times in 30 days") and suggests auto-approving that pattern. Users confirm or dismiss. Learned rules sit alongside static rules; the strictest always wins. This is the mechanism for progressive autonomy: constraints start tight and relax as evidence accumulates. See `docs/archive/2026-03-30-progressive-autonomy-design.md`.

---

## The Two Audiences

### Technical Users (Extension Builders)

Build **Skills** and **Policies**. The high-value, domain-specific pieces.

They don't write API wrappers (Composio handles that). They write "here's how to detect refund fraud" and "here's when auto-refunds are acceptable." The SDK enforces the axioms: typed contracts, stateless analysis, separated judgment.

Their mental model: **"I'm teaching the agent a new capability."**

### Non-Technical Users (Agent Deployers)

Configure **Intent** and **Policy**. Choose which **Skills** and **Tools** to give their agent.

Deploying an agent feels like hiring someone:
1. What's the job? (Intent)
2. What should they know? (Skills — from marketplace)
3. What tools do they need? (Tools — connect via OAuth)
4. What are the rules? (Policy — set thresholds, approval gates)

Their mental model: **"I'm setting up a smart assistant for this job."**

### The Entry Point: Cross-Project Homepage

Both audiences land on a **project-level homepage** — not inside a specific project. This is deliberate. The homepage answers the single most important question: *"Do I need to do anything right now, across everything?"*

Projects are the top-level organizational primitive (a client, a team, an initiative). The homepage shows each project as a card with rolled-up health signals: attention count, agent list, aggregate confidence. Clicking a project drills into its agent grid and connections. See `docs/architecture/ux-moments.md` for full wireframes and navigation model.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                   CONSUMPTION LAYER                       │
│            (How users interact with agents)               │
│                                                          │
│   ┌──────────┐   ┌──────────┐   ┌───────────────┐      │
│   │  Runs    │   │   Chat   │   │   Learned     │      │
│   │(history) │   │  (talk)  │   │  (knowledge)  │      │
│   └──────────┘   └──────────┘   └───────────────┘      │
├──────────────────────────────────────────────────────────┤
│                    HARNESS LAYER                          │
│           (The runtime — where agents live)               │
│                                                          │
│   Intent ──→ Scope ──→ Fetch ──→ Analyze ──→ Plan ──→  │
│                                      Policy ──→ Execute  │
│                          ↕                               │
│                       Memory                             │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                   EXTENSION LAYER                         │
│          (What technical users contribute)                │
│                                                          │
│   Skills (know/reason)     Policies (must/must-not)      │
│   ────────────────────     ────────────────────────      │
│   Ad performance analysis  Max budget change: 10%        │
│   Churn prediction         No refunds over $100          │
│   Code quality review      Require approval on Fridays   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                INTEGRATION LAYER (Composio)               │
│            (Tools — the agent's hands)                    │
│                                                          │
│   Google Ads · Slack · Shopify · Stripe · GitHub ·       │
│   Notion · Jira · HubSpot · 250+ more                   │
└──────────────────────────────────────────────────────────┘
```

---

## Integration & Credential Architecture

The integration layer is deceptively complex. Nice-looking OAuth buttons hide real problems: multi-account disambiguation, token lifecycle, and rate limiting.

### Current Architecture (post-simplification, 2026-03-24)

Composio handles auth directly — no custom Connection Manager abstraction. Tool config (enabled/disabled, auto/approval per tool) lives in the agent's DB record.

**What Composio handles:**
- OAuth flows for 250+ apps (popup, redirect, token exchange)
- Encrypted credential storage (isolated per entity)
- Automatic token refresh (transparent)
- Multi-tenant isolation via `entity_id` (maps to our project ID)
- Multiple auth methods (OAuth2, API keys, bearer tokens)
- Tool execution with auth handling

**What we handle:**
- `connections` table — tracks which providers are connected per project, their status, and provider-specific config
- Per-tool config in agent DB record — `enabled`, `approvalMode` (auto/approval/blocked), `cooldownMinutes`, `budgetThreshold`
- Google Ads direct connector — custom integration bypassing Composio (due to DEVELOPER_TOKEN_PROHIBITED issue)

### Key Design Decisions

**Connections live at the project level.** Connect Google Ads once; all agents in the project inherit access. This maps to Composio's `entity_id` = our project ID.

**The LLM never sees credentials.** The agent knows what tools it has access to (from system prompt context), but actual API calls are executed through Composio's SDK. The agent reasons about *what* to do; the integration layer handles *how*.

**Skills are prompt modules, not code.** Skills are markdown files that encode domain knowledge and analytical instructions. They reference tools by name ("use GOOGLEADS_LIST_CAMPAIGNS to...") but never touch credentials or execute API calls directly. The agent's LLM session uses tools provided by Composio at runtime.

### Future Considerations

- **Sub-account selection** — When a user connects a manager account with multiple sub-accounts, which ones should agents access?
- **Health monitoring** — Proactive connection health checks before agents fail
- **Per-agent permission scoping** — Different agents getting different access levels to the same connection

---

## Competitive Learnings: Relay.app

Relay.app is the closest comparable in the market. Studying their UX reveals patterns worth adopting and pitfalls that validate our differentiation.

### What We Adopt from Relay

**Template cards with app badges.** Relay's homepage templates show small icons for required apps (Calendar, Gmail, Slack) directly on each card. Users see what connections are needed *before* committing to a template. We adopt this in our setup flow — every template card shows the tools it will need.

**AI co-creation of configuration.** Relay's "Personal Assistant" chat scaffolds entire workflows from a natural language description. The AI generates all steps, pre-fills fields, and presents the result for review. We adopt this: our setup chat should scaffold the full agent config (skills, connections, policies) in one conversation, then present it for review — not force users through a multi-step wizard for every field.

**Highlighted gaps that need human input.** When Relay's AI generates a workflow, it explicitly flags fields it couldn't fill: "{YOUR_PAGE_ID}", "{YOUR_ACCESS_TOKEN}". The AI is transparent about what it couldn't automate. We adopt this: after AI scaffolds an agent config, it should show ✅ for what's ready and ⚠️ for what needs human input (e.g., "which sub-accounts should I monitor?").

**Per-step human-in-the-loop toggle.** Relay allows toggling human approval on individual AI steps. We adapt this: our policy model supports both action-type-level rules (all budget changes require approval) AND per-action granularity (this specific recommendation needs human review).

**Skill-level knowledge attachment.** Relay's AI steps can have their own knowledge sources and tool connections. We adapt this: each skill can have optional domain-specific context attached ("our brand terms are X, ignore competitor Y") that enriches the LLM's reasoning for that specific analytical task.

### Where We Differentiate from Relay

**Agency vs. automation.** Relay builds rigid step sequences: trigger → step 1 → step 2 → ... → done. If step 3 fails, the workflow dies. Our agents observe, reason, adapt. If the API is down, the agent queues the action and retries. If data looks anomalous, the agent investigates before acting.

**Credentials are the platform's problem, not the user's.** Relay tells users "you'll need a Meta Access Token, Facebook Page ID, and Instagram Business Account ID" and links to the Meta Developer Portal. Our Connection Manager + Composio handles auth entirely — the user clicks "Connect", completes an OAuth flow, and picks sub-accounts. No developer portals, no API keys pasted into text fields.

**Memory and learning.** Each Relay workflow run is stateless — run #47 knows nothing about run #46. Our agents compound in value through the memory system: experiments tried, outcomes observed, lessons learned.

**Policy engine vs. binary approval.** Relay's "Human-in-the-loop" is a toggle: on or off. Our policy engine evaluates conditions: "Refund under $100? Auto-approve. Over $100? Ask the user with full reasoning." This is the difference between a gatkeeper and a judge.

---

## Competitive Learnings: Karpathy's AutoResearch

AutoResearch (March 2026, 49K+ GitHub stars) is an autonomous experiment loop where an AI agent iterates on ML training code overnight. While domain-specific (LLM training), its architecture captures universal agent design principles relevant to Nochore.

### Key Architecture: Three Files

- **`program.md`** — Human-written strategy file. Research directions, constraints, qualitative criteria. The human iterates this; the agent follows it.
- **`train.py`** — The ONLY file the agent can edit. The bounded action space.
- **`prepare.py`** — LOCKED. Evaluation harness. Agent cannot modify it — prevents gaming the metric.

### What We Learn

**The human designs the arena, not the execution.** "Human writes program.md (the strategy). Agent writes train.py (the code). You sleep." This maps to Nochore's Instructions — the user defines what the agent should care about and what constraints to follow. The agent handles execution within those bounds.

**Irreducible requirements for autonomous agents.** Three things must be present: (1) a clear metric, (2) automated measurement the agent can't influence, (3) a bounded action space. Remove any one and autonomous operation fails. In Nochore: the metric is the agent's intent, the measurement is the deterministic policy engine, and the action space is bounded by skills + tools.

**Reversibility as a trust mechanism.** AutoResearch uses git commit/revert — improvements advance the branch, failures reset. In Nochore: the policy gate evaluates proposed actions before execution, and auto-handled actions always have an "Undo" option.

### Where Nochore Differs

AutoResearch is a **closed-loop optimization** — single metric, single artifact, fully reversible. Nochore agents operate in **open-loop business environments** — multiple metrics, external side effects (sending Slack messages, adjusting budgets), not always reversible. This is why Nochore needs the policy/guardrail layer that AutoResearch can skip. When you can't define "better" as a single number, you need human judgment at decision points.

---

## What This Is NOT

Clarity on what we're not building, to prevent scope creep:

- **Not Zapier.** We don't do "if X then Y" automations. Agents reason about what to do, they don't follow rigid triggers.
- **Not a chatbot builder.** Chat is one interface, not the product. Agents do real work with real tools.
- **Not an LLM wrapper.** The harness provides structure (typed contracts, memory, policies) that makes agents *reliable*, not just *capable*.
- **Not a coding platform.** Non-technical users never see code. Technical users write focused extensions, not applications.

---

## Open Questions (To Resolve Layer by Layer)

### Resolved
- [x] Integration: How deep is the Composio integration? → **Composio handles auth + tool execution directly (no Connection Manager abstraction). Tool config lives in agent DB record.** See `docs/architecture/2026-04-04-product-first-architecture-plan.md`
- [x] Extension Layer: How do skills declare dependencies on data types without coupling to specific tools? → **Skills consume data types (e.g., "orders"), not tool outputs. Harness resolves which connected tool provides each data type.**
- [x] Consumption Layer: What's the MVP interface? → **Project home (brand systems summary + agents grid + needs attention) → Agent detail (runs + chat + learned + settings)**
- [x] Harness Layer: What are the exact "LLM injection points"? → **Single Trigger.dev task with manual tool loop. LLM in agent session only; policy is always deterministic.** See `docs/architecture/2026-04-04-product-first-architecture-plan.md`
- [x] Policy Layer: How do policies compose? → **Strictest rule wins, deterministic ordering. Learned rules from approval patterns sit alongside static rules but never override a stricter static rule.** See `docs/archive/2026-03-30-progressive-autonomy-design.md`
- [x] Memory Layer: What's the memory schema? → **Three-layer split (workspace files / SQLite / JSONL debug mirror). Event log (append-only) + lessons (distilled from runs, scoped, with confidence and expiration).** See `packages/harness/src/db/sqlite/schema.ts`

### Open
- [ ] Harness Layer: How does scope resolution work across multiple tools/skills?
- [ ] Extension Layer: What does the full SDK contract look like for Skills, Policies, and Actions?
- [ ] Connection Manager: How does data type → tool resolution work when multiple tools could provide the same type?
- [ ] Marketplace: How are extensions discovered, rated, and trusted?
- [ ] Economics: What's the cost model when every agent invocation burns LLM tokens?
