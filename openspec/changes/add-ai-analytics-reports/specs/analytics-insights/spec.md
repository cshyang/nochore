# Spec: Analytics Insights

## Overview

Analysis engines that process collected data to generate actionable insights including negative keyword candidates, impression share optimization, quality score trends, and statistical anomalies.

## ADDED Requirements

### Requirement: Negative Keyword Identification
The system SHALL identify search terms suitable for negative keywords based on:
- High spend (>$50) with zero conversions
- Low CTR (<0.5%) with significant impressions
- Pattern matching for irrelevant queries

#### Scenario: Identify high-spend zero-conversion terms
Given search term data for a campaign
When the search terms analyzer runs
Then terms with spend > $50 and 0 conversions are flagged as high priority
And each candidate includes the reason and recommended action

#### Scenario: Identify low-CTR terms
Given search term data with CTR metrics
When the search terms analyzer runs
Then terms with CTR < 0.5% and significant impressions are flagged as medium priority

### Requirement: Top Performer Identification
The system SHALL identify high-performing search terms based on:
- Conversion rate
- ROAS
- Cost efficiency

#### Scenario: Identify top converting search terms
Given search term data with conversions
When top performers analysis runs
Then terms are ranked by conversion rate and ROAS
And recommendations to add as keywords are included

### Requirement: Match Type Analysis
The system SHALL analyze spend and conversion distribution across match types (Exact, Phrase, Broad).

#### Scenario: Analyze match type distribution
Given search term data across match types
When match type analysis runs
Then spend percentage per match type is calculated
And conversion percentage per match type is calculated
And efficiency ratio is derived

### Requirement: Impression Share Analysis
The system SHALL identify campaigns with:
- Low impression share (<50%)
- Breakdown of losses (budget vs rank)
- Prioritized opportunities by potential impact

#### Scenario: Analyze impression share losses
Given impression share data showing 60% IS
When the impression share analyzer runs
Then it calculates 40% lost opportunity
And breaks down losses into budget-lost vs rank-lost
And recommends action based on which is higher

### Requirement: Budget Recommendations
The system SHALL estimate budget increases needed to capture lost impression share.

#### Scenario: Recommend budget increase
Given a campaign losing 20% IS to budget
When budget recommendation runs
Then it estimates the daily budget increase needed
And projects the expected IS gain

### Requirement: Quality Score Change Detection
The system SHALL track keywords where quality score improved or declined over time.

#### Scenario: Detect quality score decline
Given keyword QS history over 30 days
When QS analyzer compares current to previous period
Then keywords with QS drops are identified
And the underperforming component is highlighted

### Requirement: Low Quality Score Alerts
The system SHALL alert on keywords with:
- Quality score <= 5
- Significant spend (>$100/month)
- Identify which component is underperforming

#### Scenario: Alert on high-spend low-QS keywords
Given keywords with QS <= 5
When the low QS alert runs
Then keywords with significant spend are prioritized
And specific improvement recommendations are provided

### Requirement: Quality Score Distribution
The system SHALL report the distribution of keywords across QS buckets (1-4, 5-7, 8-10).

#### Scenario: Report QS distribution
Given keyword quality scores
When distribution analysis runs
Then count and percentage per bucket is calculated

### Requirement: Trend Analysis
The system SHALL calculate linear regression trends for key metrics with statistical significance.

#### Scenario: Calculate metric trends
Given 30 days of performance data
When trend analysis runs
Then linear regression is calculated
And direction and rate are reported
And statistical significance is indicated

### Requirement: Anomaly Detection
The system SHALL detect anomalies using z-score analysis (threshold > 2.0).

#### Scenario: Detect spending anomaly
Given 30 days of spend data
When anomaly detection runs
Then days with z-score > 2.0 are flagged
And severity is classified (high if z > 3.0)

### Requirement: Forecasting
The system SHALL provide 7-day forecasts using exponential smoothing.

#### Scenario: Forecast next week performance
Given historical performance data
When forecasting runs
Then 7-day projections are generated
And confidence intervals are provided

## Output Models

```python
@dataclass
class NegativeKeywordRec:
    search_term: str
    campaign: str
    ad_group: str
    spend: float
    clicks: int
    conversions: int
    reason: str  # "high_spend_no_conv", "low_ctr", "irrelevant"
    recommended_action: str

@dataclass
class TopSearchTerm:
    search_term: str
    campaign: str
    conversions: float
    roas: float
    recommendation: str

@dataclass
class MatchTypeBreakdown:
    match_type: str
    spend_pct: float
    conversion_pct: float
    efficiency_ratio: float

@dataclass
class LostISInsight:
    campaign: str
    current_is: float
    lost_to_budget: float
    lost_to_rank: float
    action: str

@dataclass
class BudgetRec:
    campaign: str
    current_daily: float
    recommended_daily: float
    expected_is_gain: float

@dataclass
class QSChange:
    keyword: str
    campaign: str
    previous_qs: int
    current_qs: int
    change_direction: str
    component_issue: Optional[str]

@dataclass
class LowQSAlert:
    keyword: str
    campaign: str
    quality_score: int
    spend: float
    landing_page: str
    ad_relevance: str
    expected_ctr: str
    fix_recommendation: str

@dataclass
class TrendResult:
    metric: str
    direction: str  # "up", "down", "flat"
    rate_per_day: float
    significance: str  # "significant", "not_significant"

@dataclass
class Anomaly:
    date: date
    campaign: str
    metric: str
    expected: float
    actual: float
    z_score: float
    severity: str

@dataclass
class Forecast:
    metric: str
    days: int
    projected_value: float
    confidence_interval: Tuple[float, float]
```

## Analyzer Thresholds

| Analyzer | Metric | Default | Configurable |
|----------|--------|---------|--------------|
| Negative KW | Spend threshold | $50 | Yes |
| Negative KW | CTR threshold | 0.5% | Yes |
| Impression Share | Low IS threshold | 50% | Yes |
| Quality Score | Low QS threshold | 5 | Yes |
| Quality Score | Spend threshold | $100 | Yes |
| Anomaly | Z-score threshold | 2.0 | Yes |
| Anomaly | High severity | 3.0 | Yes |
