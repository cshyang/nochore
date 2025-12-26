# Tasks: Add AI-Ready Analytics Reports

## Implementation Checklist

### Phase 1: Data Models & Storage
- [x] Rewrite `src/data_models.py` with new record types
  - [x] SearchTermRecord
  - [x] ImpressionShareRecord
  - [x] QualityScoreRecord
  - [x] Keep existing PerformanceRecord for campaign metrics
- [x] Create `src/storage.py` with partitioned Parquet storage
  - [x] append() - Add records with deduplication
  - [x] read() - Query by date range
  - [x] Automatic monthly partitioning
- [ ] Write unit tests for storage operations (DEFERRED)

### Phase 2: Data Fetchers
- [x] Create `src/fetchers/` directory structure
- [x] Implement `src/fetchers/google_ads.py`
  - [x] Search terms query (P1)
  - [x] Impression share query (P2)
  - [x] Quality scores query (P3)
  - [x] Campaign performance query
- [x] Refactor `src/fetchers/meta_ads.py`
  - [x] Campaign-level metrics
  - [x] Simplify (no search terms/QS equivalent)
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

### Phase 5: Pipeline Integration
- [x] Create `src/main.py` with new orchestration
  - [x] Fetch → Store → Analyze → Report flow
  - [x] Per-client processing
  - [x] Monthly data accumulation
- [x] Delete deprecated files
  - [x] `src/report_generator.py`
  - [x] `src/data_processor.py`
  - [x] `src/data_fetchers.py` (replaced by fetchers/)

### Phase 6: Testing & Validation
- [ ] Test end-to-end with homescape client (REQUIRES USER with API credentials)
- [ ] Validate markdown output is LLM-parseable (REQUIRES USER testing)
- [ ] Verify data accumulation works across months (REQUIRES USER testing)
- [ ] Check API quota usage is within limits (REQUIRES USER monitoring)

## Implementation Summary

### Completed
- ✅ All data models created with new record types
- ✅ Partitioned Parquet storage manager
- ✅ Google Ads fetcher with all 4 GAQL queries
- ✅ Meta Ads fetcher (simplified)
- ✅ All 4 analyzers (search terms, IS, QS, trends)
- ✅ Markdown report generator optimized for LLM
- ✅ New pipeline orchestration (main.py)

### Deferred
- Unit tests - Can be added later if needed

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
