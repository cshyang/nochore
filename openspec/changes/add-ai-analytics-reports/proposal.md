# Change: Add AI-Ready Analytics Reports

## Why

Current reporting system generates basic CLI tables focused on human viewing. The goal is to automate report analysis using AI/LLM, requiring:
1. Structured markdown reports optimized for LLM parsing
2. Deeper analytics data (search terms, impression share, quality scores) from Google Ads
3. Actionable insights with clear recommendations

## What Changes

- **NEW**: Data fetchers for granular Google Ads metrics (search terms, impression share, quality scores)
- **NEW**: Google conversion-action fetcher output for deterministic lead normalization
- **NEW**: Analytics engines to generate insights (negative keyword candidates, lost impression analysis, QS trends)
- **NEW**: Dual markdown outputs: internal diagnostic report + compact client summary
- **NEW**: Brand-aware client summary sections for multi-brand clients under a single client account
- **REPLACE**: Current CLI-focused report generator with structured markdown output
- **REFACTOR**: Reporting/config/model code reorganized into dedicated packages to remove duplicated report paths
- **NEW**: Partitioned storage for monthly data accumulation

## Impact

- Affected specs:
  - `analytics-data-collection` (NEW) - Data fetching and storage
  - `analytics-insights` (NEW) - Analysis and recommendations
  - `markdown-reporting` (NEW) - Report generation

- Affected code:
  - `src/models/` - Split core, diagnostic, and reporting data models
  - `src/config/` - Split client/reporting config from diagnostic-tree config
  - `src/reporting/` - Consolidated reporting calculations, builders, and generators
  - `src/fetchers/` - Added conversion-action ingestion for Google Ads
  - `src/main.py` and `src/pipeline.py` - Update dual-report orchestration
  - `src/storage.py` - Extended storage for conversion action records
  - `clients.yaml` - Added client-facing brand routing rules for multi-brand reporting

## Priority Features

| Priority | Feature | Platform | Granularity |
|----------|---------|----------|-------------|
| P1 | Search Terms Analysis | Google Ads | Search term level |
| P2 | Impression Share | Google Ads | Campaign level |
| P3 | Quality Score Trends | Google Ads | Keyword level |
| P4 | Statistical Trends | Both | Campaign level |
