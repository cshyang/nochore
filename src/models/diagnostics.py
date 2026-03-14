"""Diagnostic engine types -- evidence, diagnosis, and investigation models."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional


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
