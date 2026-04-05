# UX Design: The Three Defining Moments

## Design Principles (Before We Draw Anything)

1. **Conversational over forms.** Setting up an agent should feel like briefing a new hire, not filling out a tax return.
2. **Progressive disclosure.** Show the minimum needed. Reveal complexity only when the user reaches for it.
3. **The agent's reasoning is always visible.** Users should never wonder "why did it do that?"
4. **Defaults are opinionated.** The platform should suggest good configurations, not present blank canvases.
5. **Trust is earned incrementally.** Start with low-autonomy (agent suggests, human approves). Earn your way to high-autonomy (agent acts, human is notified).
6. **Outcome-first, not tool-first.** Users see what the agent is achieving, not what it's running.

---

## Moment 1: "Setting Up My Agent"

### The Anti-Pattern (What We're Avoiding)
Most platforms dump you into a blank canvas or a form with 30 fields. The user has to know what they want before they can ask for it. That's backwards — most users know their *problem*, not their *solution*.

### The Experience: Two-Panel Co-Creation

Setup is a full-screen overlay with two panels — conversation on the left, emerging configuration on the right. The user describes their intent in natural language; the AI scaffolds a complete agent blueprint that the user reviews and adjusts.

This mirrors the AutoResearch pattern: the human writes the strategy (`program.md`), the system handles execution. In Nochore, the user defines the arena — outcome, metric, systems, safety — and the agent operates within it.

```
┌─────────────────────────────────────────────────────────────┐
│ ✦ Nochore        Creating agent for Acme Corp           ✕  │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│  LEFT PANEL (40%)    │  RIGHT PANEL (60%)                   │
│  Conversational      │  Agent Configuration                 │
│  Chat                │  (Linear-style scrollable form)      │
│                      │                                      │
│  ✦ What outcome      │  ┌─ OUTCOME ───────────────────────┐│
│    should this agent │  │ Grow Qualified Demand             ││
│    own?              │  │ "Reduce qualified CPA while      ││
│                      │  │  maintaining volume"              ││
│  ┌────────────────┐  │  │                                  ││
│  │ Reduce our     │  │  │ Strategy: Focus on search term   ││
│  │ qualified CPA  │  │  │ hygiene and budget allocation    ││
│  │ on google ads  │  │  │ across high-intent campaigns.    ││
│  └────────────────┘  │  │                                  ││
│                      │  │ Cadence: [6h][▣Daily][Week][Man] ││
│  ✦ Here's your      │  └──────────────────────────────────┘│
│    blueprint for     │                                      │
│    Grow Qualified    │  ┌─ SUCCESS METRIC ─────────────────┐│
│    Demand.           │  │ Primary: Qualified CPA            ││
│                      │  │ Guardrail: Lead volume must not   ││
│                      │  │ drop more than 10%                ││
│                      │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ SYSTEMS ──────── 2 connected ──┐│
│                      │  │ ☑ Google Ads          ✓ connected││
│                      │  │ ☑ GA4                 ✓ connected││
│                      │  │ ☑ Shopify            [Connect →] ││
│                      │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ TOOLS & PERMISSIONS ────────────┐│
│                      │  │ ☑ Search Term Analysis  [read]   ││
│                      │  │ ☑ Budget Reallocation   [act]    ││
│                      │  │ ☐ Audience Builder      [read]   ││
│                      │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ POLICY ─────────────────────────┐│
│                      │  │ "Add negative keywords"          ││
│                      │  │  [Auto] [Approve] [Block]        ││
│                      │  │ "Budget changes under $50"       ││
│                      │  │  [▣Auto] [Approve] [Block]       ││
│                      │  │ "Budget changes over $50"        ││
│                      │  │  [Auto] [▣Approve] [Block]       ││
│                      │  │ + Add custom rule...             ││
│                      │  │ ☐ Require approval for ALL       ││
│                      │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ NOTIFICATIONS ──────────────────┐│
│  ┌────────────────┐  │  │ ● In-app  ○ Email  ○ Slack      ││
│  │Refine...       │  │  └──────────────────────────────────┘│
│  └────────────────┘  │                                      │
│                      │  ┌──────────────────────────────────┐│
│                      │  │       [ Launch agent → ]         ││
│                      │  └──────────────────────────────────┘│
├──────────────────────┴──────────────────────────────────────┤
```

### The Left Panel: Conversational Intent

The chat starts with a single open-ended prompt and optional template chips:

- User types intent → AI streams reasoning (visible as thinking labels) → generates full blueprint
- After blueprint lands, the chat becomes a refinement channel ("make it hourly", "remove the budget tool")
- The AI can ask ONE clarifying question at most before generating

Key principle: **the platform demonstrates understanding before asking for more.**

### The Right Panel: Six Configuration Sections

The right panel uses a Linear-style scrollable form — all sections visible, no accordion collapse. Each section has a title, summary, and inline controls.

**1. Outcome** — Name (editable), responsibility/purpose sentence, strategy note (plain-English instructions — the user's `program.md`), and cadence (manual / daily / weekly / custom).

The strategy note is where the user's intent lives. It's structured but not restrictive: guided fields, not a blank textarea or a rigid form. This is the human's interface to the agent's behavior — what they want achieved and how they want the agent to think about it.

**2. Success Metric** — The primary metric the agent optimizes toward (e.g., "Qualified CPA"). Optional guardrail metric(s) that define constraints (e.g., "lead volume must not drop more than 10%"). The metric is what makes the agent an outcome owner, not a task runner.

**3. Systems** — Which services this agent needs. The AI selects these during blueprint creation based on the agent's purpose. Already-connected services show a checkmark; services not yet in the project pool show a `[Connect]` button inline. Clicking Connect triggers the OAuth flow right there — the service lands in the project pool AND gets assigned to this agent in one step. Future agents that need the same service just select it from the pool.

**4. Tools & Permissions** — What specific tools are enabled within those connections, and at what access level (read data vs. take action). Defaults are set during setup — most users never change these. Skills and capabilities live here. Each tool shows its permission level inline so the user sees at a glance what the agent can observe vs. what it can change.

**5. Policy** — Per-tool approval rules with three levels (Auto / Approve / Block) and inline conditions (e.g., "budget changes under $50 auto-approve, over $50 ask me"). Users can add custom rules in natural language. Blocked action patterns and a global "Require approval for ALL actions" toggle at the bottom. The AI generates sensible defaults during blueprint creation based on selected tools and systems.

**6. Notifications** — How the agent reaches the human for approvals or updates. In-app (always on, default). Email and Slack as additional channels.

### Key Design Choices

- **All sections visible** — scrollable form, not wizard steps or accordion. Users see the full agent config at a glance and can edit any section in any order.
- **AI scaffolds everything** — the user doesn't build from scratch. The AI picks tools, derives system connections, generates policy rules, and suggests a cadence. The user reviews and adjusts.
- **Connections flow upward from agent needs** — the agent's blueprint drives which services get connected, not the other way around. If the agent needs Shopify and it's not connected yet, the user connects it inline during setup. The project pool is a *result* of agents being created, not a prerequisite.
- **Instructions = program.md** — the user's strategy note lives inside Outcome. It defines strategy and constraints in structured natural language. The agent follows these during execution.
- **Skills live inside Tools & Permissions** — capabilities and domain knowledge are part of the tooling section, not a separate concept.
- **Per-tool approval model** — Policy defines Auto / Approve / Block with conditions per tool. This replaces the simpler "guardrails" framing with a more precise permission model.
- **Chat and config coexist** — the user can adjust via direct manipulation (clicking toggles, editing fields) OR via chat ("remove the budget tool", "make it weekly"). Both work.
- **Defaults are opinionated** — the AI picks good defaults. The primary action is "Launch agent", not "configure more." Trust the defaults, adjust later.

---

## Moment 2: "My Agent Found Something"

### The Anti-Pattern
Most platforms: notification → click → wall of data → figure it out yourself. The user becomes a data analyst, which defeats the purpose of having an agent.

### The Experience

**Insight Cards**

The insight cards surface things the agent noticed, ordered by importance. They appear inline within the Runs tab alongside run narratives:

```
┌─────────────────────────────────────────────────┐
│  🟡 NEEDS YOUR INPUT                            │
│                                                  │
│  Budget Reallocation Opportunity                │
│  ──────────────────────────────────────         │
│  Campaign "Brand - Exact" is spending $340/day  │
│  with a CPL of $12. Campaign "Generic - Broad"  │
│  is capped at $100/day with a CPL of $8.        │
│                                                  │
│  My recommendation:                              │
│  Move $80/day from Brand to Generic.            │
│  Expected impact: ~6 more conversions/week      │
│                                                  │
│  Why I think this:                               │
│  ├─ Generic has 3x lower CPL                    │
│  ├─ Generic is losing 42% impression share      │
│  │  due to budget                               │
│  └─ Brand is already capturing 91% of           │
│     available impressions                        │
│                                                  │
│  ⚠️  Your policy: "Always ask for budget changes"│
│                                                  │
│  [Approve]  [Modify amount]  [Dismiss]          │
│  [Tell me more...]                              │
│                                                  │
└─────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────┐
│  ✅ AUTO-HANDLED                                 │
│                                                  │
│  Added 12 Negative Keywords                     │
│  ──────────────────────────────────────         │
│  Found search terms burning ~$45/day with       │
│  0 conversions over 14 days:                    │
│                                                  │
│  "free marketing tools"     $12/day  0 conv     │
│  "marketing degree online"  $9/day   0 conv     │
│  "what is digital marketing" $8/day  0 conv     │
│  ... and 9 more                                 │
│                                                  │
│  Added as exact-match negatives to all          │
│  Search campaigns.                              │
│                                                  │
│  Per your policy: auto-add negatives ✓          │
│                                                  │
│  [Undo]  [View all]                             │
│                                                  │
└─────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────┐
│  📊 FYI — NO ACTION NEEDED                     │
│                                                  │
│  Weekly Performance Snapshot                     │
│  ──────────────────────────────────────         │
│  CPL: $14.20 (↓ 8% vs last week — good)        │
│  Spend: $2,840 (on pace for monthly budget)     │
│  Conversions: 200 (↑ 12%)                       │
│                                                  │
│  Nothing unusual. Your agent is watching.       │
│                                                  │
│  [View full report]                             │
│                                                  │
└─────────────────────────────────────────────────┘
```

Key design choices:
- **Three tiers**: Needs Input (yellow) / Auto-Handled (green) / FYI (gray)
- **Reasoning is always shown** — the "why I think this" section
- **Policy is visible** — the user always sees *which rule* governed the agent's behavior
- **Undo is always available** — even for auto-handled actions
- **"Tell me more" opens a chat** — the user can interrogate the agent's reasoning conversationally

**The Chat: Interrogation Mode**

When the user clicks "Tell me more" or "Talk to agent", they enter a conversation *scoped to this agent's context*:

```
┌─────────────────────────────────────────────────┐
│  💬 Grow Qualified Demand                       │
│                                                  │
│  You: Why do you think Generic will convert     │
│  better with more budget?                       │
│                                                  │
│  Agent: Three reasons:                          │
│                                                  │
│  1. Historical data shows Generic maintains     │
│     its $8 CPL even during high-spend periods   │
│     (we tested $150/day in January).            │
│                                                  │
│  2. Impression share data shows 42% of          │
│     available searches aren't being shown —     │
│     that's untapped demand, not just more       │
│     spend on the same audience.                 │
│                                                  │
│  3. The search terms feeding Generic are high   │
│     intent ("buy marketing software",           │
│     "marketing tool pricing") — these aren't    │
│     window shoppers.                            │
│                                                  │
│  Want me to run this as a 7-day experiment      │
│  instead of a permanent change?                 │
│                                                  │
│  ┌─────────────────────────────────────────┐   │
│  │ That's smart. Run it as an experiment.   │   │
│  └─────────────────────────────────────────┘   │
│                                                  │
└─────────────────────────────────────────────────┘
```

The agent has full context: current data, historical data, learned lessons, the user's policies. It can propose experiments, explain reasoning, and negotiate.

### Run History: Before and After

The Runs tab is the default view on an agent detail page. Each run is presented as a before/after narrative — what the agent observed, what it did, and what resulted. This is the improvement loop made visible.

```
┌──────────────────────────────────────────────────┐
│  Run #47 · Daily · 2h ago                        │
│                                                   │
│  Before: Qualified CPA = $142                    │
│  Action: Reduced spend on two broad-match groups │
│  Reason: High spend, low qualified conversion    │
│  After:  Qualified CPA = $128 over 5 days        │
│  Result: ✅ Improved                              │
│  Lesson: Broad match underperforms for            │
│          renovation-intent traffic                │
│                                                   │
│  [View details ▾]  ← expands to event timeline   │
└──────────────────────────────────────────────────┘
```

The event timeline (run_started, tool_called, policy_checked, etc.) is preserved as an expandable detail view under each run. The before/after narrative is the default; the event timeline is the audit trail. Users who want to understand *what happened* read the narrative. Users who want to verify *how it happened* expand the details.

This format reinforces the agent-as-outcome-owner framing: you see what changed and whether it worked, not a log of API calls.

---

## Moment 3: "My Agent Is Getting Smarter"

### The Anti-Pattern
Most AI products are black boxes. Users don't know if the agent is getting better or just running the same logic forever. This erodes trust over time — "why am I paying for this if it's not learning?"

### The Experience

**Learned Timeline**

Accessible from the agent's Learned tab, this view shows the agent's learning journey — what it discovered, what worked, what didn't:

```
┌─────────────────────────────────────────────────┐
│  📚 Grow Qualified Demand — Learned              │
│                                                  │
│  Agent has learned 14 lessons over 6 weeks      │
│  Confidence: ████████░░ 78% (growing)           │
│                                                  │
│  ┌─ This week ─────────────────────────────┐    │
│  │                                          │    │
│  │  💡 Lesson learned (Mar 18)              │    │
│  │  "Weekend budget increases on Generic    │    │
│  │   don't convert — CPL rises 40% on      │    │
│  │   Sat/Sun. Now excluding weekends from   │    │
│  │   budget recommendations."               │    │
│  │   Evidence: Experiment #12 (Mar 8-15)    │    │
│  │                                          │    │
│  │  ✅ Experiment completed (Mar 15)        │    │
│  │  "Tested +$50/day on Generic weekends"   │    │
│  │   Result: CPL rose from $8 → $11.20      │    │
│  │   Verdict: ❌ Not effective              │    │
│  │                                          │    │
│  ├─ Last week ─────────────────────────────┤    │
│  │                                          │    │
│  │  💡 Lesson learned (Mar 10)              │    │
│  │  "Search term 'free' almost always       │    │
│  │   indicates non-buyer intent. Now        │    │
│  │   flagging 'free' terms at higher        │    │
│  │   priority."                             │    │
│  │   Evidence: 23 'free' terms, 0 convs     │    │
│  │                                          │    │
│  │  ✅ Action outcome (Mar 9)               │    │
│  │  "Moved $80/day from Brand → Generic"    │    │
│  │   Result: +8 conversions/week, CPL       │    │
│  │   held at $8.40                          │    │
│  │   Verdict: ✅ Successful — kept change   │    │
│  │                                          │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  [View all lessons]  [Export report]             │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Trust Progression**

As the agent accumulates positive outcomes, the platform subtly suggests increasing autonomy:

```
┌─────────────────────────────────────────────────┐
│  🔔 Your agent has earned more trust            │
│                                                  │
│  Grow Qualified Demand has made 23 budget       │
│  recommendations. You approved 21 of them       │
│  (91%), and 18 had positive outcomes.           │
│                                                  │
│  Would you like to let it handle small budget   │
│  changes (under $50/day) automatically?         │
│                                                  │
│  [Yes, increase autonomy]   [Not yet]           │
│                                                  │
└─────────────────────────────────────────────────┘
```

Key design choices:
- **Learned is narrated, not raw data** — "Lesson learned" not "JSONL record." The emphasis is on what the agent discovered and how it changed its behavior.
- **Experiments have clear verdicts** — the agent evaluates its own experiments
- **Trust is quantified** — approval rate, outcome success rate
- **Autonomy increases are suggested, never forced** — the user always controls the dial
- **Evidence is always linked** — every lesson traces back to a specific experiment or observation

**How trust suggestions are generated:** The system detects consistent approval patterns — counting resolved approvals by tool name within a time window (not ML, not embeddings). When consistency exceeds a threshold (default: 5+ decisions, 90%+ same outcome, 30-day window), the system suggests a learned policy rule. The user confirms, modifies, or dismisses. This is a system-level notification, not an agent suggestion — the agent never proposes increasing its own autonomy. Full mechanism: `docs/archive/2026-03-30-progressive-autonomy-design.md`.

---

## The Home Screen: Cross-Project Overview

The home screen is the **first thing users see** when they open the app. It operates at the *project* level, not the agent level — because the user's first question isn't "how is my agent doing?" but rather "do I need to do anything right now, across everything?"

This is the NotebookLM / Relay.app pattern: a browse-and-triage surface for all your projects, with drill-down into each one.

### Why a Project-Level Homepage (Not Agent-Level)

The original design jumped straight into a flat agent list. That works for 3 agents, but breaks at scale. When you manage 5 clients with 3-4 agents each, you need a higher-level entry point that lets you:

1. **Triage** — Which *project* needs my attention? (Not which agent — projects roll up attention signals.)
2. **Orient** — What's the overall health of my portfolio? (Aggregate stats across all projects.)
3. **Onboard** — What do I do first? (Empty state = "Create your first project" card, not an empty sidebar.)

### The Experience

```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│  Good morning, Chau Shyang.                             │
│  3 items across your projects need attention.            │
│                                                          │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 3        │ │ 7        │ │ 106      │ │ 76%      │  │
│  │ Projects │ │ Agents   │ │ Lessons  │ │ Avg conf │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                          │
│  ── NEEDS ATTENTION ──────────────────────────────────  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🟡 🏢 Acme Corp                              [2]│  │
│  │   Budget reallocation needs approval ·            │  │
│  │   3 posts ready for review                     →  │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ 🟡 ⚙️ Internal Ops                            [1]│  │
│  │   New competitor detected                      →  │  │
│  └──────────────────────────────────────────────────┘  │
│                                                          │
│  ── ALL PROJECTS ─────────────────────────────────────  │
│                                                          │
│  ┌────────────────────┐  ┌────────────────────┐        │
│  │ 🏢 Acme Corp       │  │ 🏥 Brightside      │        │
│  │ 3 agents · 3 conn  │  │ 2 agents · 3 conn  │        │
│  │                     │  │                     │        │
│  │ 🟡 Ad Spend Guard  │  │ 🟢 Meta Optimizer  │        │
│  │ 🟡 Content Sched   │  │ 🟢 Funnel Monitor  │        │
│  │ 🟢 Lead Qualifier  │  │                     │        │
│  │                     │  │ 47 lessons  91%     │        │
│  │ 43 lessons   76%   │  └────────────────────┘        │
│  └────────────────────┘                                 │
│  ┌────────────────────┐  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐        │
│  │ ⚙️ Internal Ops    │  │                     │        │
│  │ 2 agents · 3 conn  │  │    + New project    │        │
│  │                     │  │                     │        │
│  │ 🟢 Invoice Track   │  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘        │
│  │ 🟡 Competitor Mon  │                                 │
│  │                     │                                 │
│  │ 16 lessons   62%   │                                 │
│  └────────────────────┘                                 │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Key Design Choices

- **Project cards, not agent cards** — the homepage groups by project because that's the natural unit of work (a client, a team, an initiative)
- **Attention signals roll up** — the yellow badge on each project card counts agents that need input, so you know where to click without opening every project
- **Global stats strip** — total projects, agents, lessons, avg confidence — gives the "portfolio health" at a glance
- **Agent mini-list inside each card** — you can see which agents are healthy vs. need attention without drilling in
- **"+ New project" is a dashed card** — always visible, always inviting, matches the grid layout
- **Clicking a project card** navigates to the Project Home

---

## Project Home

The project home page is the workspace landing. It answers three questions: what systems does this brand have, what outcomes are being owned, and what needs me right now.

### Structure

**Brand Systems Summary** — A compact row of connected service badges (Google Ads, Meta, GA4, Slack, etc.) at the top, each with a status indicator. This is a summary of everything that's been connected across your agents — the project's integration footprint built up over time. Most connections originate during agent setup (the agent needs a service, the user connects it inline, it enters the pool). Users can also proactively connect services from here, but the primary path is agent-driven. A `[+ Connect service]` action sits at the end of the row for the proactive case.

**Agents Grid** — The main content. Each agent is represented by an agent card (see below). This is where the user sees the improvement loops running across their brand.

**Needs Attention** — A rolled-up section at the bottom showing pending approvals, failed runs, and disconnected systems. Items link directly to the relevant agent or setting. This collapses to nothing when everything is healthy.

---

## The Agent Card

The agent card on the project page is a dense summary of the improvement loop. Each card shows the agent as an outcome owner — not a bag of tools, but a continuously-improving system responsible for a specific result.

The card IS the "Now" view. There is no separate "Now" tab on the agent detail page. When you glance at the project page, you see the current state of every outcome the project cares about.

### Active Agent Card

```
┌──────────────────────────────────────────────────┐
│  🟢 Grow Qualified Demand                        │
│  Reduce qualified CPA while maintaining volume   │
│                                                   │
│  Qualified CPA   $128  ▁▂▃▂▁▂▃▄▃▂  (30d)       │
│                                                   │
│  ↓ 8.2% over 7 days · Paused 2 low-intent       │
│  ad sets · 2h ago                                │
│                                                   │
│  🟡 Budget change awaiting approval              │
│                                                   │
│                                    [Open →]       │
└──────────────────────────────────────────────────┘
```

Card anatomy:
- **Status dot + agent name** — green (running), yellow (needs input), red (error), gray (paused)
- **Outcome sentence** — what it's responsible for
- **Primary metric sparkline** — 30-day trend + current value
- **Last result** — one-line summary + relative time
- **Pending action** — if any approval or attention is needed
- **Single CTA: "Open"** — navigates to the agent detail page

### New Agent Card (Empty State)

```
┌──────────────────────────────────────────────────┐
│  ⚪ New Campaign Monitor                          │
│  Watch for CPA anomalies across search campaigns │
│                                                   │
│  Ready to run · Connected to Google Ads, GA4     │
│  First run will establish baseline metrics       │
│                                                   │
│                                    [Open →]       │
└──────────────────────────────────────────────────┘
```

No sparkline, no last result — the card communicates readiness and what the first run will accomplish. The empty state is a promise, not a blank space.

---

## Navigation Model: Two Modes

The app operates in two distinct visual modes — this is a deliberate design decision, not an oversight.

### Mode 1: The Lobby (Homepage)

Full-screen. No sidebar. Top navbar with logo and "New project" button. Content is a centered, max-width card grid.

**Why no sidebar?** Because there's nothing project-specific to show. The sidebar's job is to list agents within a project — it has no purpose when you're browsing *across* projects. Showing it would be noise.

### Mode 2: The Workspace (Inside a Project)

Sidebar appears on the left, scoped to the active project. It shows:
- **← All projects** link at top (back to lobby)
- **Project header** (icon, name, counts)
- **Agent list** with status dots and attention text
- **+ New agent** button at bottom

Main content area shows Project Home → Agent Detail → Runs/Chat/Learned/Settings.

```
┌─────────────────────────────────────────────────────────────┐
│ MODE 1: LOBBY (no sidebar)                                  │
│                                                             │
│   ┌─ Top Navbar ─────────────────────────────────────┐     │
│   │  ✦ Nochore                        [+ New project] │     │
│   └──────────────────────────────────────────────────┘     │
│                                                             │
│   Greeting + Stats + Project Cards (centered, max-width)    │
│                                                             │
│          ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│          │ Project A │  │ Project B │  │ + New    │         │
│          └──────────┘  └──────────┘  └──────────┘         │
│                                                             │
│                     [ click a project ]                      │
│                            ↓                                │
│                                                             │
│ MODE 2: WORKSPACE (sidebar appears)                         │
│                                                             │
│   ┌──────────┬──────────────────────────────────────┐      │
│   │ ← All    │                                       │      │
│   │  projects│   Project Home / Agent Detail /        │      │
│   │──────────│   Runs / Chat / Learned / Settings     │      │
│   │ 🏢 Acme  │                                       │      │
│   │──────────│                                       │      │
│   │ 🟡 Ad    │                                       │      │
│   │ 🟡 Cont  │                                       │      │
│   │ 🟢 Lead  │                                       │      │
│   │          │                                       │      │
│   │ [+ Agent]│                                       │      │
│   └──────────┴──────────────────────────────────────┘      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Screen Hierarchy

```
Homepage (full-screen lobby — the landing page)
 │
 └──→ Project Workspace (sidebar + content)
       │
       ├── Project Home (brand systems summary + agents grid + needs attention)
       │
       ├── Agent Detail
       │    ├── Runs (before/after narrative — the default tab, with expandable event timeline)
       │    ├── Chat (talk to this agent)
       │    ├── Learned (lessons, experiments, outcomes — was "Memory")
       │    └── Settings (outcome, metric, systems, tools, policy, notifications)
       │
       └── + New Agent (setup flow)
```

Two modes, six screens. The transition between lobby and workspace is the key UX moment — it mirrors the mental shift from "what needs my attention?" to "let me work on this specific thing."

---

## Deferred: Skill-Driven Dashboards

The concept of skill-driven monitoring views — where each skill declares metrics, tables, and trends it can render — remains valid but is deferred. For now, metric visibility lives on the agent card (sparkline + current value) and deeper analysis is available through Chat. The agent is the analyst: ask it questions, it pulls data and explains. When skills declare views in a future phase, a Monitor tab can be revived as a dedicated surface for persistent data visibility.
