"""Meta Ads data fetcher for analytics."""
import logging
from datetime import date
from typing import Iterable, List, Optional
from facebook_business.adobjects.adaccount import AdAccount
from facebook_business.adobjects.adsinsights import AdsInsights
from facebook_business.api import FacebookAdsApi

from ...models import DimensionBreakdownRecord, PerformanceRecord, Platform

logger = logging.getLogger(__name__)

DEFAULT_META_ACTION_TYPES = {
    "messaging_conversation_started_7d",
    "onsite_conversion.messaging_conversation_started_7d",
}


class MetaAdsFetcher:
    """Fetches campaign-level data from Meta Ads API."""

    def __init__(
        self,
        api: FacebookAdsApi,
        source_alias: str,
        account_id: str,
        include_action_types: Optional[Iterable[str]] = None,
    ):
        self.api = api
        self.source_alias = source_alias
        self.account = AdAccount(account_id)
        self.conversion_action_types = set(include_action_types or DEFAULT_META_ACTION_TYPES)
    
    def fetch_campaign_performance(self, client_id: str, start_date: date, end_date: date) -> List[PerformanceRecord]:
        """Fetch campaign performance metrics."""
        fields = [
            AdsInsights.Field.campaign_id,
            AdsInsights.Field.campaign_name,
            AdsInsights.Field.date_start,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
            AdsInsights.Field.action_values,
            AdsInsights.Field.account_currency
        ]
        
        params = {
            'time_range': {
                'since': start_date.isoformat(),
                'until': end_date.isoformat()
            },
            'level': 'campaign',
            'breakdowns': [],
            'time_increment': 1  # Daily breakdown
        }
        
        records = []
        try:
            insights = self.account.get_insights(fields=fields, params=params)
            
            for insight in insights:
                # Extract conversions
                conversions = 0
                conversion_value = 0.0
                
                if 'actions' in insight:
                    for action in insight['actions']:
                        if action.get("action_type") in self.conversion_action_types:
                            conversions += int(float(action.get("value", 0) or 0))
                
                if 'action_values' in insight:
                    for action_value in insight['action_values']:
                        if action_value.get("action_type") in self.conversion_action_types:
                            conversion_value += float(action_value.get("value", 0) or 0)
                
                records.append(PerformanceRecord(
                    client_id=client_id,
                    platform=Platform.META,
                    source_alias=self.source_alias,
                    source_account_id=self.account.get_id(),
                    date=date.fromisoformat(insight['date_start']),
                    campaign_id=insight['campaign_id'],
                    campaign_name=insight['campaign_name'],
                    spend=float(insight.get('spend', 0)),
                    impressions=int(insight.get('impressions', 0)),
                    clicks=int(insight.get('clicks', 0)),
                    conversions_primary=float(conversions),
                    conversions_secondary=0.0,
                    conversion_value=conversion_value if conversion_value > 0 else None,
                    currency=insight.get('account_currency', 'USD')
                ))
            
            logger.info(f"Fetched {len(records)} Meta campaign performance records for {client_id}")
        except Exception as ex:
            logger.error(f"Meta Ads API error: {ex}")

        return records

    def fetch_device_breakdown(self, client_id: str, start_date: date, end_date: date) -> List[DimensionBreakdownRecord]:
        """Fetch campaign performance metrics by device platform."""
        fields = [
            AdsInsights.Field.campaign_id,
            AdsInsights.Field.campaign_name,
            AdsInsights.Field.date_start,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
            AdsInsights.Field.account_currency,
        ]

        params = {
            'time_range': {
                'since': start_date.isoformat(),
                'until': end_date.isoformat()
            },
            'level': 'campaign',
            'breakdowns': ['device_platform'],
            'time_increment': 1
        }

        records = []
        try:
            insights = self.account.get_insights(fields=fields, params=params)

            for insight in insights:
                conversions = 0
                if 'actions' in insight:
                    for action in insight['actions']:
                        if action.get("action_type") in self.conversion_action_types:
                            conversions += int(float(action.get("value", 0) or 0))

                device_platform = insight.get('device_platform', 'UNKNOWN')

                records.append(DimensionBreakdownRecord(
                    client_id=client_id,
                    source_alias=self.source_alias,
                    source_account_id=self.account.get_id(),
                    platform=Platform.META,
                    date=date.fromisoformat(insight['date_start']),
                    campaign_id=insight['campaign_id'],
                    campaign_name=insight['campaign_name'],
                    dimension_type="device",
                    dimension_value=device_platform.upper(),
                    spend=float(insight.get('spend', 0)),
                    impressions=int(insight.get('impressions', 0)),
                    clicks=int(insight.get('clicks', 0)),
                    conversions_primary=float(conversions),
                    conversions_secondary=0.0,
                    currency=insight.get('account_currency', 'USD')
                ))

            logger.info(f"Fetched {len(records)} Meta device breakdown records for {client_id}")
        except Exception as ex:
            logger.error(f"Meta Ads API error fetching device breakdown: {ex}")

        return records

    def fetch_placement_breakdown(self, client_id: str, start_date: date, end_date: date) -> List[DimensionBreakdownRecord]:
        """Fetch campaign performance metrics by publisher platform (placement)."""
        fields = [
            AdsInsights.Field.campaign_id,
            AdsInsights.Field.campaign_name,
            AdsInsights.Field.date_start,
            AdsInsights.Field.impressions,
            AdsInsights.Field.clicks,
            AdsInsights.Field.spend,
            AdsInsights.Field.actions,
            AdsInsights.Field.account_currency,
        ]

        params = {
            'time_range': {
                'since': start_date.isoformat(),
                'until': end_date.isoformat()
            },
            'level': 'campaign',
            'breakdowns': ['publisher_platform'],
            'time_increment': 1
        }

        records = []
        try:
            insights = self.account.get_insights(fields=fields, params=params)

            for insight in insights:
                conversions = 0
                if 'actions' in insight:
                    for action in insight['actions']:
                        if action.get("action_type") in self.conversion_action_types:
                            conversions += int(float(action.get("value", 0) or 0))

                publisher_platform = insight.get('publisher_platform', 'UNKNOWN')

                records.append(DimensionBreakdownRecord(
                    client_id=client_id,
                    source_alias=self.source_alias,
                    source_account_id=self.account.get_id(),
                    platform=Platform.META,
                    date=date.fromisoformat(insight['date_start']),
                    campaign_id=insight['campaign_id'],
                    campaign_name=insight['campaign_name'],
                    dimension_type="placement",
                    dimension_value=publisher_platform.upper(),
                    spend=float(insight.get('spend', 0)),
                    impressions=int(insight.get('impressions', 0)),
                    clicks=int(insight.get('clicks', 0)),
                    conversions_primary=float(conversions),
                    conversions_secondary=0.0,
                    currency=insight.get('account_currency', 'USD')
                ))

            logger.info(f"Fetched {len(records)} Meta placement breakdown records for {client_id}")
        except Exception as ex:
            logger.error(f"Meta Ads API error fetching placement breakdown: {ex}")

        return records
