"""Unit tests for shared brand-scoping helpers."""

from datetime import date
import unittest

import polars as pl

from src.models import (
    BrandDefinition,
    BusinessConfig,
    GoogleAdsSource,
    MetaSource,
    SourceFilterSet,
    SourceRegistry,
)
from src.reporting import canonicalize_brand_name, filter_to_brand, list_brands


class BrandScopeTests(unittest.TestCase):
    def setUp(self) -> None:
        self.business_config = BusinessConfig(
            sources=SourceRegistry(
                google_ads={
                    "shared_google": GoogleAdsSource(
                        alias="shared_google",
                        customer_id="111-111-1111",
                    )
                },
                meta={
                    "home_meta": MetaSource(alias="home_meta", account_id="act_home")
                },
            ),
            brands=[
                BrandDefinition(
                    name="Homescape",
                    sources=["shared_google", "home_meta"],
                    filters={
                        "shared_google": SourceFilterSet(
                            campaign_name_regex="(?i)home"
                        )
                    },
                ),
                BrandDefinition(
                    name="Tint n' Wrap",
                    sources=["shared_google"],
                    filters={
                        "shared_google": SourceFilterSet(
                            campaign_name_regex="(?i)tint"
                        )
                    },
                ),
            ],
        )
        self.df = pl.DataFrame(
            [
                {
                    "platform": "google_ads",
                    "source_alias": "shared_google",
                    "source_account_id": "1111111111",
                    "campaign_name": "Homescape Search",
                    "date": date(2026, 1, 1),
                    "spend": 100.0,
                },
                {
                    "platform": "google_ads",
                    "source_alias": "shared_google",
                    "source_account_id": "1111111111",
                    "campaign_name": "Tint Promo",
                    "date": date(2026, 1, 1),
                    "spend": 50.0,
                },
                {
                    "platform": "meta",
                    "source_alias": "home_meta",
                    "source_account_id": "act_home",
                    "campaign_name": "Homescape Leads",
                    "date": date(2026, 1, 1),
                    "spend": 25.0,
                },
            ]
        )

    def test_list_brands_and_canonicalize_use_configured_casing(self) -> None:
        self.assertEqual(list_brands(self.business_config), ["Homescape", "Tint n' Wrap"])
        self.assertEqual(
            canonicalize_brand_name(self.business_config, "tint n' wrap"),
            "Tint n' Wrap",
        )

    def test_filter_to_brand_matches_shared_account_via_regex(self) -> None:
        brand, filtered = filter_to_brand(self.df, self.business_config, "homescape")

        self.assertEqual(brand, "Homescape")
        self.assertEqual(len(filtered), 2)
        self.assertEqual(
            set(filtered["campaign_name"].to_list()),
            {"Homescape Search", "Homescape Leads"},
        )

    def test_filter_to_brand_returns_empty_for_known_brand_without_matches(self) -> None:
        df = self.df.filter(pl.col("platform") == "meta")

        brand, filtered = filter_to_brand(df, self.business_config, "Tint n' Wrap")

        self.assertEqual(brand, "Tint n' Wrap")
        self.assertTrue(filtered.is_empty())


if __name__ == "__main__":
    unittest.main()
