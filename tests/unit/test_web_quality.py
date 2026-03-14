"""Unit tests for GA4 web-quality analysis."""

from datetime import date
import unittest

import polars as pl

from src.analyzers.web_quality import WebQualityAnalyzer


class WebQualityAnalyzerTests(unittest.TestCase):
    def test_analyze_preserves_fractional_key_events(self) -> None:
        df = pl.DataFrame(
            [
                {
                    "client_id": "nota",
                    "source_alias": "nota_site",
                    "property_id": "400716907",
                    "date": date(2026, 3, 13),
                    "landing_page": "/",
                    "channel_group": "Organic Search",
                    "sessions": 10,
                    "engaged_sessions": 8,
                    "key_events": 1.434238,
                    "engagement_rate": 0.8,
                    "bounce_rate": 0.2,
                }
            ]
        )

        results = WebQualityAnalyzer(df, min_sessions=1).analyze()

        self.assertIsNotNone(results)
        assert results is not None
        self.assertAlmostEqual(results.summary["total_key_events"], 1.4342, places=4)
        self.assertAlmostEqual(results.top_landing_pages[0].key_events, 1.4342, places=4)
        self.assertAlmostEqual(
            results.top_landing_pages[0].key_event_rate, 0.1434, places=4
        )


if __name__ == "__main__":
    unittest.main()
