"""Client business configuration models."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class GoogleAdsSource:
    """Google Ads source definition."""

    alias: str
    customer_id: str


@dataclass
class MetaSource:
    """Meta Ads source definition."""

    alias: str
    account_id: str
    name: Optional[str] = None


@dataclass
class GA4Source:
    """GA4 source definition."""

    alias: str
    property_id: str


@dataclass
class SearchConsoleSource:
    """Search Console source definition."""

    alias: str
    site_url: str


@dataclass
class SourceRegistry:
    """Registry of configured client data sources keyed by alias."""

    google_ads: Dict[str, GoogleAdsSource] = field(default_factory=dict)
    meta: Dict[str, MetaSource] = field(default_factory=dict)
    ga4: Dict[str, GA4Source] = field(default_factory=dict)
    search_console: Dict[str, SearchConsoleSource] = field(default_factory=dict)

    def aliases(self) -> List[str]:
        """Return all configured aliases in declaration order."""
        return (
            list(self.google_ads.keys())
            + list(self.meta.keys())
            + list(self.ga4.keys())
            + list(self.search_console.keys())
        )

    def get(self, alias: str) -> Optional[Tuple[str, object]]:
        """Return ``(source_type, source)`` for *alias*, or ``None``."""
        if alias in self.google_ads:
            return "google_ads", self.google_ads[alias]
        if alias in self.meta:
            return "meta", self.meta[alias]
        if alias in self.ga4:
            return "ga4", self.ga4[alias]
        if alias in self.search_console:
            return "search_console", self.search_console[alias]
        return None


@dataclass
class SourceFilterSet:
    """Alias-specific brand scoping rules."""

    campaign_name_regex: str = ".*"
    landing_page_regex: str = ".*"
    key_events: List[str] = field(default_factory=list)
    page_regex: str = ".*"
    brand_terms: List[str] = field(default_factory=list)


@dataclass
class BrandDefinition:
    """Business-facing brand definition."""

    name: str
    sources: List[str] = field(default_factory=list)
    context: Dict[str, Any] = field(default_factory=dict)
    default_theme: Optional[str] = None
    filters: Dict[str, SourceFilterSet] = field(default_factory=dict)


@dataclass
class ThemeRule:
    """Maps a source alias to a client-facing theme."""

    source: str
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
class LeadRules:
    """Per-platform primary lead rules."""

    google_ads: GoogleLeadRule = field(default_factory=GoogleLeadRule)
    meta: MetaLeadRule = field(default_factory=MetaLeadRule)


@dataclass
class BusinessConfig:
    """Typed business config for analysis and reporting."""

    sources: SourceRegistry = field(default_factory=SourceRegistry)
    brands: List[BrandDefinition] = field(default_factory=list)
    theme_rules: List[ThemeRule] = field(default_factory=list)
    lead_rules: LeadRules = field(default_factory=LeadRules)
    data_notes: List[str] = field(default_factory=list)
