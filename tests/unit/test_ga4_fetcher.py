"""Unit tests for GA4 fetcher metric parsing."""

from datetime import date
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

from google.analytics.data_v1beta.types import MetricType

from src.fetchers.ga4 import GA4Fetcher


def _value(value: str) -> SimpleNamespace:
    return SimpleNamespace(value=value)


class GA4FetcherTests(unittest.TestCase):
    def test_fetch_landing_pages_accepts_fractional_key_events(self) -> None:
        response = SimpleNamespace(
            metric_headers=[
                SimpleNamespace(name="sessions", type_=MetricType.TYPE_INTEGER),
                SimpleNamespace(name="engagedSessions", type_=MetricType.TYPE_INTEGER),
                SimpleNamespace(name="keyEvents", type_=MetricType.TYPE_FLOAT),
                SimpleNamespace(name="engagementRate", type_=MetricType.TYPE_FLOAT),
                SimpleNamespace(name="bounceRate", type_=MetricType.TYPE_FLOAT),
            ],
            rows=[
                SimpleNamespace(
                    dimension_values=[
                        _value("20260313"),
                        _value("/"),
                        _value("Organic Search"),
                    ],
                    metric_values=[
                        _value("8"),
                        _value("8"),
                        _value("1.434238"),
                        _value("1"),
                        _value("0"),
                    ],
                )
            ],
            metadata=SimpleNamespace(data_loss_from_other_row=False),
        )

        with patch("src.fetchers.ga4.BetaAnalyticsDataClient") as client_cls:
            client = Mock()
            client.run_report.return_value = response
            client_cls.return_value = client

            fetcher = GA4Fetcher(
                credentials=object(),
                source_alias="nota_site",
                property_id="400716907",
            )
            records = fetcher.fetch_landing_pages(
                client_id="nota",
                start_date=date(2026, 3, 1),
                end_date=date(2026, 3, 13),
            )

        self.assertEqual(len(records), 1)
        self.assertEqual(records[0].sessions, 8)
        self.assertEqual(records[0].engaged_sessions, 8)
        self.assertEqual(records[0].source_alias, "nota_site")
        self.assertAlmostEqual(records[0].key_events, 1.434238)


if __name__ == "__main__":
    unittest.main()
