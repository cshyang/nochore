"""Unit tests for client summary markdown rendering."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from src.models import (
    BrandSection,
    ClientSummaryReport,
    InsightRow,
    PlatformThemeBreakdown,
    SpendingOverviewRow,
    ThemePerformanceRow,
)
from src.reporting.client_summary import ClientSummaryGenerator


class ClientSummaryGeneratorTests(unittest.TestCase):
    def test_generate_report_writes_expected_sections(self) -> None:
        report = ClientSummaryReport(
            client_id="nota",
            period_label="2026-01-01 to 2026-01-31",
            period_start="2026-01-01",
            period_end="2026-01-31",
            spending_overview=[
                SpendingOverviewRow(platform="Google Ads", currency="MYR", spend=100.0, spend_pct=55.0),
                SpendingOverviewRow(platform="Meta Ads", currency="MYR", spend=82.0, spend_pct=45.0),
            ],
            platform_breakdowns=[],
            insights=[
                InsightRow(
                    rank=1,
                    brand="Homescape",
                    platform="Google Ads",
                    theme="Performance Max",
                    currency="MYR",
                    spend=100.0,
                    leads=10.0,
                    cpl=10.0,
                    assessment="Top performer",
                )
            ],
            recommendations=["Scale Google Ads Performance Max — best CPL at MYR 10.00."],
            data_notes=["Meta leads are counted from messaging conversation starts."],
            brand_sections=[
                BrandSection(
                    brand="Homescape",
                    total_spend=100.0,
                    platform_breakdowns=[
                        PlatformThemeBreakdown(
                            platform="Google Ads",
                            currency="MYR",
                            total_spend=100.0,
                            total_clicks=100,
                            total_leads=10.0,
                            rows=[
                                ThemePerformanceRow(
                                    theme="Always On",
                                    spend=100.0,
                                    spend_pct=100.0,
                                    clicks=100,
                                    leads=10.0,
                                    cvr=10.0,
                                    cpl=10.0,
                                    assessment="Top performer",
                                )
                            ],
                        )
                    ],
                )
            ],
        )

        with TemporaryDirectory() as tmp_dir:
            generator = ClientSummaryGenerator(output_dir=tmp_dir)
            path = generator.generate_report(report)
            self.assertTrue(path.exists())
            text = Path(path).read_text(encoding="utf-8")
            self.assertIn("## Spending Overview", text)
            self.assertIn("## Homescape", text)
            self.assertIn("### Google Ads Breakdown by Theme", text)
            self.assertIn("## Recommendations", text)
            self.assertIn("| Rank | Brand | Platform | Theme | Spend | Leads | CPL | Assessment |", text)


if __name__ == "__main__":
    unittest.main()
