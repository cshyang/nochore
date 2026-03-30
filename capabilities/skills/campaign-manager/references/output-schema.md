# CLI Output Schema Reference

> **Data Package Philosophy:** The CLI returns ALL computed data without pre-filtering by thresholds. Search terms include every term above $1 spend (capped at 200 by volume). Quality scores include all keywords. Impression share includes all campaigns. The agent skill's analytical principles determine what is significant — the code does not pre-judge.

JSON structure reference for `campaign check` and `campaign investigate` output. Load when uncertain about output keys or when first using the CLI.

---

## `campaign check --format json` Output

```
{
  "client_id": "string",
  "scope": "client" | "brand",
  "brand": "string | null",
  "context": {                          // Client business context from config
    "business": "string",
    "notes": ["string"],
    "brands": { "<name>": { "market", "ticket_size", "objective", "quality_signals" } }
  },
  "knowledge": "string | null",        // Contents of data/<client_id>/knowledge.md
  "period": "YYYY-MM-DD to YYYY-MM-DD",
  "comparison_period": "YYYY-MM-DD to YYYY-MM-DD",
  "currency": "SGD | MYR | USD",
  "kpi_summary": {
    "impressions_current", "impressions_previous", "impressions_change",
    "clicks_current", "clicks_previous", "clicks_change",
    "leads_primary_current", "leads_primary_previous", "leads_primary_change",
    "ctr_current", "ctr_previous", "ctr_change",
    "cvr_current", "cvr_previous", "cvr_change",
    "currency_breakdown_current": [{ "currency", "spend", "impressions", "clicks", "leads_primary", "cpl" }],
    "platform_currency_breakdown_current": [{ "platform", "currency", "spend", "clicks", "leads_primary", "cpc" }],
    "findings": ["string"]
  },
  "alerts": {
    "negative_keyword_candidates": int,
    "low_quality_score_alerts": int,
    "anomalies_detected": int,
    "impression_share_opportunities": int,
    "budget_recommendations": int
  },
  "web_quality": {                      // Present only if GA4 configured
    "summary": { "total_sessions", "total_engaged_sessions", "total_key_events",
                 "overall_engagement_rate", "overall_key_event_rate" },
    "low_engagement_page_count": int,
    "low_key_event_page_count": int,
    "paid_engagement_gap_count": int,
    "top_landing_pages": [{ "landing_page", "sessions", "engagement_rate",
                            "bounce_rate", "key_events", "key_event_rate",
                            "top_channels", "signal" }]
  },
  "organic_search": {                   // Present only if Search Console configured
    "summary": { "total_clicks", "total_impressions", "overall_ctr",
                 "unique_queries", "unique_pages" },
    "branded_vs_nonbranded": { "branded_clicks", "nonbranded_clicks",
                               "branded_impressions", "nonbranded_impressions",
                               "branded_click_share" },
    "ctr_opportunity_count": int,
    "rising_queries": int,
    "falling_queries": int,
    "top_queries": [{ "query", "clicks", "impressions", "ctr", "position", "is_branded" }]
  }
}
```

## `campaign investigate --metric <metric> --format json` Output

Same base structure as `check`, plus a `related_data` key scoped to the chosen metric:

**`--metric cpl`:**
- `related_data.budget_recommendations` — campaigns where budget increase could reduce CPL
- `related_data.impression_share_opportunities` — campaigns losing IS to budget/rank
- `related_data.paid_engagement_gaps` — GA4 pages where paid engagement < organic (if GA4 configured)
- `related_data.organic_demand` — branded vs non-branded split (if SC configured)

**`--metric cvr`:**
- `related_data.quality_score_alerts` — keywords with low QS
- `related_data.quality_score_changes` — QS direction changes
- `related_data.negative_keyword_candidates` — top 20 waste terms
- `related_data.web_quality` — low engagement pages + paid engagement gaps (if GA4 configured)
- `related_data.organic_demand` — branded vs non-branded split (if SC configured)

**`--metric volume`:**
- `related_data.trends` — lead and click trend direction/significance
- `related_data.anomalies` — statistically significant daily anomalies
- `related_data.forecasts` — projected lead volume with confidence interval
- `related_data.impression_share_opportunities` — campaigns with headroom
- `related_data.organic_search` — demand trends, top queries, CTR opportunities (if SC configured)

## Key Metric Definitions

| Field | Definition |
|-------|-----------|
| `engagement_rate` | engaged_sessions / sessions (GA4 definition) |
| `key_event_rate` | key_events / sessions (configured per-client) |
| `ctr` (organic) | clicks / impressions (Search Console definition) |
| `cpl` | spend / leads_primary |
| `cvr` | leads_primary / clicks * 100 |
| `branded_click_share` | branded_clicks / total_clicks |
