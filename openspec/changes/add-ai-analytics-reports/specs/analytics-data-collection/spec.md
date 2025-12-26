# Spec: Analytics Data Collection

## Overview

Data fetchers for granular Google Ads metrics including search terms, impression share, and quality scores. Stores data in partitioned Parquet files for monthly accumulation.

## ADDED Requirements

### Requirement: Search Term Data Collection
The system SHALL fetch search term reports from Google Ads API including:
- Search query text
- Match type (EXACT, PHRASE, BROAD)
- Campaign and ad group context
- Performance metrics (impressions, clicks, cost, conversions)
- Currency code

#### Scenario: Fetch search terms for a client
Given a configured Google Ads customer ID
When the data fetcher runs for a date range
Then search term records are stored in the appropriate monthly partition
And records include all required fields (search_term, match_type, metrics)

#### Scenario: Handle large search term datasets
Given a campaign with 10,000+ search terms
When the data fetcher runs
Then results are streamed in batches
And memory usage remains bounded

### Requirement: Impression Share Data Collection
The system SHALL fetch campaign-level impression share metrics including:
- Search impression share percentage
- Impression share lost to budget
- Impression share lost to rank
- Absolute top impression share

#### Scenario: Fetch impression share for search campaigns
Given a Google Ads account with search campaigns
When the impression share fetcher runs
Then campaign-level IS metrics are stored
And only search campaigns are included (not display/video)

### Requirement: Quality Score Data Collection
The system SHALL fetch keyword-level quality score data including:
- Overall quality score (1-10)
- Landing page experience component
- Ad relevance component
- Expected CTR component
- Associated performance metrics

#### Scenario: Capture quality score snapshots
Given keywords with quality scores
When the quality score fetcher runs daily
Then point-in-time QS values are stored
And historical trend analysis becomes possible

### Requirement: Partitioned Storage
The system SHALL store collected data in monthly-partitioned Parquet files with:
- Client-specific directories
- Data type separation (search_terms, impression_share, quality_scores)
- Automatic deduplication on append

#### Scenario: Append data without duplicates
Given existing data for January 2025
When the fetcher runs again for January 2025
Then new records are added
And duplicate records (same date + search_term + ad_group) are deduplicated

### Requirement: Campaign Performance Data
The system SHALL continue collecting campaign-level performance metrics for both Google Ads and Meta platforms for trend analysis.

#### Scenario: Collect cross-platform campaign data
Given configured Google Ads and Meta accounts
When the campaign fetcher runs
Then campaign metrics are stored for both platforms
And data is unified in the same schema

## Data Models

```python
@dataclass
class SearchTermRecord:
    client_id: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    ad_group_id: str
    ad_group_name: str
    search_term: str
    match_type: str
    impressions: int
    clicks: int
    cost: float
    conversions: float
    currency: str

@dataclass
class ImpressionShareRecord:
    client_id: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    impression_share: Optional[float]
    search_budget_lost_is: Optional[float]
    search_rank_lost_is: Optional[float]
    absolute_top_is: Optional[float]

@dataclass
class QualityScoreRecord:
    client_id: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    ad_group_id: str
    ad_group_name: str
    keyword_id: str
    keyword_text: str
    match_type: str
    quality_score: Optional[int]
    landing_page_exp: str
    ad_relevance: str
    expected_ctr: str
    impressions: int
    cost: float
```

## API Queries

### Search Terms (GAQL)
```sql
SELECT
    campaign.id, campaign.name,
    ad_group.id, ad_group.name,
    search_term_view.search_term,
    search_term_view.search_term_match_type,
    segments.date,
    metrics.impressions, metrics.clicks,
    metrics.cost_micros, metrics.conversions,
    customer.currency_code
FROM search_term_view
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND metrics.impressions > 0
ORDER BY metrics.cost_micros DESC
```

### Impression Share (GAQL)
```sql
SELECT
    campaign.id, campaign.name,
    segments.date,
    metrics.search_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.search_absolute_top_impression_share
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND campaign.advertising_channel_type = 'SEARCH'
```

### Quality Scores (GAQL)
```sql
SELECT
    campaign.id, campaign.name,
    ad_group.id, ad_group.name,
    ad_group_criterion.criterion_id,
    ad_group_criterion.keyword.text,
    ad_group_criterion.keyword.match_type,
    ad_group_criterion.quality_info.quality_score,
    ad_group_criterion.quality_info.historical_landing_page_quality_score,
    ad_group_criterion.quality_info.historical_creative_quality_score,
    ad_group_criterion.quality_info.historical_search_predicted_ctr,
    segments.date,
    metrics.impressions, metrics.cost_micros
FROM keyword_view
WHERE segments.date BETWEEN '{start}' AND '{end}'
  AND ad_group_criterion.status IN ('ENABLED', 'PAUSED')
```
