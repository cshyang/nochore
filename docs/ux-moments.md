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

### The Experience

**Step 1: Describe the Job (Intent)**

The setup starts with a single open-ended prompt — a chat bubble, not a form:

```
┌─────────────────────────────────────────────────┐
│                                                  │
│  What do you want your agent to help with?       │
│                                                  │
│  ┌─────────────────────────────────────────┐    │
│  │ I want to monitor our Google Ads and     │    │
│  │ make sure we're not wasting budget on    │    │
│  │ bad search terms                         │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│  Or start from a template:                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐    │
│  │ Ad Spend  │ │ E-comm   │ │ Social Media │    │
│  │ Manager   │ │ Monitor  │ │ Scheduler    │    │
│  └──────────┘ └──────────┘ └──────────────┘    │
│                                                  │
└─────────────────────────────────────────────────┘
```

The platform uses the LLM to parse intent and asks ONE follow-up question at most:

```
"Got it — you want to manage ad spend efficiency, focusing on
 search term waste. Should I also watch for budget allocation
 issues across campaigns, or just search terms for now?"
```

This is critical: **the platform demonstrates understanding before asking for more.**

**Step 2: Suggested Configuration (Skills + Tools)**

Based on intent, the platform suggests a complete configuration. The user doesn't pick from a catalog — they review a recommendation:

```
┌─────────────────────────────────────────────────┐
│                                                  │
│  Here's what I'd set up for you:                │
│                                                  │
│  SKILLS                                          │
│  ┌──────────────────────────────────────────┐   │
│  │ ✅ Search Term Analysis                   │   │
│  │    Detects wasteful terms, suggests       │   │
│  │    negatives                              │   │
│  │                                           │   │
│  │ ✅ Budget Allocation                      │   │
│  │    Spots over/under-spending across       │   │
│  │    campaigns                              │   │
│  │                                           │   │
│  │ ○  Trend Forecasting (optional)           │   │
│  │    Predicts next-week performance         │   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  CONNECTIONS                                     │
│  ┌──────────────────────────────────────────┐   │
│  │ 🔌 Google Ads    [Connect →]             │   │
│  │ 🔌 Slack         [Connect →] (for alerts)│   │
│  └──────────────────────────────────────────┘   │
│                                                  │
│  Looks good? You can adjust after setup too.    │
│                                                  │
│        [Adjust]        [Looks good →]           │
│                                                  │
└─────────────────────────────────────────────────┘
```

Key design choices:
- Skills are pre-selected based on intent (not a blank marketplace browse)
- Optional skills are shown but not checked — progressive disclosure
- Connections show *why* they're needed ("for alerts")
- "Adjust" is secondary; "Looks good" is primary — trust the defaults

**Step 3: Set the Rules (Policy)**

This is where we differentiate. Instead of a settings page, we frame policies as *the agent asking for its boundaries*:

```
┌─────────────────────────────────────────────────┐
│                                                  │
│  Before I start, a few ground rules:            │
│                                                  │
│  When I find wasteful search terms...           │
│  ◉ Add negative keywords automatically          │
│  ○ Show me first, I'll decide                   │
│  ○ Add them, but notify me after                │
│                                                  │
│  For budget changes...                           │
│  ○ Adjust automatically (within limits)         │
│  ◉ Always ask me first                          │
│  ○ Never touch budgets                          │
│                                                  │
│  ┌─ Advanced ──────────────────────────────┐    │
│  │ Max budget change per day:  $ [100    ] │    │
│  │ Notify me via:   ◉ Slack  ○ Email      │    │
│  │ Active hours:    9am - 6pm EST          │    │
│  └─────────────────────────────────────────┘    │
│                                                  │
│        [← Back]          [Start agent →]        │
│                                                  │
└─────────────────────────────────────────────────┘
```

Key design choices:
- Policies are phrased as *decisions about autonomy*, not settings
- The defaults are conservative (ask first for high-impact actions)
- Advanced settings are collapsed — most users never open them
- The language is first-person from the agent ("When I find...")

**Step 4: Agent Card (Summary)**

After setup, the user sees their agent as a persistent "card":

```
┌─────────────────────────────────────────────────┐
│  🟢 Ad Spend Guardian                           │
│  "Monitor Google Ads for search term waste      │
│   and budget inefficiencies"                    │
│                                                  │
│  Skills: Search Terms · Budget Allocation       │
│  Tools:  Google Ads · Slack                     │
│  Policy: Auto-add negatives · Ask for budgets   │
│  Schedule: Checks every 6 hours                 │
│                                                  │
│  Last run: 2 minutes ago — all clear            │
│  Memory: 0 lessons learned (just getting started)│
│                                                  │
│  [Talk to agent]  [View history]  [Settings]    │
│                                                  │
└─────────────────────────────────────────────────┘
```

The agent card is the anchor of the experience. It's always visible. It's how the user relates to their agent.

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
