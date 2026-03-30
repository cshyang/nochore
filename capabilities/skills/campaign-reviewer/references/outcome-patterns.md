# Outcome Tracking Patterns

Advanced patterns for evaluating action effectiveness and building institutional knowledge.

---

## Iterative Improvement Loop

Campaign optimization is never one-and-done. Each action reveals the next layer of problems:

```
Action A blocks problem P1
  → P1 is gone, but P2 (previously hidden by P1's noise) becomes visible
  → Action B addresses P2
  → P2 improves, but P3 surfaces (or P1 returns in a new form)
  → This is EXPECTED, not failure
```

When evaluating outcomes, distinguish between:
- **Action failure:** The action didn't achieve its specific goal (negatives didn't block the terms)
- **Problem shifting:** The action worked but the broader problem persists through different symptoms (new junk terms replace blocked ones — this confirms a systemic issue like match type settings)

Problem shifting is the most valuable signal — it reveals the structural root cause.

---

## Multi-Action Attribution

When multiple actions were taken in the same period, attributing outcomes is harder:

1. **Stagger actions when possible.** Allow one action's impact to be measured before taking the next.
2. **When actions overlap:** Identify which metrics each action should have affected. If metric A improved and only action 1 targeted it, attribute to action 1.
3. **When attribution is ambiguous:** Note both possible causes. Future cycles may clarify (if one action is reversed and the metric holds, the other action was likely responsible).

---

## Maturity Signals

Track the ratio of confirmed vs contradicted findings over time:

- **High confirmation rate** (>70% of reviewed findings confirmed) → The analytical model is accurate for this client. Increase confidence in similar recommendations.
- **High contradiction rate** (>30% of reviewed findings contradicted) → The model needs revision. The client's dynamics are poorly understood. Slow down on actions, increase investigation.
- **No outcomes recorded** → Actions are being taken but not validated. This is a process gap — flag it explicitly.

---

## Feedback Loop to Knowledge

Outcomes should feed back into the knowledge store in a way that makes the agent smarter:

**Working outcome:**
```markdown
- OUTCOME [date]: "Scout negative list. WORKING. Junk ratio 93% → 71%. Construction cluster fully eliminated.
  Note: new junk clusters surfaced (renovation loan, property agent) — confirms systemic match type issue, not just missing negatives."
```

**Not-working outcome:**
```markdown
- OUTCOME [date]: "Budget increase on Campaign X. NOT WORKING. CPL increased 12% despite 15% budget increase.
  Root cause revision: campaign was losing IS to rank, not budget. QS of 2 means higher bids don't improve position efficiently.
  Revised approach: fix QS first, then revisit budget."
```

The "note" and "root cause revision" sections are the institutional learning — they prevent the same mistake from being repeated.

---

## When NOT to Track

Not every action needs formal outcome tracking:

- **One-time fixes** (e.g., fixing a tracking pixel) — verify it works, but no ongoing tracking needed
- **Hygiene tasks** (e.g., adding obvious negatives like competitor brand names) — the outcome is binary and immediate
- **Exploratory actions** marked as experiments — these have their own experiment/hypothesis tracking loop in the memory store

Focus outcome tracking on **strategic actions** where the expected impact is quantifiable and the verdict informs future decisions.
