# Analytical Principles Reference

Deep reasoning frameworks for campaign analysis. Load when analysis requires nuanced judgment beyond the quick principles in the main skill.

---

## Search Term Reasoning Framework

### Intent Classification
When reviewing search terms, classify each by intent match quality:
- **Direct match**: Term clearly describes the client's service (e.g., "interior design singapore" for Homescape)
- **Adjacent intent**: Related but not exact (e.g., "renovation ideas" — user might want a designer or might want DIY)
- **Wrong intent**: Different service entirely (e.g., "construction company" — they want a builder, not a designer)
- **Competitor**: Looking for a specific competitor by name
- **Informational**: Research queries (e.g., "how much does renovation cost") — may convert but at lower rates

### Theme Clustering Strategy
Before recommending negative keywords, group them:
1. Identify semantic clusters (terms sharing root words or concepts)
2. For clusters of 3+ terms: recommend a phrase-match negative on the common root
3. For isolated terms: recommend exact-match negatives
4. Check if cluster represents a match-type problem (too many broad-match terms pulling irrelevant queries → consider tightening match types instead)

### When NOT to Negative
- Brand terms of the client (even if zero conversions — these have brand value)
- High-intent terms with low volume (< 5 clicks) — insufficient data
- Terms that match a service the client offers but hasn't explicitly listed as a campaign target

---

## Budget Allocation Framework

### Portfolio Optimization Logic
1. Calculate CPL for each campaign
2. Rank campaigns by efficiency (lowest CPL first)
3. Identify which efficient campaigns are budget-constrained (IS lost to budget > 10%)
4. Identify which inefficient campaigns have excess budget (high IS, high CPL)
5. Recommend reallocation: shift from inefficient to efficient
6. Only recommend net budget increases if ALL efficient campaigns are capped AND CPL targets are being met

### Budget Change Sizing
- Start conservative: 10-15% changes per cycle
- Never recommend > 25% change in a single action
- If a campaign needs > 25%, break into sequential changes with review periods
- Factor in the 7-day cooldown constraint from the canary policy

---

## Root Cause Investigation

### For KPI Changes (CPL spike, CVR drop, volume decline)
When a KPI changes significantly, investigate in this order:
1. **Scope**: Is it all campaigns or specific ones? All brands or one? Google or Meta or both?
2. **External factors**: Seasonal patterns, market changes (check organic demand trends from Search Console)
3. **Internal changes**: Were campaigns modified recently? (Check memory for recent actions)
4. **Competition**: Impression share trends indicate competitive pressure
5. **Quality**: QS changes, landing page engagement changes
6. **Composition**: Traffic mix shifts (device, geo, time of day)

Present the most likely root cause with supporting evidence from at least 2 data sources.

### For Chronic Structural Problems (high junk ratio, persistently low QS, poor CVR)
These aren't changes — they're ongoing conditions. Investigate the account structure:

**High junk ratio (>40% spend on zero-conversion terms):**
1. Check if the problem is concentrated in specific campaigns/ad groups or spread across all
2. Look at the TYPES of junk terms — are they all one theme (match type problem) or diverse (targeting problem)?
3. If one theme dominates: likely a few broad-match keywords pulling irrelevant queries → tighten match types
4. If diverse junk: likely poor account structure — ad groups mixing too many intents → restructure by intent
5. Check if converting terms share characteristics that junk terms don't (e.g., all converters mention "design" while junk mentions "construction") — this reveals the intent boundary
6. Ask: "Would tightening match types from broad to phrase prevent most of this junk?" If yes, that's the structural fix. Negatives are the band-aid.

**Persistently low QS across many keywords:**
1. If landing_page is BELOW_AVERAGE on most: check PageSpeed, mobile usability, content relevance
2. If ad_relevance is BELOW_AVERAGE on most: ad copy doesn't match keyword intent — review ad-keyword alignment
3. If expected_ctr is BELOW_AVERAGE on most: ads aren't compelling or position is too low — review ad copy and bidding
4. If ALL three are below average: fundamental mismatch between keywords, ads, and landing page — likely needs account restructure
5. Cross-reference with GA4: if GA4 shows high engagement on the same landing page, the QS issue is likely technical (speed) not content

**Relevant terms with zero conversions:**
1. These are the most important terms to investigate — they have the right intent but aren't converting
2. Check landing page alignment: does the landing page match what the searcher expects?
3. Check GA4 engagement for those specific landing pages — high engagement + zero conversions = CTA/form problem
4. Check if the conversion tracking is set up correctly (are conversions being attributed?)
5. Compare against converting terms: what's different about the journey?

### The Band-Aid vs Structural Fix Framework
Always distinguish between treating symptoms and fixing causes:

| Symptom treatment (band-aid) | Root cause fix (structural) |
|------------------------------|---------------------------|
| Add negative keywords | Tighten match types to prevent junk at source |
| Pause underperforming keywords | Restructure ad groups by intent |
| Increase budget on capped campaign | Fix QS to get more impressions at same budget |
| Reduce bids to lower CPL | Improve landing page to increase CVR |
| Add more keywords for volume | Fix conversion tracking to count existing conversions |

Recommend BOTH. Label clearly. The structural fix takes longer but solves the problem. The band-aid provides immediate relief while the structural fix is implemented.

---

## Outcome Tracking

Outcome evaluation is handled by the **campaign-reviewer** skill. The campaign-analysis skill invokes it at Step 2 when past executed actions exist in memory. For standalone use ("did Scout work?"), invoke the campaign-reviewer skill directly.

See the campaign-reviewer skill and its `references/outcome-patterns.md` for the full evaluation framework, verdict system, and feedback loop patterns.
