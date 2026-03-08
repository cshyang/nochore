"""Unit tests for the client summary builder."""

from datetime import date
import unittest

import polars as pl

from src.models import (
    BrandRule,
    GoogleLeadRule,
    GoogleConversionActionRecord,
    MetaLeadRule,
    PrimaryLeadRules,
    ReportingConfig,
    ThemeRule,
)
from src.reporting.summary_builder import (
    assign_brands,
    assign_themes,
    build_client_summary_report,
    normalize_campaigns,
)


class SummaryBuilderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.reporting_config = ReportingConfig(
            theme_rules=[
                ThemeRule(
                    platform="google_ads",
                    theme="Performance Max",
                    campaign_name_regex="(?i)performance max|pmax",
                ),
                ThemeRule(
                    platform="meta",
                    theme="Leads",
                    campaign_name_regex="(?i)lead",
                ),
            ],
            primary_lead_rules=PrimaryLeadRules(
                google_ads=GoogleLeadRule(include_conversion_actions=["Qualified Lead"]),
                meta=MetaLeadRule(include_action_types=["messaging_conversation_started_7d"]),
            ),
            data_notes=["Meta leads are counted from messaging conversation starts."],
        )

        self.campaigns_df = pl.DataFrame(
            [
                {
                    "client_id": "nota",
                    "platform": "google_ads",
                    "source_account_id": "g1",
                    "date": date(2026, 1, 1),
                    "campaign_id": "1",
                    "campaign_name": "Performance Max - Google Map",
                    "spend": 100.0,
                    "impressions": 1000,
                    "clicks": 100,
                    "conversions_primary": 12.0,
                    "conversions_secondary": 5.0,
                    "conversion_value": None,
                    "currency": "MYR",
                },
                {
                    "client_id": "nota",
                    "platform": "meta",
                    "source_account_id": "m1",
                    "date": date(2026, 1, 1),
                    "campaign_id": "2",
                    "campaign_name": "Leads Always On",
                    "spend": 80.0,
                    "impressions": 800,
                    "clicks": 40,
                    "conversions_primary": 4.0,
                    "conversions_secondary": 0.0,
                    "conversion_value": None,
                    "currency": "MYR",
                },
                {
                    "client_id": "nota",
                    "platform": "meta",
                    "source_account_id": "m1",
                    "date": date(2026, 1, 1),
                    "campaign_id": "3",
                    "campaign_name": "Unknown Awareness Campaign",
                    "spend": 20.0,
                    "impressions": 300,
                    "clicks": 10,
                    "conversions_primary": 0.0,
                    "conversions_secondary": 0.0,
                    "conversion_value": None,
                    "currency": "MYR",
                },
            ]
        )

        conversion_actions = [
            GoogleConversionActionRecord(
                client_id="nota",
                source_account_id="g1",
                date=date(2026, 1, 1),
                campaign_id="1",
                campaign_name="Performance Max - Google Map",
                conversion_action_name="Qualified Lead",
                conversions=7.0,
                all_conversions=7.0,
                currency="MYR",
            ),
            GoogleConversionActionRecord(
                client_id="nota",
                source_account_id="g1",
                date=date(2026, 1, 1),
                campaign_id="1",
                campaign_name="Performance Max - Google Map",
                conversion_action_name="Page View",
                conversions=5.0,
                all_conversions=5.0,
                currency="MYR",
            ),
        ]
        self.conversion_actions_df = pl.DataFrame([vars(record) for record in conversion_actions])

    def test_assign_themes_uses_rules_and_unmapped_fallback(self) -> None:
        themed = assign_themes(self.campaigns_df, self.reporting_config)
        self.assertEqual(themed["theme"].to_list(), ["Performance Max", "Leads", "Unmapped"])

    def test_assign_brands_routes_rows_by_account_and_default_theme(self) -> None:
        brand_config = ReportingConfig(
            brand_rules=[
                BrandRule(
                    platform="google_ads",
                    brand="Homescape",
                    source_account_ids=["g1"],
                    default_theme="Always On",
                ),
                BrandRule(
                    platform="meta",
                    brand="Nota Cafe",
                    source_account_ids=["m1"],
                ),
            ],
            theme_rules=[
                ThemeRule(
                    platform="meta",
                    theme="Leads",
                    campaign_name_regex="(?i)lead",
                )
            ],
            primary_lead_rules=self.reporting_config.primary_lead_rules,
        )

        branded = assign_brands(self.campaigns_df, brand_config)
        themed = assign_themes(branded, brand_config)

        self.assertEqual(branded["brand"].to_list(), ["Homescape", "Nota Cafe", "Nota Cafe"])
        self.assertEqual(themed["theme"].to_list(), ["Always On", "Leads", "Unmapped"])

    def test_normalize_campaigns_uses_included_google_actions(self) -> None:
        normalized, corrections = normalize_campaigns(
            self.campaigns_df,
            self.conversion_actions_df,
            self.reporting_config,
        )

        google_row = normalized.filter(pl.col("platform") == "google_ads").to_dicts()[0]
        self.assertEqual(google_row["conversions_primary"], 7.0)
        self.assertEqual(len(corrections), 1)
        self.assertEqual(corrections[0].reported_leads, 12.0)
        self.assertEqual(corrections[0].normalized_leads, 7.0)

    def test_build_client_summary_report_includes_notes_and_totals(self) -> None:
        normalized, corrections = normalize_campaigns(
            self.campaigns_df,
            self.conversion_actions_df,
            self.reporting_config,
        )
        report = build_client_summary_report(
            client_id="nota",
            current_df=normalized,
            reporting_config=self.reporting_config,
            period_start="2026-01-01",
            period_end="2026-01-31",
            lead_corrections=corrections,
        )

        self.assertEqual(len(report.spending_overview), 2)
        self.assertEqual(
            {item.platform for item in report.platform_breakdowns},
            {"Google Ads", "Meta Ads"},
        )
        self.assertTrue(any("lead correction" in note.lower() for note in report.data_notes))
        self.assertGreaterEqual(len(report.recommendations), 1)

    def test_build_client_summary_report_groups_brand_sections(self) -> None:
        multi_brand_df = pl.DataFrame(
            [
                {
                    "client_id": "last-minute",
                    "platform": "google_ads",
                    "source_account_id": "1073100792",
                    "date": date(2026, 1, 1),
                    "campaign_id": "g-home",
                    "campaign_name": "Homescape Search",
                    "spend": 120.0,
                    "impressions": 1000,
                    "clicks": 120,
                    "conversions_primary": 12.0,
                    "conversions_secondary": 0.0,
                    "conversion_value": None,
                    "currency": "MYR",
                },
                {
                    "client_id": "last-minute",
                    "platform": "meta",
                    "source_account_id": "act_3588231148124410",
                    "date": date(2026, 1, 1),
                    "campaign_id": "m-home",
                    "campaign_name": "Homescape Always On",
                    "spend": 80.0,
                    "impressions": 900,
                    "clicks": 60,
                    "conversions_primary": 5.0,
                    "conversions_secondary": 0.0,
                    "conversion_value": None,
                    "currency": "MYR",
                },
                {
                    "client_id": "last-minute",
                    "platform": "meta",
                    "source_account_id": "act_655792112740573",
                    "date": date(2026, 1, 1),
                    "campaign_id": "m-tint",
                    "campaign_name": "Lead Promo",
                    "spend": 40.0,
                    "impressions": 300,
                    "clicks": 25,
                    "conversions_primary": 4.0,
                    "conversions_secondary": 0.0,
                    "conversion_value": None,
                    "currency": "MYR",
                },
            ]
        )
        brand_config = ReportingConfig(
            brand_rules=[
                BrandRule(
                    platform="google_ads",
                    brand="Homescape",
                    source_account_ids=["107-310-0792"],
                    default_theme="Always On",
                ),
                BrandRule(
                    platform="meta",
                    brand="Homescape",
                    source_account_ids=["act_3588231148124410"],
                    default_theme="Always On",
                ),
                BrandRule(
                    platform="meta",
                    brand="Tint n' Wrap",
                    source_account_ids=["act_655792112740573"],
                ),
            ],
            theme_rules=[
                ThemeRule(
                    platform="meta",
                    theme="Leads",
                    campaign_name_regex="(?i)lead",
                )
            ],
            primary_lead_rules=self.reporting_config.primary_lead_rules,
        )

        report = build_client_summary_report(
            client_id="last-minute",
            current_df=multi_brand_df,
            reporting_config=brand_config,
            period_start="2026-01-01",
            period_end="2026-01-31",
        )

        self.assertEqual([section.brand for section in report.brand_sections], ["Homescape", "Tint n' Wrap"])
        self.assertEqual(len(report.spending_overview), 2)
        self.assertFalse(report.platform_breakdowns)
        homescape = report.brand_sections[0]
        self.assertEqual({item.platform for item in homescape.platform_breakdowns}, {"Google Ads", "Meta Ads"})
        self.assertTrue(any(row.brand == "Homescape" for row in report.insights))


if __name__ == "__main__":
    unittest.main()
