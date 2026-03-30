"""Integration tests for grouped analysis/report commands."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
import unittest

from click.testing import CliRunner

from src.cli.main import cli
from src.models import PerformanceRecord, Platform
from src.storage import StorageManager


CLIENT_CONFIG = """\
context:
  business: "Multi-brand services company"
sources:
  google_ads:
    shared_google:
      customer_id: "111-111-1111"
  meta:
    home_meta:
      account_id: "act_home"
    tint_meta:
      account_id: "act_tint"
business:
  brands:
    - name: "Homescape"
      context:
        objective: "leads"
      sources:
        - "shared_google"
        - "home_meta"
      default_theme: "Always On"
      filters:
        shared_google:
          campaign_name_regex: "(?i)home"
    - name: "Tint n' Wrap"
      context:
        objective: "leads"
      sources:
        - "shared_google"
        - "tint_meta"
      filters:
        shared_google:
          campaign_name_regex: "(?i)tint"
"""


class CliBrandCommandsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runner = CliRunner()

    def test_analyze_run_json_is_parseable_and_scoped(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()
            self._seed_campaign_data()

            result = self._invoke(
                ["--format", "json", "--config", "config", "analyze", "run", "acme", "--brand", "homescape", "--month", "2026-01"]
            )

            self.assertEqual(result.exit_code, 0)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["scope"], "brand")
            self.assertEqual(payload["brand"], "Homescape")
            self.assertEqual(payload["kpi_summary"]["leads_primary_current"], 15.0)
            self.assertNotIn("Phase 2", result.stdout)
            self.assertIn("Phase 2", result.stderr)

    def test_analyze_check_and_investigate_include_brand_scope_metadata(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()
            self._seed_campaign_data()

            check_result = self._invoke(
                ["--format", "json", "--config", "config", "analyze", "check", "acme", "--brand", "Tint n' Wrap", "--month", "2026-01"]
            )
            investigate_result = self._invoke(
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "analyze",
                    "investigate",
                    "acme",
                    "--brand",
                    "Tint n' Wrap",
                    "--metric",
                    "cpl",
                    "--month",
                    "2026-01",
                ]
            )

            self.assertEqual(check_result.exit_code, 0)
            self.assertEqual(investigate_result.exit_code, 0)

            check_payload = json.loads(check_result.stdout)
            investigate_payload = json.loads(investigate_result.stdout)
            self.assertEqual(check_payload["scope"], "brand")
            self.assertEqual(check_payload["brand"], "Tint n' Wrap")
            self.assertEqual(check_payload["kpi_summary"]["leads_primary_current"], 4.0)
            self.assertEqual(investigate_payload["scope"], "brand")
            self.assertEqual(investigate_payload["brand"], "Tint n' Wrap")

    def test_report_generate_brand_writes_brand_specific_files(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()
            self._seed_campaign_data()

            result = self._invoke(
                ["--format", "json", "--config", "config", "report", "generate", "acme", "--brand", "homescape", "--month", "2026-01"]
            )

            self.assertEqual(result.exit_code, 0)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["scope"], "brand")
            self.assertEqual(payload["brand"], "Homescape")

            internal_path = Path(payload["internal_report"])
            summary_path = Path(payload["client_summary"])
            self.assertTrue(internal_path.exists())
            self.assertTrue(summary_path.exists())
            self.assertEqual(internal_path.name, "acme_homescape_2026-01.md")
            self.assertEqual(summary_path.name, "acme_homescape_2026-01_summary.md")
            self.assertIn("**Brand:** Homescape", internal_path.read_text(encoding="utf-8"))
            self.assertIn("**Brand:** Homescape", summary_path.read_text(encoding="utf-8"))

    def test_analyze_brands_and_tools_manifest_use_new_surface(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()

            brands_result = self._invoke(
                ["--format", "json", "--config", "config", "analyze", "brands", "acme"]
            )
            tools_result = self._invoke(
                ["--format", "json", "--config", "config", "tools"]
            )

            self.assertEqual(brands_result.exit_code, 0)
            self.assertEqual(tools_result.exit_code, 0)

            brands_payload = json.loads(brands_result.stdout)
            tools_payload = json.loads(tools_result.stdout)["groups"]

            self.assertEqual(
                [row["brand"] for row in brands_payload],
                ["Homescape", "Tint n' Wrap"],
            )
            self.assertTrue(any(group["name"] == "analyze" for group in tools_payload))
            self.assertTrue(any(group["name"] == "optimize" for group in tools_payload))

    def test_old_top_level_commands_are_unknown(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()

            for argv in (
                ["--format", "json", "--config", "config", "analyze", "acme"],
                ["--format", "json", "--config", "config", "check", "acme"],
                ["--format", "json", "--config", "config", "report", "acme"],
                ["--format", "json", "--config", "config", "fetch", "acme"],
                ["--format", "json", "--config", "config", "brands", "list", "acme"],
            ):
                result = self._invoke(argv)
                self.assertNotEqual(result.exit_code, 0)

    def _write_config(self) -> None:
        config_dir = Path("config/clients")
        config_dir.mkdir(parents=True, exist_ok=True)
        (Path("config") / "clients" / "acme.yaml").write_text(CLIENT_CONFIG, encoding="utf-8")

    def _seed_campaign_data(self) -> None:
        storage = StorageManager()
        records = [
            PerformanceRecord(
                client_id="acme",
                platform=Platform.GOOGLE_ADS,
                source_alias="shared_google",
                source_account_id="1111111111",
                date=date(2026, 1, 5),
                campaign_id="g-home",
                campaign_name="Homescape Search",
                spend=120.0,
                impressions=1000,
                clicks=100,
                conversions_primary=10.0,
                currency="MYR",
            ),
            PerformanceRecord(
                client_id="acme",
                platform=Platform.META,
                source_alias="home_meta",
                source_account_id="act_home",
                date=date(2026, 1, 6),
                campaign_id="m-home",
                campaign_name="Homescape Leads",
                spend=80.0,
                impressions=800,
                clicks=80,
                conversions_primary=5.0,
                currency="MYR",
            ),
            PerformanceRecord(
                client_id="acme",
                platform=Platform.META,
                source_alias="tint_meta",
                source_account_id="act_tint",
                date=date(2026, 1, 6),
                campaign_id="m-tint",
                campaign_name="Tint Leads",
                spend=40.0,
                impressions=300,
                clicks=30,
                conversions_primary=4.0,
                currency="MYR",
            ),
        ]
        storage.append("acme", "campaigns", records)

    def _invoke(self, args):
        return self.runner.invoke(cli, args, catch_exceptions=False)


if __name__ == "__main__":
    unittest.main()
