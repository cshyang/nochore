"""Data models and schemas for ads report automation."""
from dataclasses import dataclass
from typing import Optional, Dict, Any, Tuple
from datetime import date
from enum import Enum

class Platform(Enum):
    """Supported advertising platforms."""
    META = "meta"
    GOOGLE_ADS = "google_ads"

@dataclass
class PerformanceRecord:
    """Single performance record."""
    client_id: str
    platform: Platform
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
    currency: str = "USD"  # Default to USD

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary format."""
        return {
            'client_id': self.client_id,
            'platform': self.platform.value,
            'source_account_id': self.source_account_id,
            'date': self.date.isoformat(),
            'campaign_id': self.campaign_id,
            'campaign_name': self.campaign_name,
            'spend': self.spend,
            'impressions': self.impressions,
            'clicks': self.clicks,
            'conversions_primary': self.conversions_primary,
            'conversions_secondary': self.conversions_secondary,
            'conversion_value': self.conversion_value,
            'currency': self.currency
        }

# New record types for analytics
@dataclass
class SearchTermRecord:
    """Search query that triggered ads."""
    client_id: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    ad_group_id: str
    ad_group_name: str
    search_term: str
    match_type: str  # EXACT, PHRASE, BROAD
    impressions: int
    clicks: int
    cost: float
    conversions: float
    currency: str

@dataclass
class ImpressionShareRecord:
    """Campaign impression share metrics."""
    client_id: str
    source_account_id: str
    date: date
    campaign_id: str
    campaign_name: str
    impression_share: Optional[float]  # % received
    search_budget_lost_is: Optional[float]  # % lost to budget
    search_rank_lost_is: Optional[float]  # % lost to rank
    absolute_top_is: Optional[float]  # % at absolute top

@dataclass
class QualityScoreRecord:
    """Keyword quality score snapshot."""
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
    quality_score: Optional[int]  # 1-10
    landing_page_exp: str  # BELOW_AVERAGE, AVERAGE, ABOVE_AVERAGE
    ad_relevance: str
    expected_ctr: str
    impressions: int
    cost: float
    currency: str = "UNKNOWN"

# Analyzer output models
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
    reason: str  # "high_spend_no_conv", "low_ctr", "irrelevant"
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
    direction: str  # "up", "down", "flat"
    rate_per_day: float
    significance: str  # "significant", "not_significant"

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
