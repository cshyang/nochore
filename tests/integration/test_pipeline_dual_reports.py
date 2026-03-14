"""Integration tests for dual report generation."""

from datetime import date, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from src.credentials import CredentialManager
from src.models import (
    BusinessConfig,
    GoogleAdsSource,
    GoogleLeadRule,
    GoogleConversionActionRecord,
    LeadRules,
    MetaSource,
    MetaLeadRule,
    PerformanceRecord,
    Platform,
    SourceRegistry,
    ThemeRule,
)
from src.pipeline import process_client
from src.reporting import ClientSummaryGenerator, InternalReportGenerator
from src.storage import StorageManager


class PipelineDualReportsTests(unittest.TestCase):
    def test_process_client_writes_internal_and_summary_reports(self) -> None:
        current_start = date(2026, 1, 1)
        current_end = date(2026, 1, 7)

        with TemporaryDirectory() as tmp_dir:
            data_dir = Path(tmp_dir) / "data"
            report_dir = Path(tmp_dir) / "reports"
            storage = StorageManager(base_dir=str(data_dir))
            self._seed_campaign_data(storage, current_start)
            self._seed_conversion_actions(storage, current_start)

            business_config = BusinessConfig(
                sources=SourceRegistry(
                    google_ads={
                        "nota_ads": GoogleAdsSource(
                            alias="nota_ads",
                            customer_id="556-178-5391",
                        )
                    },
                    meta={
                        "nota_meta": MetaSource(
                            alias="nota_meta",
                            account_id="act_123",
                        )
                    },
                ),
                theme_rules=[
                    ThemeRule(
                        source="nota_ads",
                        theme="Performance Max",
                        campaign_name_regex="(?i)performance max",
                    ),
                    ThemeRule(
                        source="nota_meta",
                        theme="Leads",
                        campaign_name_regex="(?i)lead",
                    ),
                ],
                lead_rules=LeadRules(
                    google_ads=GoogleLeadRule(include_conversion_actions=["Qualified Lead"]),
                    meta=MetaLeadRule(include_action_types=["messaging_conversation_started_7d"]),
                ),
                data_notes=["Meta leads are counted from messaging conversation starts."],
            )

            process_client(
                client_id="nota",
                business_config=business_config,
                current_start=current_start,
                current_end=current_end,
                storage=storage,
                internal_report_generator=InternalReportGenerator(output_dir=str(report_dir)),
                client_summary_generator=ClientSummaryGenerator(output_dir=str(report_dir)),
                cred_manager=CredentialManager(env_file=str(Path(tmp_dir) / ".env.local")),
                no_fetch=True,
                is_monthly=False,
            )

            internal_path = report_dir / "nota_2026-01.md"
            summary_path = report_dir / "nota_2026-01_summary.md"
            self.assertTrue(internal_path.exists())
            self.assertTrue(summary_path.exists())
            self.assertIn("## Executive Summary", internal_path.read_text(encoding="utf-8"))
            self.assertIn("## Spending Overview", summary_path.read_text(encoding="utf-8"))

    def _seed_campaign_data(self, storage: StorageManager, current_start: date) -> None:
        records = []
        previous_start = current_start - timedelta(days=7)
        for offset in range(7):
            day = previous_start + timedelta(days=offset)
            records.append(
                PerformanceRecord(
                    client_id="nota",
                    platform=Platform.GOOGLE_ADS,
                    source_alias="nota_ads",
                    source_account_id="g1",
                    date=day,
                    campaign_id="g-campaign",
                    campaign_name="Performance Max - Google Map",
                    spend=50.0,
                    impressions=500,
                    clicks=40,
                    conversions_primary=6.0,
                    conversions_secondary=2.0,
                    currency="MYR",
                )
            )
            records.append(
                PerformanceRecord(
                    client_id="nota",
                    platform=Platform.META,
                    source_alias="nota_meta",
                    source_account_id="m1",
                    date=day,
                    campaign_id="m-campaign",
                    campaign_name="Leads Always On",
                    spend=40.0,
                    impressions=400,
                    clicks=20,
                    conversions_primary=2.0,
                    currency="MYR",
                )
            )

        for offset in range(7):
            day = current_start + timedelta(days=offset)
            records.append(
                PerformanceRecord(
                    client_id="nota",
                    platform=Platform.GOOGLE_ADS,
                    source_alias="nota_ads",
                    source_account_id="g1",
                    date=day,
                    campaign_id="g-campaign",
                    campaign_name="Performance Max - Google Map",
                    spend=60.0,
                    impressions=600,
                    clicks=50,
                    conversions_primary=10.0,
                    conversions_secondary=3.0,
                    currency="MYR",
                )
            )
            records.append(
                PerformanceRecord(
                    client_id="nota",
                    platform=Platform.META,
                    source_alias="nota_meta",
                    source_account_id="m1",
                    date=day,
                    campaign_id="m-campaign",
                    campaign_name="Leads Always On",
                    spend=45.0,
                    impressions=420,
                    clicks=24,
                    conversions_primary=3.0,
                    currency="MYR",
                )
            )

        storage.append("nota", "campaigns", records)

    def _seed_conversion_actions(self, storage: StorageManager, current_start: date) -> None:
        records = []
        previous_start = current_start - timedelta(days=7)
        for offset in range(7):
            day = previous_start + timedelta(days=offset)
            records.append(
                GoogleConversionActionRecord(
                    client_id="nota",
                    source_alias="nota_ads",
                    source_account_id="g1",
                    date=day,
                    campaign_id="g-campaign",
                    campaign_name="Performance Max - Google Map",
                    conversion_action_name="Qualified Lead",
                    conversions=4.0,
                    all_conversions=4.0,
                    currency="MYR",
                )
            )
        for offset in range(7):
            day = current_start + timedelta(days=offset)
            records.append(
                GoogleConversionActionRecord(
                    client_id="nota",
                    source_alias="nota_ads",
                    source_account_id="g1",
                    date=day,
                    campaign_id="g-campaign",
                    campaign_name="Performance Max - Google Map",
                    conversion_action_name="Qualified Lead",
                    conversions=6.0,
                    all_conversions=6.0,
                    currency="MYR",
                )
            )
            records.append(
                GoogleConversionActionRecord(
                    client_id="nota",
                    source_alias="nota_ads",
                    source_account_id="g1",
                    date=day,
                    campaign_id="g-campaign",
                    campaign_name="Performance Max - Google Map",
                    conversion_action_name="Page View",
                    conversions=4.0,
                    all_conversions=4.0,
                    currency="MYR",
                )
            )

        storage.append("nota", "conversion_actions", records)


if __name__ == "__main__":
    unittest.main()
