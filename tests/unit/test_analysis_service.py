"""Unit tests for data sync service orchestration."""

from __future__ import annotations

from datetime import date
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, patch

from src.models import BusinessConfig, GA4Source, GoogleAdsSource, MetaSource, SearchConsoleSource, SourceRegistry
from src.storage import StorageManager
from src.tools.analysis.service import sync_client_data


class AnalysisServiceTests(unittest.TestCase):
    @patch("src.tools.analysis.service.SearchConsoleFetcher")
    @patch("src.tools.analysis.service.GA4Fetcher")
    @patch("src.tools.analysis.service.MetaAdsFetcher")
    @patch("src.tools.analysis.service.GoogleAdsFetcher")
    @patch("src.tools.analysis.service.init_google_ads_client")
    def test_sync_client_data_routes_all_source_types(
        self,
        init_google_ads_client,
        google_fetcher_cls,
        meta_fetcher_cls,
        ga4_fetcher_cls,
        sc_fetcher_cls,
    ) -> None:
        with TemporaryDirectory() as tmp_dir:
            storage = StorageManager(base_dir=tmp_dir)
            business_config = BusinessConfig(
                sources=SourceRegistry(
                    google_ads={"gads": GoogleAdsSource(alias="gads", customer_id="1")},
                    meta={"meta1": MetaSource(alias="meta1", account_id="act_1")},
                    ga4={"ga4site": GA4Source(alias="ga4site", property_id="123")},
                    search_console={"scsite": SearchConsoleSource(alias="scsite", site_url="sc-domain:example.com")},
                )
            )
            cred = MagicMock()
            cred.has_meta_credentials.return_value = True
            cred.get_meta_credentials.return_value = {"access_token": "token"}
            cred.has_google_service_account.return_value = True
            cred.get_google_service_account_credentials.return_value = object()
            init_google_ads_client.return_value = object()

            google_fetcher = google_fetcher_cls.return_value
            google_fetcher.fetch_search_terms.return_value = []
            google_fetcher.fetch_impression_share.return_value = []
            google_fetcher.fetch_quality_scores.return_value = []
            google_fetcher.fetch_campaign_performance.return_value = []
            google_fetcher.fetch_conversion_actions.return_value = []

            meta_fetcher = meta_fetcher_cls.return_value
            meta_fetcher.fetch_campaign_performance.return_value = []

            ga4_fetcher = ga4_fetcher_cls.return_value
            ga4_fetcher.fetch_landing_pages.return_value = []

            sc_fetcher = sc_fetcher_cls.return_value
            sc_fetcher.fetch_search_analytics.return_value = []

            with patch("facebook_business.api.FacebookAdsApi.init"):
                result = sync_client_data(
                    "acme",
                    business_config,
                    date(2026, 1, 1),
                    date(2026, 1, 31),
                    storage,
                    cred,
                )

            source_types = {row["source_type"] for row in result["sources"]}
            self.assertEqual(source_types, {"google_ads", "meta", "ga4", "search_console"})


if __name__ == "__main__":
    unittest.main()
