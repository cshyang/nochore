# Change: Add AI-Ready Analytics Reports

## Why

Current reporting system generates basic CLI tables focused on human viewing. The goal is to automate report analysis using AI/LLM, requiring:
1. Structured markdown reports optimized for LLM parsing
2. Deeper analytics data (search terms, impression share, quality scores) from Google Ads
3. Actionable insights with clear recommendations

## What Changes

- **NEW**: Data fetchers for granular Google Ads metrics (search terms, impression share, quality scores)
- **NEW**: Analytics engines to generate insights (negative keyword candidates, lost impression analysis, QS trends)
- **NEW**: Markdown report generator optimized for AI consumption
- **REPLACE**: Current CLI-focused report generator with structured markdown output
- **NEW**: Partitioned storage for monthly data accumulation

## Impact

- Affected specs:
  - `analytics-data-collection` (NEW) - Data fetching and storage
  - `analytics-insights` (NEW) - Analysis and recommendations
  - `markdown-reporting` (NEW) - Report generation

- Affected code:
  - `src/data_models.py` - Add new record types
  - `src/data_fetchers.py` - Replace with `src/fetchers/` directory
  - `src/report_generator.py` - Replace with `src/report.py`
  - `src/data_processor.py` - Replace with `src/analyzers/` directory
  - `src/main.py` - Update pipeline orchestration
  - `src/storage.py` - NEW partitioned Parquet storage

## Priority Features

| Priority | Feature | Platform | Granularity |
|----------|---------|----------|-------------|
| P1 | Search Terms Analysis | Google Ads | Search term level |
| P2 | Impression Share | Google Ads | Campaign level |
| P3 | Quality Score Trends | Google Ads | Keyword level |
| P4 | Statistical Trends | Both | Campaign level |
