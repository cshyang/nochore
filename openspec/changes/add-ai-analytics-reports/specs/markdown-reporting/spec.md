# Spec: Markdown Reporting

## Overview

Report generator that outputs structured markdown optimized for LLM/AI parsing. Replaces the current Rich CLI report generator with semantic, machine-readable markdown.

## ADDED Requirements

### Requirement: Structured Markdown Output
The system SHALL generate markdown reports with:
- Consistent heading hierarchy (H1-H3)
- Semantic section organization
- Machine-parseable tables
- Clear metadata (period, timestamp)

#### Scenario: Generate monthly report
Given collected data and analyzer results for a client
When the report generator runs
Then a markdown file is created in monthly_summaries/
And filename follows pattern {client}_{YYYY-MM}.md

### Requirement: Brand-Segmented Client Summary
The system SHALL support multi-brand client summaries using deterministic brand routing rules when a client operates multiple brands under one reporting client.

#### Scenario: Render one client report with multiple brand sections
Given a client configuration with multiple `brand_rules`
And campaign rows from multiple source accounts
When the client summary is generated
Then the report includes one combined spending overview for the full client
And the report renders separate brand sections after the overview
And each brand section contains only the platform breakdowns for that brand

#### Scenario: Route one Google account to a single brand
Given a client where all Google Ads campaigns belong to one brand
When the summary builder applies `brand_rules`
Then every Google Ads row is assigned to that configured brand
And the final report places Google Ads breakdowns only under that brand section

### Requirement: Executive Summary
The report SHALL include an executive summary with:
- Key metrics comparison (this month vs last month)
- Top 3 key findings
- Overall performance snapshot

#### Scenario: Format executive summary
Given KPI metrics for current and previous period
When executive summary is generated
Then metrics are displayed in a comparison table
And percentage changes include direction indicators
And top findings are bullet-pointed

### Requirement: Search Terms Section
The report SHALL include search terms analysis with:
- Negative keyword recommendations (prioritized)
- Top performing search terms
- Match type distribution

#### Scenario: Present negative keyword recommendations
Given negative keyword analysis results
When the search terms section is generated
Then high priority items appear first
And each row includes: term, campaign, spend, conversions, reason, action
And actions are specific ("Add as EXACT negative to {campaign}")

### Requirement: Impression Share Section
The report SHALL include impression share analysis with:
- Lost opportunities by campaign
- Budget vs rank breakdown
- Budget increase recommendations

#### Scenario: Show impression share opportunities
Given impression share analysis
When the IS section is generated
Then campaigns are sorted by opportunity size
And budget/rank split is clearly shown
And recommendations are actionable

### Requirement: Quality Score Section
The report SHALL include quality score analysis with:
- QS changes (improved/declined)
- Low QS alerts with spend
- Distribution across QS buckets

#### Scenario: Alert on quality score issues
Given QS analysis with low-QS keywords
When QS section is generated
Then low QS alerts include all components
And fix recommendations are specific to the issue
And distribution shows % of keywords in each bucket

### Requirement: Trends Section
The report SHALL include trend analysis with:
- Performance trend table
- Detected anomalies
- 7-day forecast

#### Scenario: Present trend with significance
Given trend analysis results
When trends section is generated
Then direction is shown (ascending/descending/flat)
And significance is indicated
And rate of change is quantified

### Requirement: Recommendations Summary
The report SHALL conclude with:
- Immediate actions (prioritized)
- Estimated impact of each action
- Strategic opportunities

#### Scenario: Summarize recommendations
Given all analysis results
When recommendations summary is generated
Then immediate actions are prioritized by impact
And estimated savings/gains are included
And strategic items are separated from tactical

### Requirement: LLM Optimization
The report SHALL be formatted for LLM consumption:
- Clear table headers with units
- Consistent date formats (YYYY-MM-DD)
- Explicit action verbs in recommendations
- Quantified impacts where possible

#### Scenario: Format for machine parsing
Given a complete report
When the markdown is generated
Then tables have clear column headers
And dates use YYYY-MM-DD format
And recommendations use action verbs ("Add", "Increase", "Review")

## Report Template

```markdown
# {client_id} - Monthly Ads Performance Report
**Period:** {month} {year}
**Generated:** {timestamp}

---

## Executive Summary

| Metric | Current Period | Previous Period | Change |
|--------|----------------|-----------------|--------|
| Total Spend | ${spend} | ${prev} | {pct}% |
| Conversions | {conv} | {prev} | {pct}% |
| Avg CPC | ${cpc} | ${prev} | {pct}% |
| ROAS | {roas}x | {prev}x | {pct}% |

**Key Findings:**
1. {finding_1}
2. {finding_2}
3. {finding_3}

---

## 1. Search Terms Analysis

### Recommended Negative Keywords

**High Priority** (Immediate action - wasting budget)
| Search Term | Campaign | Spend | Conv | Reason | Action |
|-------------|----------|-------|------|--------|--------|

**Medium Priority** (Monitor or add)
| Search Term | Campaign | Spend | CTR | Reason |
|-------------|----------|-------|-----|--------|

### Top Performing Search Terms
| Search Term | Conv | ROAS | Recommendation |
|-------------|------|------|----------------|

### Match Type Distribution
| Match Type | Spend % | Conversion % | Efficiency |
|------------|---------|--------------|------------|

---

## 2. Impression Share Analysis

### Lost Opportunities
| Campaign | Current IS | Lost to Budget | Lost to Rank | Action |
|----------|------------|----------------|--------------|--------|

### Budget Recommendations
| Campaign | Current Daily | Recommended | Expected IS Gain |
|----------|---------------|-------------|------------------|

---

## 3. Quality Score Trends

### QS Changes This Month
**Improved**
| Keyword | Campaign | Previous | Current | Component |
|---------|----------|----------|---------|-----------|

**Declined**
| Keyword | Campaign | Previous | Current | Spend | Issue |
|---------|----------|----------|---------|-------|-------|

### Low QS Alerts
| Keyword | QS | Spend | LP | Ad Rel | CTR | Fix |
|---------|----|----|-----|----|----|-----|

### Distribution
| QS Range | Keywords | Percentage |
|----------|----------|------------|
| 8-10 | {count} | {pct}% |
| 5-7 | {count} | {pct}% |
| 1-4 | {count} | {pct}% |

---

## 4. Trends & Forecasting

### Performance Trends
| Metric | Trend | Rate | Significance |
|--------|-------|------|--------------|

### Anomalies Detected
| Date | Campaign | Metric | Expected | Actual | Severity |
|------|----------|--------|----------|--------|----------|

### 7-Day Forecast
| Metric | Projected | Confidence Interval |
|--------|-----------|---------------------|

---

## 5. Recommendations Summary

### Immediate Actions
1. **{action}** - Est. impact: {impact}
2. **{action}** - Est. impact: {impact}
3. **{action}** - Est. impact: {impact}

### Strategic Opportunities
1. {opportunity}
2. {opportunity}

---

**Data Sources:** Google Ads API, Meta Ads API
**Report Version:** 2.0
```

## File Locations

- Output: `monthly_summaries/{client}_{YYYY-MM}.md`
- Example: `monthly_summaries/homescape_2025-01.md`
