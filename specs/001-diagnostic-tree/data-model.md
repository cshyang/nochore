# Data Model: Diagnostic Tree System

**Date**: 2025-12-27
**Feature**: 001-diagnostic-tree

---

## Overview

This document defines the data entities for the diagnostic tree system. These extend the existing data models in `src/data_models.py`.

---

## New Record Types (Storage)

### DimensionBreakdownRecord

Stores metric breakdowns by dimension (device, geo, hour).

```python
@dataclass
class DimensionBreakdownRecord:
    """Metric breakdown by a single dimension."""
    client_id: str
    source_account_id: str
    platform: Platform  # META, GOOGLE_ADS
    date: date
    campaign_id: str
    campaign_name: str

    # Dimension
    dimension_type: str  # "device", "geo", "hour"
    dimension_value: str  # "MOBILE", "US-CA", "14"

    # Metrics
    spend: float
    impressions: int
    clicks: int
    conversions_primary: float
    conversions_secondary: float
    currency: str
```

**Storage Path**: `data/{client_id}/dimension_breakdown/{YYYY-MM}.parquet`

**Deduplication Key**: `(client_id, source_account_id, date, campaign_id, dimension_type, dimension_value)`

---

## Analysis Output Models

### CompositionBreakdown

Result of dimension composition analysis.

```python
@dataclass
class CompositionBreakdown:
    """Composition of a metric across a dimension."""
    dimension_type: str  # "device", "geo", "hour"
    segments: List[CompositionSegment]
    total_spend: float
    total_conversions: float
    currency: str

@dataclass
class CompositionSegment:
    """Single segment within a dimension breakdown."""
    dimension_value: str  # "MOBILE", "desktop", "US-CA"
    spend: float
    spend_pct: float
    conversions: float
    conversions_pct: float
    cpl: Optional[float]
    efficiency_ratio: float  # conversions_pct / spend_pct
```

---

### CompositionShift

Detected shift in composition between periods.

```python
@dataclass
class CompositionShift:
    """Significant shift in dimension composition."""
    dimension_type: str
    dimension_value: str

    # Previous period
    previous_spend_pct: float
    previous_conv_pct: float
    previous_cpl: Optional[float]

    # Current period
    current_spend_pct: float
    current_conv_pct: float
    current_cpl: Optional[float]

    # Analysis
    shift_magnitude: float  # percentage points change
    direction: str  # "increased", "decreased"
    estimated_impact: float  # estimated CPL impact in currency
    quality_signal: str  # "positive", "negative", "neutral"
```

---

### DiagnosticCheck

Definition of a single diagnostic hypothesis.

```python
@dataclass
class DiagnosticCheck:
    """A hypothesis to investigate when a metric changes."""
    check_id: str
    name: str
    description: str
    evidence_rules: List[EvidenceRule]
    recommendations: List[RecommendationTemplate]

@dataclass
class EvidenceRule:
    """Rule for evaluating evidence."""
    metric: str
    condition: str  # "increased > 10%", "decreased > 5pts"
    weight: float  # 0.0 - 1.0
```

---

### Diagnosis

Result of running a diagnostic check.

```python
@dataclass
class Diagnosis:
    """Confirmed finding from a diagnostic check."""
    check_id: str
    check_name: str

    # Verdict
    confirmed: bool
    confidence: str  # "high", "medium", "low"
    confidence_score: float  # 0.0 - 1.0

    # Evidence
    evidence: List[EvidenceResult]

    # Impact
    estimated_impact: float  # in metric units (e.g., $3.00 CPL)
    impact_direction: str  # "increased", "decreased"

    # Affected items
    affected_campaigns: List[str]
    affected_keywords: List[str]

@dataclass
class EvidenceResult:
    """Result of evaluating a single evidence rule."""
    metric: str
    condition: str
    expected: str  # human-readable condition
    actual_value: float
    passed: bool
    weight: float
```

---

### Recommendation

Actionable recommendation from a diagnosis.

```python
@dataclass
class Recommendation:
    """Actionable suggestion from a diagnosis."""
    action_id: str
    diagnosis_id: str

    # Description
    title: str
    description: str

    # Prioritization
    priority: int  # 1 = highest
    expected_impact: float  # e.g., -$3.00 CPL
    impact_unit: str  # "CPL", "CVR", "leads"
    effort: str  # "low", "medium", "high"
    confidence: str

    # Details
    affected_items: List[str]  # campaign names, keywords, etc.
    action_details: Dict[str, Any]  # specific data for the action
```

---

### Investigation

Complete investigation of a metric change.

```python
@dataclass
class Investigation:
    """Complete root cause investigation for a metric."""
    metric: str
    metric_name: str

    # Change detection
    previous_value: float
    current_value: float
    change_pct: float
    change_absolute: float

    # Investigation status
    triggered: bool  # True if change exceeded threshold
    threshold: float

    # Results
    diagnoses: List[Diagnosis]
    recommendations: List[Recommendation]

    # Attribution
    total_attributed_impact: float
    attribution_accuracy: float  # how much of change is explained

    # Metadata
    timestamp: datetime
    period_current: str
    period_previous: str
```

---

### AnalysisResults

Aggregated results for report generation.

```python
@dataclass
class AnalysisResults:
    """Complete analysis results for a client/period."""
    client_id: str
    period_current: str
    period_previous: str
    currency: str

    # KPI Summary (existing)
    kpi_summary: Dict[str, Any]

    # Composition Analysis (new)
    composition_device: CompositionBreakdown
    composition_geo: CompositionBreakdown
    composition_hour: CompositionBreakdown
    composition_shifts: List[CompositionShift]

    # Investigations (new)
    cpl_investigation: Investigation
    cvr_investigation: Investigation
    volume_investigation: Investigation

    # Existing analyzer outputs
    negative_keywords: List[NegativeKeywordRec]
    top_search_terms: List[TopSearchTerm]
    match_type_breakdown: List[MatchTypeBreakdown]
    lost_impression_share: List[LostISInsight]
    budget_recommendations: List[BudgetRec]
    qs_changes: List[QSChange]
    low_qs_alerts: List[LowQSAlert]
    qs_distribution: Dict[str, int]
    trends: List[TrendResult]
    anomalies: List[Anomaly]
    forecasts: List[Forecast]
```

---

## Configuration Entities

### DiagnosticTreeConfig

Loaded from `config/diagnostic_tree.yaml`.

```python
@dataclass
class DiagnosticTreeConfig:
    """Configuration for the diagnostic tree."""
    version: str
    metrics: Dict[str, MetricConfig]
    checks: Dict[str, CheckConfig]
    thresholds: ThresholdConfig

@dataclass
class MetricConfig:
    """Configuration for a monitored metric."""
    name: str
    formula: str
    change_threshold: float
    diagnostic_checks: List[str]

@dataclass
class CheckConfig:
    """Configuration for a diagnostic check."""
    name: str
    description: str
    evidence: List[Dict[str, Any]]
    recommendations: List[Dict[str, Any]]

@dataclass
class ThresholdConfig:
    """Global threshold configuration."""
    min_data_points: int
    significance_level: float
    anomaly_z_score: float
```

---

## Entity Relationships

```
┌─────────────────────────────────────────────────────────────────┐
│                         AnalysisResults                          │
├─────────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│ │ CompositionBreak│  │ Investigation   │  │ Existing        │  │
│ │ down (device,   │  │ (CPL, CVR,      │  │ Analyzer        │  │
│ │ geo, hour)      │  │ volume)         │  │ Outputs         │  │
│ └────────┬────────┘  └────────┬────────┘  └─────────────────┘  │
│          │                    │                                  │
│          ▼                    ▼                                  │
│ ┌─────────────────┐  ┌─────────────────┐                        │
│ │ CompositionShift│  │ Diagnosis       │                        │
│ └─────────────────┘  └────────┬────────┘                        │
│                               │                                  │
│                               ▼                                  │
│                      ┌─────────────────┐                        │
│                      │ Recommendation  │                        │
│                      └─────────────────┘                        │
└─────────────────────────────────────────────────────────────────┘

Storage Layer:
┌─────────────────────────────────────────────────────────────────┐
│ data/{client_id}/                                                │
│ ├── campaigns/          # PerformanceRecord (existing)           │
│ ├── search_terms/       # SearchTermRecord (existing)            │
│ ├── impression_share/   # ImpressionShareRecord (existing)       │
│ ├── quality_scores/     # QualityScoreRecord (existing)          │
│ └── dimension_breakdown/# DimensionBreakdownRecord (NEW)         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Validation Rules

### DimensionBreakdownRecord
- `dimension_type` must be one of: `device`, `geo`, `hour`
- `spend` must be >= 0
- `currency` must be a valid 3-letter currency code
- `dimension_value` format depends on type:
  - device: `MOBILE`, `DESKTOP`, `TABLET`, `OTHER`
  - geo: ISO country code or `{country}-{region}` format
  - hour: `0` through `23`

### CompositionShift
- `shift_magnitude` >= 15.0 to be flagged as significant
- `direction` must be `increased` or `decreased`

### Diagnosis
- `confidence_score` must be between 0.0 and 1.0
- `confidence` derived from score: `high` (>=0.85), `medium` (>=0.50), `low` (<0.50)

### Recommendation
- `priority` must be >= 1
- `effort` must be one of: `low`, `medium`, `high`
