"""Client reporting configuration and view models."""

from dataclasses import dataclass, field
from typing import List, Optional


@dataclass
class BrandRule:
    """Maps campaigns to a client-facing brand bucket."""

    platform: str
    brand: str
    source_account_ids: List[str] = field(default_factory=list)
    campaign_name_regex: str = ".*"
    default_theme: Optional[str] = None


@dataclass
class ThemeRule:
    """Maps campaigns to a client-facing theme."""

    platform: str
    theme: str
    campaign_name_regex: str
    brand: Optional[str] = None


@dataclass
class GoogleLeadRule:
    """Rules for deriving primary leads from Google conversion actions."""

    include_conversion_actions: List[str] = field(default_factory=list)
    exclude_conversion_actions: List[str] = field(default_factory=list)


@dataclass
class MetaLeadRule:
    """Rules for deriving primary leads from Meta action types."""

    include_action_types: List[str] = field(default_factory=list)


@dataclass
class PrimaryLeadRules:
    """Per-platform primary lead rules."""

    google_ads: GoogleLeadRule = field(default_factory=GoogleLeadRule)
    meta: MetaLeadRule = field(default_factory=MetaLeadRule)


@dataclass
class ReportingConfig:
    """Client-facing reporting configuration."""

    brand_rules: List[BrandRule] = field(default_factory=list)
    theme_rules: List[ThemeRule] = field(default_factory=list)
    primary_lead_rules: PrimaryLeadRules = field(default_factory=PrimaryLeadRules)
    data_notes: List[str] = field(default_factory=list)


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
    brand_sections: List[BrandSection] = field(default_factory=list)
    lead_corrections: List[LeadCorrectionSummary] = field(default_factory=list)
