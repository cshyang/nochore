"""Core platform records persisted in storage."""

from dataclasses import dataclass
from datetime import date
from enum import Enum
from typing import Any, Dict, Optional


class Platform(Enum):
    """Supported advertising platforms."""

    META = "meta"
    GOOGLE_ADS = "google_ads"


@dataclass
class PerformanceRecord:
    """Single campaign/day performance record."""

    client_id: str
    platform: Platform
    source_alias: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    spend: float
    impressions: int
    clicks: int
    conversions_primary: float
    conversions_secondary: float = 0.0
    conversion_value: Optional[float] = None
    currency: str = "USD"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a storage-friendly mapping."""
        return {
            "client_id": self.client_id,
            "platform": self.platform.value,
            "source_alias": self.source_alias,
            "source_account_id": self.source_account_id,
            "date": self.date.isoformat(),
            "campaign_id": self.campaign_id,
            "campaign_name": self.campaign_name,
            "spend": self.spend,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "conversions_primary": self.conversions_primary,
            "conversions_secondary": self.conversions_secondary,
            "conversion_value": self.conversion_value,
            "currency": self.currency,
        }


@dataclass
class SearchTermRecord:
    """Search query that triggered ads."""

    client_id: str
    source_alias: str
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
    """Campaign impression share metrics."""

    client_id: str
    source_alias: str
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
    """Keyword quality score snapshot."""

    client_id: str
    source_alias: str
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
    currency: str = "UNKNOWN"


@dataclass
class DimensionBreakdownRecord:
    """Metric breakdown by a single dimension."""

    client_id: str
    source_alias: str
    source_account_id: str
    platform: Platform
    date: date
    campaign_id: str
    campaign_name: str
    dimension_type: str
    dimension_value: str
    spend: float
    impressions: int
    clicks: int
    conversions_primary: float
    conversions_secondary: float = 0.0
    currency: str = "USD"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to a storage-friendly mapping."""
        return {
            "client_id": self.client_id,
            "source_alias": self.source_alias,
            "source_account_id": self.source_account_id,
            "platform": self.platform.value,
            "date": self.date.isoformat() if isinstance(self.date, date) else self.date,
            "campaign_id": self.campaign_id,
            "campaign_name": self.campaign_name,
            "dimension_type": self.dimension_type,
            "dimension_value": self.dimension_value,
            "spend": self.spend,
            "impressions": self.impressions,
            "clicks": self.clicks,
            "conversions_primary": self.conversions_primary,
            "conversions_secondary": self.conversions_secondary,
            "currency": self.currency,
        }


@dataclass
class GA4LandingPageRecord:
    """GA4 landing page engagement data per day."""

    client_id: str
    source_alias: str
    property_id: str
    date: date
    landing_page: str
    channel_group: str
    sessions: int
    engaged_sessions: int
    key_events: float
    engagement_rate: float
    bounce_rate: float


@dataclass
class GoogleConversionActionRecord:
    """Google Ads conversion totals segmented by conversion action name."""

    client_id: str
    source_alias: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    conversion_action_name: str
    conversions: float
    all_conversions: float
    currency: str


@dataclass
class SearchConsoleRecord:
    """Search Console search analytics row."""

    client_id: str
    source_alias: str
    site_url: str
    date: date
    query: str
    page: str
    clicks: int
    impressions: int
    ctr: float
    position: float
