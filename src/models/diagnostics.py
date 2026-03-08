"""Analyzer outputs and diagnostic-tree models."""

from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class NegativeKeywordRec:
    """Negative keyword recommendation."""

    search_term: str
    campaign: str
    ad_group: str
    currency: str
    spend: float
    clicks: int
    leads: float
    reason: str
    note: str


@dataclass
class TopSearchTerm:
    """Top performing search term."""

    search_term: str
    campaign: str
    currency: str
    spend: float
    clicks: int
    leads: float
    cpl: Optional[float]
    cvr: Optional[float]
    note: str


@dataclass
class MatchTypeBreakdown:
    """Match type distribution."""

    match_type: str
    spend_pct: float
    conversion_pct: float
    efficiency_ratio: float


@dataclass
class LostISInsight:
    """Lost impression share insight."""

    campaign: str
    current_is: float
    lost_to_budget: float
    lost_to_rank: float
    action: str


@dataclass
class BudgetRec:
    """Budget recommendation."""

    campaign: str
    current_daily: float
    recommended_daily: float
    expected_is_gain: float


@dataclass
class QSChange:
    """Quality score change."""

    keyword: str
    campaign: str
    previous_qs: int
    current_qs: int
    change_direction: str
    component_issue: Optional[str]


@dataclass
class LowQSAlert:
    """Low quality score alert."""

    keyword: str
    campaign: str
    currency: str
    quality_score: int
    spend: float
    landing_page: str
    ad_relevance: str
    expected_ctr: str


@dataclass
class TrendResult:
    """Trend analysis result."""

    metric: str
    direction: str
    rate_per_day: float
    significance: str


@dataclass
class Anomaly:
    """Anomaly detection result."""

    date: date
    campaign: str
    metric: str
    expected: float
    actual: float
    z_score: float
    severity: str


@dataclass
class Forecast:
    """Forecast result."""

    metric: str
    days: int
    projected_value: float
    confidence_interval: Tuple[float, float]


@dataclass
class CompositionSegment:
    """Single segment within a dimension breakdown."""

    dimension_value: str
    spend: float
    spend_pct: float
    conversions: float
    conversions_pct: float
    cpl: Optional[float]
    efficiency_ratio: float


@dataclass
class CompositionBreakdown:
    """Composition of a metric across a dimension."""

    dimension_type: str
    segments: List[CompositionSegment]
    total_spend: float
    total_conversions: float
    currency: str


@dataclass
class CompositionShift:
    """Significant shift in dimension composition."""

    dimension_type: str
    dimension_value: str
    previous_spend_pct: float
    previous_conv_pct: float
    previous_cpl: Optional[float]
    current_spend_pct: float
    current_conv_pct: float
    current_cpl: Optional[float]
    shift_magnitude: float
    direction: str
    estimated_impact: float
    quality_signal: str


@dataclass
class EvidenceRule:
    """Rule for evaluating evidence."""

    metric: str
    condition: str
    weight: float


@dataclass
class RecommendationTemplate:
    """Template for generating a recommendation."""

    action: str
    effort: str
    template: str


@dataclass
class DiagnosticCheckConfig:
    """Configuration for a diagnostic check loaded from YAML."""

    check_id: str
    name: str
    description: str
    evidence_rules: List[EvidenceRule]
    recommendation_templates: List[RecommendationTemplate]
    dimensions: Optional[List[str]] = None
    threshold: Optional[float] = None


@dataclass
class EvidenceResult:
    """Result of evaluating a single evidence rule."""

    metric: str
    condition: str
    expected: str
    actual_value: float
    passed: bool
    weight: float


@dataclass
class Diagnosis:
    """Confirmed finding from a diagnostic check."""

    check_id: str
    check_name: str
    confirmed: bool
    confidence: str
    confidence_score: float
    evidence: List[EvidenceResult]
    estimated_impact: float
    impact_direction: str
    affected_campaigns: List[str] = field(default_factory=list)
    affected_keywords: List[str] = field(default_factory=list)


@dataclass
class Recommendation:
    """Actionable suggestion from a diagnosis."""

    action_id: str
    diagnosis_id: str
    title: str
    description: str
    priority: int
    expected_impact: float
    impact_unit: str
    effort: str
    confidence: str
    affected_items: List[str] = field(default_factory=list)
    action_details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Investigation:
    """Complete root cause investigation for a metric."""

    metric: str
    metric_name: str
    previous_value: float
    current_value: float
    change_pct: float
    change_absolute: float
    triggered: bool
    threshold: float
    diagnoses: List[Diagnosis] = field(default_factory=list)
    recommendations: List[Recommendation] = field(default_factory=list)
    total_attributed_impact: float = 0.0
    attribution_accuracy: float = 0.0
    timestamp: datetime = field(default_factory=datetime.now)
    period_current: str = ""
    period_previous: str = ""


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
    dimensions: Optional[List[str]] = None
    threshold: Optional[float] = None


@dataclass
class ThresholdConfig:
    """Global threshold configuration."""

    min_data_points: int
    significance_level: float
    anomaly_z_score: float
    composition_shift_threshold: float = 0.15
    confidence_high: float = 0.85
    confidence_medium: float = 0.50


@dataclass
class DiagnosticTreeConfig:
    """Configuration for the diagnostic tree."""

    version: str
    metrics: Dict[str, MetricConfig]
    checks: Dict[str, CheckConfig]
    thresholds: ThresholdConfig


@dataclass
class AnalysisResults:
    """Complete analysis results for a client/period."""

    client_id: str
    period_current: str
    period_previous: str
    currency: str
    kpi_summary: Dict[str, Any]
    composition_device: Optional[CompositionBreakdown] = None
    composition_geo: Optional[CompositionBreakdown] = None
    composition_hour: Optional[CompositionBreakdown] = None
    composition_shifts: List[CompositionShift] = field(default_factory=list)
    cpl_investigation: Optional[Investigation] = None
    cvr_investigation: Optional[Investigation] = None
    volume_investigation: Optional[Investigation] = None
    negative_keywords: List[NegativeKeywordRec] = field(default_factory=list)
    top_search_terms: List[TopSearchTerm] = field(default_factory=list)
    match_type_breakdown: List[MatchTypeBreakdown] = field(default_factory=list)
    lost_impression_share: List[LostISInsight] = field(default_factory=list)
    budget_recommendations: List[BudgetRec] = field(default_factory=list)
    qs_changes: List[QSChange] = field(default_factory=list)
    low_qs_alerts: List[LowQSAlert] = field(default_factory=list)
    qs_distribution: Dict[str, int] = field(default_factory=dict)
    trends: List[TrendResult] = field(default_factory=list)
    anomalies: List[Anomaly] = field(default_factory=list)
    forecasts: List[Forecast] = field(default_factory=list)
