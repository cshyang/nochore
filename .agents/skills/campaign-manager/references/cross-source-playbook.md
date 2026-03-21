# Cross-Source Playbook

Deep tactical patterns for complex analysis scenarios. Load when analyzing multi-brand clients, when the user asks for cross-platform comparison, or when a routine check surfaces conflicting signals between sources.

---

## Multi-Brand Analysis

Run `campaign check <id> --brand <name> --format json` per brand. Compare KPIs across brands to identify which brand is dragging aggregate performance.

**Cannibalization detection:**
- SC queries overlapping between brands — same query driving clicks to multiple brand pages
- GA4 landing pages receiving traffic for the wrong brand — paid traffic landing on a page associated with a different brand
- Budget allocation review: Compare per-brand CPL against each brand's `quality_signals` and `ticket_size` from config context

**Cross-brand reporting:**
Present per-brand findings first, then aggregate view with cross-brand insights. Flag when one brand is subsidizing another (e.g., brand A has CPL 3x of brand B but gets 60% of budget).

---

## Google Ads + Meta Cross-Platform Patterns

**Same landing page, different traffic quality:**
Compare GA4 engagement by `channel_group` (Paid Search vs Paid Social). If Paid Social engagement is significantly lower on the same page, the creative/targeting mismatch is on Meta, not the landing page.

**Budget allocation signals:**
If Google CPL rising but Meta CPL stable (or vice versa), consider reallocation. Check both platforms' impression share — the platform with more headroom benefits more from additional budget.

**Attribution overlap:**
Same user journey may credit both platforms. If total lead volume matches or exceeds sum of individual platform leads, indicates attribution overlap, not additive value.

---

## CPL Change Investigation Reasoning

When `kpi_summary` shows significant CPL change:

1. **Magnitude and direction** — From `kpi_summary.cpl_change_pct`. Determine if this is Google, Meta, or both from `platform_currency_breakdown`.
2. **Competition signals** — IS lost to rank increasing = competitors bidding higher. CPC changes confirm.
3. **Quality signals** — QS changes, search term quality. High junk ratio (spend on zero-conversion terms / total spend) drives CPL up.
4. **Composition shifts** — Device/geo/hour mix changes. A shift toward mobile (typically lower CVR) raises CPL even if nothing else changed.
5. **Post-click quality (GA4)** — Engagement on ad landing pages. If `web_quality.paid_engagement_gaps` shows paid engagement much lower than organic, targeting or creative is sending wrong audience.
6. **Market demand (SC)** — If `organic_search.demand_trends` shows falling impressions for core queries, the addressable market is shrinking, which concentrates spend on fewer opportunities and raises CPL.

Synthesis: Rank contributing factors by estimated impact. Present top 3 in the action plan.

---

## GA4 Engagement Benchmarks

| Metric | Problem | Acceptable | Good |
|--------|---------|------------|------|
| Engagement Rate | < 40% | 40-60% | > 60% |
| Key Event Rate | < 1% (high-traffic pages) | 1-3% | > 3% |
| Paid vs Organic gap | > 15pp difference | 5-15pp | < 5pp |

**Interpretation:**
- Low engagement + high sessions = targeting mismatch (wrong audience reaching the page)
- Low key events + high engagement = page experience is fine but CTA/form/offer is weak
- Large paid vs organic gap = ad creative or targeting is attracting less qualified visitors than organic search does

---

## Search Console CTR Benchmarks

| Position | Expected CTR | Below this = opportunity |
|----------|-------------|--------------------------|
| 1 | ~30% | < 20% |
| 2-3 | ~10% | < 5% |
| 4-5 | ~5% | < 2% |
| 6-10 | ~2% | < 1% |

Queries with high impressions but CTR below benchmark indicate title/description improvement opportunities. These same queries may also be good paid keyword expansion candidates.

**Demand trend interpretation:**
- Rising (+30% impressions): Market demand increasing — consider expanding paid coverage
- Falling (-30% impressions): Demand shrinking or rankings lost — investigate before increasing spend
- Branded click share >60%: Strong brand awareness but reliant on brand; non-branded expansion may be needed
- Branded click share <20%: Good generic visibility; brand awareness campaigns may help

---

## Diagnostic Alert Thresholds

| Metric | Watch | Urgent |
|--------|-------|--------|
| CPL change | > 10% | > 20% |
| CVR change | > 10% | > 25% |
| Volume change | > 15% | > 30% |
| QS average | < 6 | < 4 |
| IS lost to budget | > 15% | > 30% |
| Anomaly z-score | > 2.0 | > 3.0 |
| Composition shift | > 10pp | > 15pp |

---

## Client-Specific Considerations

**Currency handling:** Always include currency in reports. Never compare absolute CPL across currencies without conversion. The `currency` field in analysis output indicates the reporting currency.

**Reporting cadence:**
- Weekly: Quick performance check (`campaign check`)
- Monthly: Full analysis report (`campaign brief --month YYYY-MM`)
- Ad-hoc: Metric investigation (`campaign investigate --metric cpl`)

Match output depth to cadence — weekly checks produce WATCH/OPPORTUNITY items, monthly reviews are the right time for URGENT structural recommendations.
