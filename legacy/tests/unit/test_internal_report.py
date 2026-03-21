"""Unit tests for internal markdown report generation."""

from pathlib import Path
from tempfile import TemporaryDirectory
import unittest

from src.reporting import InternalReportGenerator


class InternalReportGeneratorTests(unittest.TestCase):
    def test_generate_report_uses_brand_specific_filename_and_header(self) -> None:
        kpi_summary = {
            "impressions_current": 1000,
            "impressions_previous": 800,
            "impressions_change": 25.0,
            "clicks_current": 100,
            "clicks_previous": 80,
            "clicks_change": 25.0,
            "ctr_current": 10.0,
            "ctr_previous": 10.0,
            "ctr_change": 0.0,
            "leads_primary_current": 10.0,
            "leads_primary_previous": 8.0,
            "leads_primary_change": 25.0,
            "cvr_current": 10.0,
            "cvr_previous": 10.0,
            "cvr_change": 0.0,
            "conversions_secondary_current": 0.0,
            "conversions_secondary_previous": 0.0,
            "conversions_secondary_change": 0.0,
            "currency_breakdown_current": [],
            "currency_breakdown_previous": [],
            "platform_currency_breakdown_current": [],
            "findings": ["Primary leads: 10"],
        }

        with TemporaryDirectory() as tmp_dir:
            generator = InternalReportGenerator(output_dir=tmp_dir)
            path = generator.generate_report(
                client_id="nota",
                brand="Tint n' Wrap",
                period="2026-01",
                kpi_summary=kpi_summary,
                neg_keywords=[],
                top_search_terms=[],
                match_type_breakdown=[],
                lost_is=[],
                budget_recs=[],
                qs_changes=[],
                low_qs_alerts=[],
                qs_distribution={},
                trends=[],
                anomalies=[],
                forecast=[],
            )

            self.assertEqual(path.name, "nota_tint-n-wrap_2026-01.md")
            text = Path(path).read_text(encoding="utf-8")
            self.assertIn("# nota - Ads Performance Report (Tint n' Wrap)", text)
            self.assertIn("**Brand:** Tint n' Wrap", text)


if __name__ == "__main__":
    unittest.main()
