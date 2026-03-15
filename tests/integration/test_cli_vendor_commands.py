"""Integration tests for dry-run vendor mutation commands."""

from __future__ import annotations

import json
from pathlib import Path
import unittest

from click.testing import CliRunner

from src.cli.main import cli


CLIENT_CONFIG = """\
context:
  business: "Vendor command test"
sources:
  google_ads:
    shared_google:
      customer_id: "111-111-1111"
  meta:
    home_meta:
      account_id: "act_home"
business:
  brands:
    - name: "Homescape"
      sources:
        - "shared_google"
        - "home_meta"
"""


class CliVendorCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runner = CliRunner()

    def test_google_ads_and_meta_dry_run_commands(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()

            google_result = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "google-ads",
                    "add-negative",
                    "acme",
                    "--source",
                    "shared_google",
                    "--campaign",
                    "Homescape Search",
                    "--search-term",
                    "junk query",
                    "--dry-run",
                ],
                catch_exceptions=False,
            )
            self.assertEqual(google_result.exit_code, 0)
            google_payload = json.loads(google_result.stdout)
            self.assertEqual(google_payload["decision"]["decision"], "approved")

            blocked_google = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "google-ads",
                    "increase-budget",
                    "acme",
                    "--source",
                    "shared_google",
                    "--campaign",
                    "Homescape Search",
                    "--daily-budget",
                    "100",
                ],
                catch_exceptions=False,
            )
            self.assertEqual(blocked_google.exit_code, 0)
            blocked_payload = json.loads(blocked_google.stdout)
            self.assertEqual(blocked_payload["decision"]["decision"], "blocked")

            meta_result = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "meta",
                    "create-variant",
                    "acme",
                    "--source",
                    "home_meta",
                    "--adset-id",
                    "adset-1",
                    "--name",
                    "Variant A",
                    "--message",
                    "Test message",
                    "--dry-run",
                ],
                catch_exceptions=False,
            )
            self.assertEqual(meta_result.exit_code, 0)
            meta_payload = json.loads(meta_result.stdout)
            self.assertEqual(meta_payload["decision"]["decision"], "approved")

    def _write_config(self) -> None:
        config_dir = Path("config/clients")
        config_dir.mkdir(parents=True, exist_ok=True)
        (config_dir / "acme.yaml").write_text(CLIENT_CONFIG, encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
