# Run Report Design — Guiding Principles

**Status:** Shape (pre-plan). No implementation yet.
**Date:** 2026-04-21
**Trigger:** User triggered an ad-hoc chat run ("check AI Max performance") and got back a rigidly-formatted "Homescape Google Ads — Weekly Optimization Report" with account header, campaign table, and canned section structure — regardless of the fact that the run's actual intent was a focused investigation, not a weekly sweep.

## Verdict on current implementation

The platform is architecturally clean. The rigid report shape is **not** hardcoded in the harness, worker, or UI. The agent authors its own format — end to end:

- `services/worker/src/lib/pi-runtime.ts:79-102` — `submit_report` tool accepts one field: `report: string` (arbitrary markdown). Zero structural constraints.
- `services/worker/src/lib/agent-runtime.ts:107-139` — prompt assembly injects the agent's `description`, `instructions`, selected skills, and workspace `KNOWLEDGE.md`. Only generic execution rules are platform-prescribed.
- `apps/web/src/components/RunDetail*.tsx` — renders whatever text arrived, as raw markdown. No schema extraction.

The `Weekly Optimization Report` title, the `Period | Currency | Trigger` metadata block, and the fixed section layout all trace to **the agent's `instructions` field** (authored during onboarding). The platform is a pass-through.

## The real problem

Domain coupling is not the issue. The issue is that **the platform gives agent authors a blank canvas with no framing, and the default authoring instinct is "write a report template."** Domain experts default to document-shaped output because that's what they know. The platform never counters that instinct.

Symptoms observable in the screenshot:

1. **Identity restated in the title.** "Homescape Google Ads — Weekly Optimization Report" repeats what the user already knows from the sidebar context. The title should carry the *finding*, not the agent's nameplate.
2. **Format is rigid, trigger is ignored.** The user asked an ad-hoc question about AI Max. The agent produced the same weekly-audit shape it would produce on a Monday cron. The trigger intent never reshapes output.
3. **Verdict is buried.** The headline finding ("~40% of AI Max spend wasted on irrelevant queries") sits mid-report, behind tables that may be irrelevant to the question asked.
4. **Flat hierarchy.** Everything is an equally-weighted section. No progressive disclosure. The rendered artifact is a 5-page printable, not an agent-native surface.
5. **Trigger is serialized as JSON, not framed as intent.** At `agent-runtime.ts:141-151` the user-prompt is `JSON.stringify({ trigger, projectId, ... })`. The agent sees a payload, not a question. It falls back on its instruction-template because the trigger doesn't announce itself as a distinct intent.

## Guiding principles

### 1. Report ≠ report-document

Drop the word *report* as the primary metaphor. What the agent produces is a **finding** — a response to a trigger. Findings have an inherent shape: verdict → evidence → actions → watch signals. That shape is agent-native and mirrors how a trusted analyst responds to a Slack question.

### 2. Verdict first, always

The first thing rendered in RunDetail is the conclusion in one sentence. Not a title. Not a period header. The verdict. Everything else is justification. A user should know in 2 seconds whether they need to care about this run.

### 3. Trigger shapes response

A scheduled weekly run and a chat-initiated focused question are different artifacts. Same agent, same tools, different output. The platform must surface the trigger's *intent* to the agent as a first-class instruction — not as a JSON blob. The agent must visibly adapt.

### 4. Identity goes in the chrome, not the content

Agent name + timestamp + trigger source live in the header chip. The title slot is owned by the finding. No more "Agent Name — Report Type" vanity titles.

### 5. Progressive disclosure by default

Verdict visible. Evidence expandable. Tables collapsed. Raw data one click away. The dossier-style memory UI already follows this pattern; the run surface should match.

### 6. Shape through voice, not schema

Tell the agent **what to accomplish** and trust it to produce a response. Do not dictate **how** to structure it via required fields. "Lead with your conclusion. Match depth to the trigger. Answer the question that was asked." — that is behavioral guidance in the prompt, not a contract the agent must conform to. A slot schema is just a scripted flow wearing a Zod costume; it constrains reasoning where reasoning should be free.

### 7. Author describes strategy, not format

The onboarding prompt today asks domain experts to "describe how to format findings" in their instructions field. That is backwards. Authors describe **what the agent should look for and how it should think** — the investigation approach, what patterns matter, what to prioritize. Output voice lives in the platform's runtime prompt, where it's consistent across every agent without being domain-specific.

### 8. Convention, not enforcement

Conventions the platform teaches via prompt: "First sentence is the conclusion. No vanity titles. Prose over tables when prose conveys the point." The UI reads by convention (first sentence → headline preview, first heading → section anchor) — it does not reject output that violates convention. Agents that follow the convention get better rendering; agents that don't still render.

## Three intervention surfaces

The principles above map onto three files. None of them change the output schema — the whole intervention is in framing and guidance:

| Surface | File | Current state | Intervention |
|---|---|---|---|
| Output contract | `pi-runtime.ts:79-102` | `submit_report({ report: string })` | **No schema change.** Tighten the tool description to convey the conventions (lead with conclusion, respond to the trigger, no vanity titles). |
| Prompt framing | `agent-runtime.ts:107-151` | Trigger passed as `JSON.stringify(...)` payload | Promote trigger to a named "The user asked:" section in plain language. Add a "Response approach" block to execution rules that carries the voice conventions. |
| Author guidance | `capabilities/prompts/onboard-agent/PROMPT.md` | "Instructions field describes how to format findings" | Remove all formatting guidance. Authors describe **what the agent should look for and prioritize** (strategy). Voice is the platform's job. |

## Direction

**Freeform markdown output, behavior shaped at the prompt layer.** Schema stays `{ report: string }` — the shape is already correct; the problem is that the agent has no guidance on how to *use* that string, so it defaults to document-shaped output.

The whole intervention sits in `agent-runtime.ts`'s execution rules. Something in the voice of:

> **Response approach**
> - Lead with your conclusion in the first sentence. Do not open with a title, a period header, or a restatement of who you are — the user already knows.
> - Match depth to the trigger. An ad-hoc question gets a focused answer. A scheduled sweep gets a broader one. Do not fall back on a default template.
> - Structure your response around what was asked, not a fixed section order. Prose over tables where prose conveys the point. Reserve tables for genuinely tabular data.
> - Put evidence and recommended actions before raw data. Deep data is a reference, not the body.

And the trigger gets promoted from JSON payload to:

> **The user asked:** *{trigger description in plain language}*
>
> Respond directly to that.

UI adapts by reading convention, not schema:

- First sentence of `finalText` → sidebar preview / run-list headline (already works this way; the difference is that with the new prompt, the first sentence is *actually the conclusion*, not a restated title).
- Markdown rendered as-is in `NarrativeCard` with current styling — possibly tightened typography for readability, but no structural change.
- If the agent does produce tables or data dumps, markdown rendering handles them; collapsing-by-default is a presentation concern that can evolve independently.

**Why this is the right shape:** it sets no schema contract the agent must obey. Every agent — analyst, code reviewer, content writer, triage bot — can produce its natural response shape. The platform teaches *behavior* through the prompt, the same way a good editor coaches a writer, not through forms the writer must fill in. This matches Nochore's stance that agents are general-purpose outcome owners, not analyst-shaped objects.

## Out of scope

- Migrating existing agent instructions. Let them render in the new UI via `verdict = first sentence of finalText`, `body = the rest`. Authors can upgrade their instructions when they want.
- Multi-run comparison (diff between this week's finding and last week's). Separate design.
- Report export (PDF, email). Notification design is its own surface.
- Verdict quality grading (was the verdict accurate?). That's a memory/learning layer concern.

## Open questions

- **Can prompt-level guidance hold up across dozens of agents?** Convention-based behavior drifts. If the "first sentence is the conclusion" rule doesn't stick empirically, the next move is stronger prompt wording — not a schema. Schema is the last resort.
- **Does `extractRunInsights` need to change?** Probably not. It already works on `finalText` freeform. If the first sentence is now reliably a conclusion, extraction quality improves for free.
- **Preview text in RunList today uses `headline`, constructed by `firstSentence(finalText)`.** That stays. The improvement comes from the first sentence being a real conclusion, not a title.

## Known follow-up debt

- The Homescape Ads agent's `instructions` field contains the old report template. After the prompt-layer shift ships, users should be prompted to migrate their instructions to strategy-only. No automatic rewrite; old instructions keep working (the agent will just produce the format its instructions tell it to, overriding platform voice guidance for that agent).
- Agents authored before this change will need the onboarding prompt re-applied or manually edited. The platform runtime-prompt additions apply immediately to all agents; the onboarding-prompt shift only affects new agents.
