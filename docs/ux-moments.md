# UX Design: The Three Defining Moments

## Design Principles (Before We Draw Anything)

1. **Conversational over forms.** Setting up an agent should feel like briefing a new hire, not filling out a tax return.
2. **Progressive disclosure.** Show the minimum needed. Reveal complexity only when the user reaches for it.
3. **The agent's reasoning is always visible.** Users should never wonder "why did it do that?"
4. **Defaults are opinionated.** The platform should suggest good configurations, not present blank canvases.
5. **Trust is earned incrementally.** Start with low-autonomy (agent suggests, human approves). Earn your way to high-autonomy (agent acts, human is notified).

---

## Moment 1: "Setting Up My Agent"

### The Anti-Pattern (What We're Avoiding)
Most platforms dump you into a blank canvas or a form with 30 fields. The user has to know what they want before they can ask for it. That's backwards — most users know their *problem*, not their *solution*.

### The Experience: Two-Panel Co-Creation

Setup is a full-screen overlay with two panels — conversation on the left, emerging configuration on the right. The user describes their intent in natural language; the AI scaffolds a complete agent blueprint that the user reviews and adjusts.

This mirrors the AutoResearch pattern: the human writes the strategy (`program.md`), the system handles execution. In Nochore, the user defines intent and constraints; the AI picks skills, connections, guardrails, and schedule.

```
┌─────────────────────────────────────────────────────────────┐
│ ✦ Nochore        Creating agent for Acme Corp           ✕  │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                      │
│  LEFT PANEL (40%)    │  RIGHT PANEL (60%)                   │
│  Conversational      │  Agent Configuration                 │
│  Chat                │  (Linear-style scrollable form)      │
│                      │                                      │
│  ✦ What should this  │  ┌─ IDENTITY ──────────────────────┐│
│    agent keep an     │  │ Google Ads Optimizer             ││
│    eye on?           │  │ "Analyzes search terms to..."   ││
│                      │  │                                  ││
│  ┌────────────────┐  │  │ Focus areas: ROAS, waste        ││
│  │ Optimize my    │  │  │ Constraints: Stay within budget ││
│  │ google ads     │  │  └──────────────────────────────────┘│
│  └────────────────┘  │                                      │
│                      │  ┌─ SKILLS ──────────── 1 selected ─┐│
│  ✦ Here's your      │  │ ☑ Search Term Analysis           ││
│    blueprint for     │  │   └ Requires: Google Ads, GA4   ││
│    Google Ads        │  │ ☐ Budget Monitor                 ││
│    Optimizer.        │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ GUARDRAILS ─────────────────────┐│
│                      │  │ "Add negative keywords"          ││
│                      │  │  [Auto] [Approve] [Block]        ││
│                      │  │ + Add custom guardrail...        ││
│                      │  │ ☐ Require approval for ALL       ││
│                      │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ NOTIFICATIONS ──────────────────┐│
│                      │  │ ● In-app  ○ Email  ○ Slack      ││
│                      │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌─ TRIGGER ────────────────────────┐│
│  ┌────────────────┐  │  │ [Hourly][6h][▣Daily][Week][Man] ││
│  │Refine...       │  │  │ ○ Webhook (coming soon)         ││
│  └────────────────┘  │  └──────────────────────────────────┘│
│                      │                                      │
│                      │  ┌──────────────────────────────────┐│
│                      │  │       [ Launch agent → ]         ││
│                      │  └──────────────────────────────────┘│
├──────────────────────┴──────────────────────────────────────┤
```

### The Left Panel: Conversational Intent

The chat starts with a single open-ended prompt and optional template chips:

- User types intent → AI streams reasoning (visible as thinking labels) → generates full blueprint
- After blueprint lands, the chat becomes a refinement channel ("make it hourly", "remove the budget skill")
- The AI can ask ONE clarifying question at most before generating

Key principle: **the platform demonstrates understanding before asking for more.**

### The Right Panel: Five Configuration Sections

The right panel uses a Linear-style scrollable form — all sections visible, no accordion collapse. Each section has a title, summary, and inline controls.

**1. Identity** — Name (editable), summary (editable), and structured instructions:
- Focus areas (what to watch for)
- Constraints (what to avoid or respect)

Instructions are the user's `program.md` — the strategy file that guides the agent's behavior. They're structured but not restrictive: guided fields, not a blank textarea or a rigid form.

**2. Skills** — Toggleable rows with descriptions. Each skill shows its required data connections inline ("Requires: Google Ads, GA4"). Skills drive the connection requirements — there's no separate connections section for data sources.

**3. Guardrails** — AI-suggested rules with three levels per rule (Auto / Approve first / Block). Users can add custom guardrails in natural language ("Never exceed daily budget by more than 10%"). Global "Require approval for ALL actions" toggle at the bottom.

Guardrails are instruction-based, not rigid rules. The AI generates defaults during blueprint creation based on selected skills and connections. Users refine via the form or the chat.

**4. Notifications** — How the agent reaches the human for approval or updates. In-app (always on, default). Email and Slack shown as future options. This is separated from Guardrails because policies define WHAT needs human input, notifications define HOW the human is reached.

**5. Trigger** — When the agent runs. Scheduled presets (hourly / 6h / daily / weekly). Manual option. Webhook/event-driven shown as "coming soon."

### Key Design Choices

- **All sections visible** — scrollable form, not wizard steps or accordion. Users see the full agent config at a glance and can edit any section in any order.
- **AI scaffolds everything** — the user doesn't build from scratch. The AI picks skills, derives connections, generates guardrails, and suggests a schedule. The user reviews and adjusts.
- **Connections are contextualized** — no standalone connections section. Data connections appear under the skills that need them. Action connections (Slack, email) appear under Notifications.
- **Chat and config coexist** — the user can adjust via direct manipulation (clicking toggles, editing fields) OR via chat ("remove the budget skill", "make it weekly"). Both work.
- **Instructions = program.md** — the user defines strategy and constraints in structured natural language. The agent follows these during execution. This is the human's interface to the agent's behavior.
- **Defaults are opinionated** — the AI picks good defaults. The primary action is "Launch agent", not "configure more." Trust the defaults, adjust later.

---

## Moment 2: "My Agent Found Something"

### The Anti-Pattern
Most platforms: notification → click → wall of data → figure it out yourself. The user becomes a data analyst, which defeats the purpose of having an agent.

### The Experience

**The Feed: Insight Cards**

The primary surface is a feed of "insight cards" — things the agent noticed, ordered by importance:

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
│  💬 Ad Spend Guardian                           │
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

The agent has full context: current data, historical data, memory of past experiments, the user's policies. It can propose experiments, explain reasoning, and negotiate.

---

## Moment 3: "My Agent Is Getting Smarter"

### The Anti-Pattern
Most AI products are black boxes. Users don't know if the agent is getting better or just running the same logic forever. This erodes trust over time — "why am I paying for this if it's not learning?"

### The Experience

**Memory Timeline**

Accessible from the agent card, the memory view shows the agent's learning journey:

```
┌─────────────────────────────────────────────────┐
│  📚 Ad Spend Guardian — Memory                  │
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
│  Ad Spend Guardian has made 23 budget           │
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
- **Memory is narrated, not raw data** — "Lesson learned" not "JSONL record"
- **Experiments have clear verdicts** — the agent evaluates its own experiments
- **Trust is quantified** — approval rate, outcome success rate
- **Autonomy increases are suggested, never forced** — the user always controls the dial
- **Evidence is always linked** — every lesson traces back to a specific experiment or observation

---

## The Home Screen: Cross-Project Overview

The home screen is the **first thing users see** when they open the app. It operates at the *project* level, not the agent level — because the user's first question isn't "how is my Ad Spend Guardian doing?" but rather "do I need to do anything right now, across everything?"

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
- **Clicking a project card** navigates to the Project Home (agents + connections view)

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

Main content area shows Project Home → Agent Detail → Monitor/Feed/Chat/Memory/Settings.

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
│   │──────────│   Monitor / Feed / Chat / Memory       │      │
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
       ├── Project Home (agents grid + connections tab)
       │    └── Connections Manager
       │
       ├── Agent Detail
       │    ├── Monitor (skill-driven performance dashboard — the default tab)
       │    ├── Feed (insight cards — event-driven alerts)
       │    ├── Chat (talk to this agent)
       │    ├── Memory (lessons, experiments, outcomes)
       │    └── Settings (intent, skills, tools, policy)
       │
       ├── + New Agent (setup flow)
       │
       └── Marketplace (browse/install skills & policies)
```

Two modes, seven screens. The transition between lobby and workspace is the key UX moment — it mirrors the mental shift from "what needs my attention?" to "let me work on this specific thing."

---

## The Monitor Tab: "What My Agent Sees"

### The Gap It Fills

The Feed answers "what did the agent *find*?" — reactive, event-driven. But users also need to answer "how is the thing I'm monitoring actually *performing*?" That's a different question. It's not an alert; it's ongoing visibility into the data the agent watches.

Example: You have an Ad Spend Guardian running on Google Ads. The Feed tells you "CPL spiked 40% yesterday." But you also want to open the agent and *see*: keyword performance table, spend trend for the last 30 days, quality score distribution, wasted spend breakdown. Not as a one-time insight — as a persistent, always-up-to-date view.

### Why Not Just Build a Dashboard Tool?

The tension: if we go too deep into dashboards, we're building a BI tool. That's not what Nochore is. The agent should be the one *interpreting* the data — the user shouldn't need to stare at charts to find problems.

The answer: **the Monitor tab shows what the agent's skills expose as monitorable**, not arbitrary user-configured charts. The agent decides what's worth showing based on its skills and domain knowledge. Think of it like checking in on an employee's desk — you see the key numbers they're tracking, contextualized by their expertise.

### How Skills Drive the Monitor

Each skill can declare a set of **views** — metrics, tables, and trends it can render. The Monitor tab composes these views together:

```
Skill: "Ad Spend Analysis"
  └── Views:
       ├── KPI cards: total spend, CPL, conversions, wasted spend
       ├── Trend: daily spend over time
       ├── Table: top keywords by spend (with quality scores, waste flags)
       └── Insight callout: agent's current assessment of the data
```

This means different agents show completely different Monitor tabs depending on their skills. An Ad Spend Guardian shows keywords and CPL. A Funnel Monitor shows conversion stages and drop-off rates. An Invoice Tracker shows outstanding amounts and aging buckets. The UI structure is consistent (KPIs → trends → tables → agent insight), but the content is skill-driven.

### Design Principles

- **Monitor is the default tab** — when you click into an agent, this is what you see first. It's the "home base" for that agent.
- **Agent insight at the bottom** — the Monitor always ends with the agent's own interpretation of what the data means. This bridges the gap between raw metrics and the Feed's event-driven insights.
- **Time range picker** — 24h / 7d / 30d / 90d. Users need to zoom in and out to understand trends.
- **Waste/anomaly highlighting** — rows or metrics that the agent has flagged get visual treatment (red badges, tinted backgrounds). The agent's judgment is visible in the data, not just in the Feed.
- **"Powered by skills" label** — makes it clear this isn't a generic dashboard. The views come from the agent's domain expertise.
