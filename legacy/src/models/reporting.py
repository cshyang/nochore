"""Reporting view models."""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class SpendingOverviewRow:
    """Topline spend by platform."""

    platform: str
    currency: str
    spend: float
    spend_pct: float


@dataclass
class ThemePerformanceRow:
    """Client-facing theme performance row."""

    theme: str
    spend: float
    spend_pct: float
    clicks: int
    leads: float
    cvr: float
    cpl: Optional[float]
    assessment: str = ""


@dataclass
class PlatformThemeBreakdown:
    """Breakdown of performance by platform and theme."""

    platform: str
    currency: str
    total_spend: float
    total_clicks: int
    total_leads: float
    rows: List[ThemePerformanceRow]


@dataclass
class BrandSection:
    """Breakdown of performance for a single brand."""

    brand: str
    total_spend: float
    platform_breakdowns: List[PlatformThemeBreakdown]


@dataclass
class InsightRow:
    """Ranked client-facing insight row."""

    rank: int
    brand: Optional[str]
    platform: str
    theme: str
    currency: str
    spend: float
    leads: float
    cpl: Optional[float]
    assessment: str


@dataclass
class LeadCorrectionSummary:
    """Summary of a platform lead normalization adjustment."""

    platform: str
    reported_leads: float
    normalized_leads: float
    excluded_actions: List[str] = field(default_factory=list)
    included_actions: List[str] = field(default_factory=list)


@dataclass
class ClientSummaryReport:
    """Structured data used to render the client summary markdown."""

    client_id: str
    period_label: str
    period_start: str
    period_end: str
    spending_overview: List[SpendingOverviewRow]
    platform_breakdowns: List[PlatformThemeBreakdown]
    insights: List[InsightRow]
    recommendations: List[str]
    data_notes: List[str]
    brand: Optional[str] = None
    brand_sections: List[BrandSection] = field(default_factory=list)
    lead_corrections: List[LeadCorrectionSummary] = field(default_factory=list)
