# Research: Diagnostic Tree System

**Date**: 2025-12-27
**Feature**: 001-diagnostic-tree

---

## 1. Dimension Data Availability

### Google Ads API

**Decision**: Use `segments.device` and `geographic_view` for device/geo breakdowns; use `segments.hour` for time-of-day analysis.

**Rationale**: Google Ads API provides rich segmentation capabilities. The current fetchers only fetch campaign-level data without dimensional breakdowns. Adding segments is straightforward—just include them in the GAQL query.

**Available Dimensions**:

| Dimension | API Field | Notes |
|-----------|-----------|-------|
| Device | `segments.device` | MOBILE, DESKTOP, TABLET, OTHER |
| Geo (Country) | `geographic_view.country_criterion_id` | Requires geographic_view resource |
| Geo (Region) | `geographic_view.region` | State/province level |
| Geo (City) | `segments.geo_target_city` | City-level targeting |
| Hour of Day | `segments.hour` | 0-23 hour segments |
| Day of Week | `segments.day_of_week` | MONDAY-SUNDAY |

**New Queries Required**:

```sql
-- Device breakdown
SELECT
    campaign.id, campaign.name,
    segments.device,
    segments.date,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'

-- Geographic breakdown
SELECT
    campaign.id, campaign.name,
    geographic_view.country_criterion_id,
    geographic_view.location_type,
    segments.date,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM geographic_view
WHERE segments.date BETWEEN '{start}' AND '{end}'

-- Hourly breakdown
SELECT
    campaign.id, campaign.name,
    segments.hour,
    segments.date,
    metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
FROM campaign
WHERE segments.date BETWEEN '{start}' AND '{end}'
```

**Alternatives Considered**:
- Fetching all dimensions in one query: Rejected due to API response size limits
- Using Google Ads reporting UI exports: Rejected for automation requirements

---

### Meta Ads API

**Decision**: Use `breakdowns` parameter with values `device_platform`, `publisher_platform`, and `platform_position`.

**Rationale**: Meta Ads API supports breakdown parameters in the Insights endpoint. Geographic data requires `country` breakdown.

**Available Dimensions**:

| Dimension | Breakdown Parameter | Values |
|-----------|---------------------|--------|
| Device | `device_platform` | mobile, desktop, tablet |
| Platform | `publisher_platform` | facebook, instagram, audience_network, messenger |
| Placement | `platform_position` | feed, story, reels, right_column, etc. |
| Country | `country` | ISO country codes |
| Region | `region` | State/region names |
| Age | `age` | Age brackets |
| Gender | `gender` | male, female, unknown |

**Note**: Meta does not provide hour-of-day breakdowns via API. Time-based analysis limited to daily granularity.

**Alternatives Considered**:
- Requesting hourly data via custom reports: Not supported by Meta API
- Using ad scheduling reports: Only shows scheduled times, not actual performance

---

## 2. Impact Estimation Approaches

### Decision: Weighted Attribution with Composition Shift Analysis

**Rationale**: When CPL changes, multiple factors contribute. We use a multi-step attribution:

1. **Composition Shift Impact**: Calculate how much of the CPL change is due to mix shifts (e.g., more mobile traffic at higher CPL)
2. **Efficiency Change Impact**: Calculate how much is due to per-segment efficiency changes (e.g., mobile CPL itself increased)
3. **Volume Change Impact**: Calculate how much is due to volume changes affecting cost base

### Attribution Formula

```
Total CPL Change = Σ(Segment CPL Change × Segment Weight) + Mix Shift Effect

Where:
- Segment CPL Change = (CPL_current - CPL_previous) for each segment
- Segment Weight = Spend_segment / Spend_total
- Mix Shift Effect = Σ((Weight_current - Weight_previous) × CPL_segment)
```

### Confidence Scoring

| Evidence Strength | Confidence Level | Criteria |
|-------------------|------------------|----------|
| High | 85-100% | Multiple data points, >20% change, consistent pattern |
| Medium | 50-84% | Single data point, 10-20% change, some noise |
| Low | <50% | Sparse data, <10% change, conflicting signals |

**Alternatives Considered**:
- Machine learning attribution models: Rejected for interpretability and data requirements
- Simple proportional attribution: Rejected for lack of accuracy
- Bayesian attribution: Considered for future enhancement

---

## 3. Diagnostic Tree Configuration

### Decision: YAML-based tree definition with check registry

**Rationale**: YAML is human-readable, already used in the project (clients.yaml), and supports complex nested structures. A registry pattern allows adding new checks without modifying the tree.

### Configuration Schema

```yaml
# config/diagnostic_tree.yaml
version: "1.0"

metrics:
  cpl:
    name: "Cost Per Lead"
    formula: "spend / conversions_primary"
    change_threshold: 0.10  # 10% triggers investigation
    diagnostic_checks:
      - competition
      - quality_score
      - search_term_quality
      - composition_shift
      - targeting_changes

  cvr:
    name: "Conversion Rate"
    formula: "conversions_primary / clicks"
    change_threshold: 0.10
    diagnostic_checks:
      - landing_page
      - audience_quality
      - composition_shift

checks:
  competition:
    name: "Competition Changes"
    description: "Detect increased auction competition"
    evidence:
      - metric: impression_share_lost_rank
        condition: "increased > 5pts"
        weight: 0.4
      - metric: avg_cpc
        condition: "increased > 10%"
        weight: 0.3
      - metric: absolute_top_is
        condition: "decreased > 5pts"
        weight: 0.3
    recommendations:
      - action: "review_bids"
        effort: "low"
        template: "Review and adjust bids for campaigns with IS loss"
      - action: "refresh_creative"
        effort: "medium"
        template: "Test new ad copy to improve CTR and Ad Rank"

  quality_score:
    name: "Quality Score Degradation"
    description: "Detect QS drops affecting CPC"
    evidence:
      - metric: avg_quality_score
        condition: "decreased > 0.5"
        weight: 0.5
      - metric: keywords_below_qs5
        condition: "increased > 2"
        weight: 0.3
      - metric: landing_page_exp_below_avg
        condition: "increased"
        weight: 0.2
    recommendations:
      - action: "qs_audit"
        effort: "medium"
        template: "Audit and improve keywords: {affected_keywords}"
      - action: "landing_page_review"
        effort: "high"
        template: "Review landing page relevance for {campaigns}"

  composition_shift:
    name: "Traffic Composition Shift"
    description: "Detect changes in traffic mix affecting quality"
    dimensions:
      - device
      - geo
      - hour
    threshold: 0.15  # 15 percentage point shift
    recommendations:
      - action: "adjust_bid_modifiers"
        effort: "low"
        template: "Adjust {dimension} bid modifiers: {details}"

thresholds:
  min_data_points: 7  # Days needed for trend analysis
  significance_level: 0.7  # R² for trend significance
  anomaly_z_score: 2.0  # Z-score for anomaly detection
```

**Alternatives Considered**:
- JSON configuration: Less readable for nested structures
- Python DSL: More flexible but less accessible for non-developers
- Database-stored config: Overkill for current scale

---

## 4. Report Template Patterns

### Decision: Template inheritance with audience-specific formatters

**Rationale**: Both client and internal reports share the same underlying data and analysis. Only the presentation differs. A base template extracts common logic; audience-specific templates override formatting methods.

### Architecture

```python
class BaseReportTemplate(ABC):
    """Base class for all report templates."""

    def generate(self, analysis_results: AnalysisResults) -> str:
        """Template method pattern."""
        return "\n".join([
            self.format_header(analysis_results),
            self.format_summary(analysis_results),
            self.format_body(analysis_results),
            self.format_footer(analysis_results),
        ])

    @abstractmethod
    def format_summary(self, results: AnalysisResults) -> str:
        pass

    @abstractmethod
    def format_body(self, results: AnalysisResults) -> str:
        pass


class ClientTemplate(BaseReportTemplate):
    """Client-facing narrative report."""

    def format_summary(self, results):
        # 3-5 bullet points, plain language
        # No internal jargon
        # Focus on outcomes and next steps
        ...

    def format_body(self, results):
        # High-level metrics
        # Key findings as narrative
        # Recommendations without confidence scores
        ...


class InternalTemplate(BaseReportTemplate):
    """Internal diagnostic report."""

    def format_summary(self, results):
        # Full KPI tables
        # All metrics with changes
        ...

    def format_body(self, results):
        # Complete diagnostic tree output
        # All evidence checks with scores
        # Action queue with priorities
        # Test hypotheses
        ...
```

### Content Differences

| Section | Client Report | Internal Report |
|---------|---------------|-----------------|
| Summary | 3-5 bullet narrative | Full KPI table |
| Diagnosis | "We observed increased competition" | Check: competition, Evidence: IS lost +8pts, Confidence: High |
| Actions | "We're adjusting bids to improve visibility" | Action: adjust_bids, Impact: -$2.50 CPL, Effort: Low, Priority: 1 |
| Metrics | Spend, Leads, CPL | + All diagnostic metrics, composition breakdowns |
| Tone | Professional narrative | Technical diagnostic |

**Alternatives Considered**:
- Single template with conditional sections: Leads to complex branching
- Completely separate implementations: Code duplication
- Report builder pattern: More complex than needed

---

## Summary of Decisions

| Topic | Decision | Key Benefit |
|-------|----------|-------------|
| Google Ads Dimensions | segments.device, geographic_view, segments.hour | Native API support |
| Meta Dimensions | device_platform, publisher_platform, country | Breakdown parameters |
| Impact Attribution | Weighted composition + efficiency analysis | Interpretable results |
| Confidence Scoring | Evidence-based with 3 levels | Clear actionability |
| Tree Config | YAML with check registry | Extensible and readable |
| Report Templates | Template inheritance pattern | Shared logic, varied output |

---

## Open Questions for Implementation

1. **Storage for dimension data**: Store in separate Parquet partitions or extend existing records?
   - Recommendation: Separate partitions (e.g., `data/{client}/device_breakdown/`)

2. **Caching for diagnostic checks**: Cache intermediate results during investigation?
   - Recommendation: Yes, in-memory cache per report generation

3. **Localization**: Support for non-English client reports?
   - Recommendation: Defer to future enhancement; current scope is English only
