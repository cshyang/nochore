"""Google Ads data fetcher for analytics."""
import logging
from datetime import date, timedelta
from typing import List, Optional
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

from ..models import (
    SearchTermRecord,
    ImpressionShareRecord,
    QualityScoreRecord,
    PerformanceRecord,
    DimensionBreakdownRecord,
    GoogleConversionActionRecord,
    Platform
)

logger = logging.getLogger(__name__)

class GoogleAdsFetcher:
    """Fetches data from Google Ads API."""
    
    def __init__(self, client: GoogleAdsClient, customer_id: str):
        self.client = client
        self.customer_id = customer_id.replace("-", "")  # Remove dashes
        self.ga_service = client.get_service("GoogleAdsService")
    
    def fetch_search_terms(self, client_id: str, start_date: date, end_date: date) -> List[SearchTermRecord]:
        """Fetch search term reports."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                search_term_view.search_term,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                customer.currency_code
            FROM search_term_view
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
              AND metrics.impressions > 0
            ORDER BY metrics.cost_micros DESC
        """
        
        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)
            
            for batch in response:
                for row in batch.results:
                    records.append(SearchTermRecord(
                        client_id=client_id,
                        source_account_id=self.customer_id,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        ad_group_id=str(row.ad_group.id),
                        ad_group_name=row.ad_group.name,
                        search_term=row.search_term_view.search_term,
                        match_type="UNKNOWN",
                        impressions=row.metrics.impressions,
                        clicks=row.metrics.clicks,
                        cost=row.metrics.cost_micros / 1_000_000,
                        conversions=row.metrics.conversions,
                        currency=row.customer.currency_code
                    ))
            
            logger.info(f"Fetched {len(records)} search term records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching search terms: {ex}")
        
        return records
    
    def fetch_impression_share(self, client_id: str, start_date: date, end_date: date) -> List[ImpressionShareRecord]:
        """Fetch impression share metrics."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                segments.date,
                metrics.search_impression_share,
                metrics.search_budget_lost_impression_share,
                metrics.search_rank_lost_impression_share,
                metrics.search_absolute_top_impression_share
            FROM campaign
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
              AND campaign.advertising_channel_type = 'SEARCH'
        """
        
        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)
            
            for batch in response:
                for row in batch.results:
                    # Convert metrics (they may be None)
                    records.append(ImpressionShareRecord(
                        client_id=client_id,
                        source_account_id=self.customer_id,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        impression_share=row.metrics.search_impression_share if row.metrics.search_impression_share else None,
                        search_budget_lost_is=row.metrics.search_budget_lost_impression_share if row.metrics.search_budget_lost_impression_share else None,
                        search_rank_lost_is=row.metrics.search_rank_lost_impression_share if row.metrics.search_rank_lost_impression_share else None,
                        absolute_top_is=row.metrics.search_absolute_top_impression_share if row.metrics.search_absolute_top_impression_share else None
                    ))
            
            logger.info(f"Fetched {len(records)} impression share records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching impression share: {ex}")
        
        return records
    
    def fetch_quality_scores(self, client_id: str, start_date: date, end_date: date) -> List[QualityScoreRecord]:
        """Fetch quality score data."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                ad_group.id,
                ad_group.name,
                ad_group_criterion.criterion_id,
                ad_group_criterion.keyword.text,
                ad_group_criterion.keyword.match_type,
                ad_group_criterion.quality_info.quality_score,
                ad_group_criterion.quality_info.post_click_quality_score,
                ad_group_criterion.quality_info.creative_quality_score,
                ad_group_criterion.quality_info.search_predicted_ctr,
                segments.date,
                metrics.impressions,
                metrics.cost_micros,
                customer.currency_code
            FROM keyword_view
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
              AND ad_group_criterion.status IN ('ENABLED', 'PAUSED')
        """
        
        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)
            
            for batch in response:
                for row in batch.results:
                    records.append(QualityScoreRecord(
                        client_id=client_id,
                        source_account_id=self.customer_id,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        ad_group_id=str(row.ad_group.id),
                        ad_group_name=row.ad_group.name,
                        keyword_id=str(row.ad_group_criterion.criterion_id),
                        keyword_text=row.ad_group_criterion.keyword.text,
                        match_type=row.ad_group_criterion.keyword.match_type.name,
                        quality_score=row.ad_group_criterion.quality_info.quality_score if row.ad_group_criterion.quality_info.quality_score else None,
                        landing_page_exp=row.ad_group_criterion.quality_info.post_click_quality_score.name
                        if row.ad_group_criterion.quality_info.post_click_quality_score
                        else "UNSPECIFIED",
                        ad_relevance=row.ad_group_criterion.quality_info.creative_quality_score.name
                        if row.ad_group_criterion.quality_info.creative_quality_score
                        else "UNSPECIFIED",
                        expected_ctr=row.ad_group_criterion.quality_info.search_predicted_ctr.name
                        if row.ad_group_criterion.quality_info.search_predicted_ctr
                        else "UNSPECIFIED",
                        impressions=row.metrics.impressions,
                        cost=row.metrics.cost_micros / 1_000_000,
                        currency=row.customer.currency_code,
                    ))
            
            logger.info(f"Fetched {len(records)} quality score records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching quality scores: {ex}")
        
        return records
    
    def fetch_campaign_performance(self, client_id: str, start_date: date, end_date: date) -> List[PerformanceRecord]:
        """Fetch campaign performance metrics."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.all_conversions,
                metrics.conversions_value,
                customer.currency_code
            FROM campaign
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        """
        
        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)
            
            for batch in response:
                for row in batch.results:
                    conversions_primary = float(row.metrics.conversions or 0)
                    conversions_all = float(row.metrics.all_conversions or 0)
                    conversions_secondary = max(0.0, conversions_all - conversions_primary)

                    records.append(PerformanceRecord(
                        client_id=client_id,
                        platform=Platform.GOOGLE_ADS,
                        source_account_id=self.customer_id,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        spend=row.metrics.cost_micros / 1_000_000,
                        impressions=row.metrics.impressions,
                        clicks=row.metrics.clicks,
                        conversions_primary=conversions_primary,
                        conversions_secondary=conversions_secondary,
                        conversion_value=row.metrics.conversions_value if row.metrics.conversions_value else None,
                        currency=row.customer.currency_code
                    ))
            
            logger.info(f"Fetched {len(records)} campaign performance records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching campaign performance: {ex}")

        return records

    def fetch_conversion_actions(
        self, client_id: str, start_date: date, end_date: date
    ) -> List[GoogleConversionActionRecord]:
        """Fetch Google conversion totals segmented by conversion action name."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                segments.date,
                segments.conversion_action_name,
                metrics.conversions,
                metrics.all_conversions,
                customer.currency_code
            FROM campaign
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        """

        records: List[GoogleConversionActionRecord] = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)

            for batch in response:
                for row in batch.results:
                    action_name = getattr(row.segments, "conversion_action_name", "") or ""
                    if not action_name:
                        continue
                    records.append(
                        GoogleConversionActionRecord(
                            client_id=client_id,
                            source_account_id=self.customer_id,
                            date=date.fromisoformat(row.segments.date),
                            campaign_id=str(row.campaign.id),
                            campaign_name=row.campaign.name,
                            conversion_action_name=action_name,
                            conversions=float(row.metrics.conversions or 0),
                            all_conversions=float(row.metrics.all_conversions or 0),
                            currency=row.customer.currency_code,
                        )
                    )

            logger.info(f"Fetched {len(records)} conversion action records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching conversion actions: {ex}")

        return records

    def fetch_device_breakdown(self, client_id: str, start_date: date, end_date: date) -> List[DimensionBreakdownRecord]:
        """Fetch campaign performance metrics by device."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                segments.device,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.all_conversions,
                customer.currency_code
            FROM campaign
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        """

        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)

            for batch in response:
                for row in batch.results:
                    conversions_primary = float(row.metrics.conversions or 0)
                    conversions_all = float(row.metrics.all_conversions or 0)
                    conversions_secondary = max(0.0, conversions_all - conversions_primary)

                    records.append(DimensionBreakdownRecord(
                        client_id=client_id,
                        source_account_id=self.customer_id,
                        platform=Platform.GOOGLE_ADS,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        dimension_type="device",
                        dimension_value=row.segments.device.name,
                        spend=row.metrics.cost_micros / 1_000_000,
                        impressions=row.metrics.impressions,
                        clicks=row.metrics.clicks,
                        conversions_primary=conversions_primary,
                        conversions_secondary=conversions_secondary,
                        currency=row.customer.currency_code
                    ))

            logger.info(f"Fetched {len(records)} device breakdown records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching device breakdown: {ex}")

        return records

    def fetch_geo_breakdown(self, client_id: str, start_date: date, end_date: date) -> List[DimensionBreakdownRecord]:
        """Fetch campaign performance metrics by geographic location."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                geographic_view.country_criterion_id,
                geographic_view.location_type,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.all_conversions,
                customer.currency_code
            FROM geographic_view
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        """

        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)

            for batch in response:
                for row in batch.results:
                    conversions_primary = float(row.metrics.conversions or 0)
                    conversions_all = float(row.metrics.all_conversions or 0)
                    conversions_secondary = max(0.0, conversions_all - conversions_primary)

                    # Use country criterion ID as the geo value
                    geo_value = str(row.geographic_view.country_criterion_id)
                    location_type = row.geographic_view.location_type.name if row.geographic_view.location_type else "UNKNOWN"

                    records.append(DimensionBreakdownRecord(
                        client_id=client_id,
                        source_account_id=self.customer_id,
                        platform=Platform.GOOGLE_ADS,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        dimension_type="geo",
                        dimension_value=f"{geo_value}_{location_type}",
                        spend=row.metrics.cost_micros / 1_000_000,
                        impressions=row.metrics.impressions,
                        clicks=row.metrics.clicks,
                        conversions_primary=conversions_primary,
                        conversions_secondary=conversions_secondary,
                        currency=row.customer.currency_code
                    ))

            logger.info(f"Fetched {len(records)} geo breakdown records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching geo breakdown: {ex}")

        return records

    def fetch_hourly_breakdown(self, client_id: str, start_date: date, end_date: date) -> List[DimensionBreakdownRecord]:
        """Fetch campaign performance metrics by hour of day."""
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                segments.hour,
                segments.date,
                metrics.impressions,
                metrics.clicks,
                metrics.cost_micros,
                metrics.conversions,
                metrics.all_conversions,
                customer.currency_code
            FROM campaign
            WHERE segments.date BETWEEN '{start_date}' AND '{end_date}'
        """

        records = []
        try:
            response = self.ga_service.search_stream(customer_id=self.customer_id, query=query)

            for batch in response:
                for row in batch.results:
                    conversions_primary = float(row.metrics.conversions or 0)
                    conversions_all = float(row.metrics.all_conversions or 0)
                    conversions_secondary = max(0.0, conversions_all - conversions_primary)

                    records.append(DimensionBreakdownRecord(
                        client_id=client_id,
                        source_account_id=self.customer_id,
                        platform=Platform.GOOGLE_ADS,
                        date=date.fromisoformat(row.segments.date),
                        campaign_id=str(row.campaign.id),
                        campaign_name=row.campaign.name,
                        dimension_type="hour",
                        dimension_value=str(row.segments.hour),
                        spend=row.metrics.cost_micros / 1_000_000,
                        impressions=row.metrics.impressions,
                        clicks=row.metrics.clicks,
                        conversions_primary=conversions_primary,
                        conversions_secondary=conversions_secondary,
                        currency=row.customer.currency_code
                    ))

            logger.info(f"Fetched {len(records)} hourly breakdown records for {client_id}")
        except GoogleAdsException as ex:
            logger.error(f"Google Ads API error fetching hourly breakdown: {ex}")

        return records
