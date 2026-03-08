# Tasks: Add AI-Ready Analytics Reports

## Implementation Checklist

### Phase 1: Data Models & Storage
- [x] Rewrite `src/data_models.py` with new record types
  - [x] SearchTermRecord
  - [x] ImpressionShareRecord
  - [x] QualityScoreRecord
  - [x] Keep existing PerformanceRecord for campaign metrics
- [x] Split mixed data models into `src/models/`
  - [x] Core storage records
  - [x] Diagnostic-tree models
  - [x] Client summary/reporting view models
- [x] Create `src/storage.py` with partitioned Parquet storage
  - [x] append() - Add records with deduplication
  - [x] read() - Query by date range
  - [x] Automatic monthly partitioning
- [x] Add Google conversion action storage support
- [x] Write unit/integration tests for summary building and dual report generation

### Phase 2: Data Fetchers
- [x] Create `src/fetchers/` directory structure
- [x] Implement `src/fetchers/google_ads.py`
  - [x] Search terms query (P1)
  - [x] Impression share query (P2)
  - [x] Quality scores query (P3)
  - [x] Campaign performance query
  - [x] Conversion action query for lead normalization
- [x] Refactor `src/fetchers/meta_ads.py`
  - [x] Campaign-level metrics
  - [x] Simplify (no search terms/QS equivalent)
  - [x] Make included lead action types configurable
- [ ] Test with real API credentials (REQUIRES USER)

### Phase 3: Analyzers
- [x] Create `src/analyzers/` directory structure
- [x] Implement `src/analyzers/search_terms.py`
  - [x] Negative keyword candidates
  - [x] Top performers
  - [x] Match type distribution
- [x] Implement `src/analyzers/impression_share.py`
  - [x] Lost opportunities analysis
  - [x] Budget vs rank breakdown
  - [x] Budget recommendations
- [x] Implement `src/analyzers/quality_score.py`
  - [x] QS change detection
  - [x] Low QS alerts
  - [x] Distribution analysis
- [x] Implement `src/analyzers/trends.py`
  - [x] Trend calculation
  - [x] Anomaly detection
  - [x] Forecasting

### Phase 4: Markdown Report Generator
- [x] Create `src/report.py` (replaces report_generator.py)
  - [x] Executive summary section
  - [x] Search terms analysis section
  - [x] Impression share section
  - [x] Quality score section
  - [x] Trends section
  - [x] Recommendations summary
- [x] Ensure markdown is structured for LLM parsing
- [x] Add `src/reporting/` package for shared reporting logic
- [x] Add deterministic client summary renderer
- [x] Add brand-aware client summary sections for multi-brand clients
- [x] Remove unused `src/report_templates/` path

### Phase 5: Pipeline Integration
- [x] Create `src/main.py` with new orchestration
  - [x] Fetch → Store → Analyze → Report flow
  - [x] Per-client processing
  - [x] Monthly data accumulation
- [x] Normalize Google leads using conversion action rules
- [x] Generate both the internal report and `_summary.md` from the same run
- [x] Thread client reporting config through the pipeline
- [x] Delete deprecated files
  - [x] `src/report_generator.py`
  - [x] `src/data_processor.py`
  - [x] `src/data_fetchers.py` (replaced by fetchers/)

### Phase 6: Testing & Validation
- [x] Test end-to-end with homescape client (REQUIRES USER with API credentials)
- [x] Validate markdown output is LLM-parseable (REQUIRES USER testing)
- [x] Verify data accumulation works across months (REQUIRES USER testing)
- [x] Check API quota usage is within limits (REQUIRES USER monitoring)

## Implementation Summary

### Completed
- ✅ All data models created with new record types
- ✅ Partitioned Parquet storage manager
- ✅ Google Ads fetcher with conversion action normalization input
- ✅ Meta Ads fetcher with configurable lead action types
- ✅ All 4 analyzers (search terms, IS, QS, trends)
- ✅ Internal diagnostic report + client summary report
- ✅ New pipeline orchestration (main.py + pipeline.py)
- ✅ Reporting/config/model package cleanup
- ✅ Unit + integration coverage for summary generation

### Requires User Action
- Test with real Google Ads API credentials
- Validate report output meets expectations
- Monitor API quota usage in production

## Dependencies

- google-ads-python (existing)
- facebook-business (existing)
- polars (existing)
- numpy (existing - used for trend analysis)
- No new dependencies required

## Risks

1. **API Quota** - Search terms can return large datasets; implemented streaming pagination
2. **Data Volume** - Monthly accumulation will grow; partitioned by month for management
3. **QS Historical Data** - Quality scores are point-in-time; daily fetches recommended for trends
