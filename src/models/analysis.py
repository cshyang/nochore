"""Analyzer output types -- what each analyzer returns."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import TYPE_CHECKING, Any, Dict, List, Optional, Tuple

if TYPE_CHECKING:
    from .diagnostics import Investigation


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
class LandingPageInsight:
    """Single landing page quality insight from GA4."""

    landing_page: str
    sessions: int
    engagement_rate: float
    bounce_rate: float
    key_events: float
    key_event_rate: float
    top_channels: List[str] = field(default_factory=list)
    signal: str = "healthy"  # healthy|low_engagement|low_key_events|high_bounce


@dataclass
class PaidVsEngagementInsight:
    """Pages where paid traffic volume is high but engagement is weak."""

    landing_page: str
    paid_sessions: int
    paid_engagement_rate: float
    paid_bounce_rate: float
    organic_engagement_rate: Optional[float]
    gap: float


@dataclass
class WebQualityResults:
    """GA4 web quality analysis results."""

    top_landing_pages: List[LandingPageInsight] = field(default_factory=list)
    low_engagement_pages: List[LandingPageInsight] = field(default_factory=list)
    low_key_event_pages: List[LandingPageInsight] = field(default_factory=list)
    paid_engagement_gaps: List[PaidVsEngagementInsight] = field(default_factory=list)
    summary: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AnalysisResults:
    """Complete analysis results for a client/period."""

    client_id: str
    period_current: str
    period_previous: str
    currency: str
    scope: str = "client"
    brand: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)
    kpi_summary: Dict[str, Any] = field(default_factory=dict)
    web_quality: Optional[WebQualityResults] = None
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
