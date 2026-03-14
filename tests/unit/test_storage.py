"""Unit tests for storage schema compatibility."""

from datetime import date
from tempfile import TemporaryDirectory
import unittest

import polars as pl

from src.models.core import GA4LandingPageRecord
from src.storage import StorageManager


class StorageManagerTests(unittest.TestCase):
    def test_append_promotes_existing_ga4_key_events_to_float(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            storage = StorageManager(tmp_dir)
            partition = (
                storage.base_dir / "nota" / "ga4_landing_pages" / "2026-03.parquet"
            )
            partition.parent.mkdir(parents=True, exist_ok=True)
            pl.DataFrame(
                [
                    {
                        "client_id": "nota",
                        "source_alias": "nota_site",
                        "property_id": "400716907",
                        "date": date(2026, 3, 12),
                        "landing_page": "/",
                        "channel_group": "Organic Search",
                        "sessions": 4,
                        "engaged_sessions": 4,
                        "key_events": 5,
                        "engagement_rate": 1.0,
                        "bounce_rate": 0.0,
                    }
                ]
            ).write_parquet(partition)

            storage.append(
                "nota",
                "ga4_landing_pages",
                [
                    GA4LandingPageRecord(
                        client_id="nota",
                        source_alias="nota_site",
                        property_id="400716907",
                        date=date(2026, 3, 13),
                        landing_page="/",
                        channel_group="Organic Search",
                        sessions=8,
                        engaged_sessions=8,
                        key_events=1.434238,
                        engagement_rate=1.0,
                        bounce_rate=0.0,
                    )
                ],
            )

            stored = pl.read_parquet(partition).sort("date")
            self.assertEqual(stored.schema["key_events"], pl.Float64)
            self.assertEqual(stored.height, 2)
            self.assertAlmostEqual(stored["key_events"].to_list()[1], 1.434238)

    def test_read_handles_mixed_numeric_schemas_across_partitions(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            storage = StorageManager(tmp_dir)
            base = storage.base_dir / "nota" / "ga4_landing_pages"
            base.mkdir(parents=True, exist_ok=True)

            pl.DataFrame(
                [
                    {
                        "client_id": "nota",
                        "source_alias": "nota_site",
                        "property_id": "400716907",
                        "date": date(2026, 2, 28),
                        "landing_page": "/",
                        "channel_group": "Organic Search",
                        "sessions": 4,
                        "engaged_sessions": 4,
                        "key_events": 5,
                        "engagement_rate": 1.0,
                        "bounce_rate": 0.0,
                    }
                ]
            ).write_parquet(base / "2026-02.parquet")

            pl.DataFrame(
                [
                    {
                        "client_id": "nota",
                        "source_alias": "nota_site",
                        "property_id": "400716907",
                        "date": date(2026, 3, 1),
                        "landing_page": "/menu",
                        "channel_group": "Organic Search",
                        "sessions": 6,
                        "engaged_sessions": 5,
                        "key_events": 1.5,
                        "engagement_rate": 0.8333,
                        "bounce_rate": 0.1667,
                    }
                ]
            ).write_parquet(base / "2026-03.parquet")

            stored = storage.read(
                "nota",
                "ga4_landing_pages",
                start_date=date(2026, 2, 1),
                end_date=date(2026, 3, 31),
            ).sort("date")

            self.assertEqual(stored.height, 2)
            self.assertEqual(stored.schema["key_events"], pl.Float64)
            self.assertAlmostEqual(stored["key_events"].to_list()[0], 5.0)
            self.assertAlmostEqual(stored["key_events"].to_list()[1], 1.5)


if __name__ == "__main__":
    unittest.main()
