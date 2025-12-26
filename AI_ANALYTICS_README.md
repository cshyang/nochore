# AI-Ready Analytics Reports

This implementation adds deep Google Ads analytics with LLM-optimized markdown reports.

## New Features

### Data Collection (P1-P3)
- **Search Terms Analysis** - Identify negative keyword candidates
- **Impression Share** - Find campaigns losing IS to budget vs rank
- **Quality Score Trends** - Track keyword QS changes over time
- **Statistical Trends** - Anomaly detection and forecasting

### Storage
- Monthly-partitioned Parquet files per data type
- Automatic deduplication on append
- Client-specific data directories

### Analysis
- **Negative Keyword Identification** - High spend, zero conversion terms
- **Impression Share Optimization** - Budget increase recommendations
- **Quality Score Alerts** - Low QS keywords with significant spend
- **Trend Analysis** - Linear regression with significance testing

### Reporting
- Structured markdown optimized for LLM parsing
- Actionable recommendations with estimated impact
- Priority-sorted insights

## Usage

### Pipeline (main.py)

```bash
# Run analytics for a client
uv run ads-report --client homescape --days 30

# Process with custom config
uv run ads-report --client homescape --config clients.yaml
```

### Output

Reports are generated in `monthly_summaries/{client}_{period}.md`

Example structure:
```markdown
# homescape - Monthly Ads Performance Report

## Executive Summary
| Metric | This Month | Last Month | Change |
...

## 1. Search Terms Analysis
### Recommended Negative Keywords
**High Priority** (Immediate action)
| Search Term | Campaign | Spend | Conv | Action |
...

## 2. Impression Share Analysis
...

## 3. Quality Score Trends
...

## 4. Trends & Forecasting
...

## 5. Recommendations Summary
### Immediate Actions
1. **Add 15 negative keywords** - Est. savings $1,234/month
...
```

## File Structure

```
src/
├── data_models.py           # Extended with new record types
├── storage.py               # NEW - Partitioned Parquet storage
├── fetchers/
│   ├── google_ads.py        # NEW - Search terms, IS, QS queries
│   └── meta_ads.py          # NEW - Simplified campaign metrics
├── analyzers/
│   ├── search_terms.py      # NEW - Negative KW identification
│   ├── impression_share.py  # NEW - IS optimization
│   ├── quality_score.py     # NEW - QS trend analysis
│   └── trends.py            # NEW - Statistical analysis
├── report.py                # NEW - Markdown generator
└── main.py                  # Pipeline orchestration

data/{client_id}/
├── search_terms/2025-01.parquet
├── impression_share/2025-01.parquet
├── quality_scores/2025-01.parquet
└── campaigns/2025-01.parquet
```

## API Queries

### Search Terms (GAQL)
```sql
SELECT campaign.id, campaign.name, ad_group.id, ad_group.name,
       search_term_view.search_term, search_term_view.search_term_match_type,
       metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE segments.date BETWEEN '2025-01-01' AND '2025-01-31'
  AND metrics.impressions > 0
```

### Impression Share (GAQL)
```sql
SELECT campaign.id, campaign.name,
       metrics.search_impression_share,
       metrics.search_budget_lost_impression_share,
       metrics.search_rank_lost_impression_share
FROM campaign
WHERE campaign.advertising_channel_type = 'SEARCH'
```

### Quality Scores (GAQL)
```sql
SELECT campaign.id, ad_group.id, ad_group_criterion.criterion_id,
       ad_group_criterion.keyword.text,
       ad_group_criterion.quality_info.quality_score,
       ad_group_criterion.quality_info.historical_landing_page_quality_score,
       ad_group_criterion.quality_info.historical_creative_quality_score
FROM keyword_view
WHERE ad_group_criterion.status IN ('ENABLED', 'PAUSED')
```

## Configuration

Same `clients.yaml` format:
```yaml
clients:
  homescape:
    google_ads:
      customer_ids:
        - "107-310-0792"
    meta:
      ad_accounts:
        - id: "act_123456"
```

## Next Steps

1. Run with real API credentials
2. Review generated markdown reports
3. Test LLM parsing of reports
4. Monitor API quota usage
5. Adjust analyzer thresholds if needed

## Notes

- `ads-report` is the single canonical CLI entrypoint.
