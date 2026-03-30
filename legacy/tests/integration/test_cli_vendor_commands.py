"""Integration tests for dry-run vendor mutation commands."""

from __future__ import annotations

import json
from pathlib import Path
import unittest
from unittest.mock import patch

from click.testing import CliRunner

from src.cli.main import cli
from src.tools.memory import MemoryStore


CLIENT_CONFIG = """\
context:
  business: "Vendor command test"
sources:
  google_ads:
    homescape_ads:
      customer_id: "111-111-1111"
  meta:
    home_meta:
      account_id: "act_home"
business:
  brands:
    - name: "Homescape"
      sources:
        - "homescape_ads"
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
                    "last-minute",
                    "--brand",
                    "Homescape",
                    "--source",
                    "homescape_ads",
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
                    "adjust-budget",
                    "last-minute",
                    "--brand",
                    "Homescape",
                    "--source",
                    "homescape_ads",
                    "--campaign",
                    "Homescape Search",
                    "--daily-budget",
                    "100",
                ],
                catch_exceptions=False,
            )
            self.assertEqual(blocked_google.exit_code, 0)
            blocked_payload = json.loads(blocked_google.stdout)
            self.assertEqual(blocked_payload["decision"]["decision"], "approved")

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

    @patch("src.cli.commands.google_ads.record_manual_live_execution")
    @patch("src.cli.commands.google_ads.GoogleAdsMutator")
    @patch("src.cli.commands.google_ads.init_google_ads_client")
    def test_google_ads_live_canary_prompts_and_logs(
        self,
        init_client_mock,
        mutator_cls,
        record_live_mock,
    ) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()

            init_client_mock.return_value = object()
            mutator = mutator_cls.return_value
            mutator.resolve_campaign.return_value = {
                "campaign_id": "123",
                "campaign_name": "Homescape Search",
                "budget_resource_name": "customers/111/campaignBudgets/1",
                "current_daily_budget": 50.0,
                "currency": "SGD",
            }
            mutator.add_negative_keyword.return_value = {
                "pre_mutation_state": {"search_term": "junk query", "match_type": "EXACT"},
                "mutation_result": {"resource_name": "customers/111/campaignCriteria/123~456"},
                "rollback": {"resource_name": "customers/111/campaignCriteria/123~456"},
            }
            mutator.adjust_campaign_budget.return_value = {
                "pre_mutation_state": {
                    "budget_resource_name": "customers/111/campaignBudgets/1",
                    "previous_daily_budget": 50.0,
                },
                "mutation_result": {"resource_name": "customers/111/campaignBudgets/1", "new_daily_budget": 55.0},
                "rollback": {
                    "budget_resource_name": "customers/111/campaignBudgets/1",
                    "previous_daily_budget": 50.0,
                    "new_daily_budget": 55.0,
                },
            }
            record_live_mock.side_effect = lambda *args, **kwargs: {
                "experiment": {"experiment_id": "EXP-MANUAL-1"},
                "action_record": {"status": "executed_live"},
            }

            denied = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "google-ads",
                    "add-negative",
                    "last-minute",
                    "--brand",
                    "Homescape",
                    "--source",
                    "homescape_ads",
                    "--campaign",
                    "Homescape Search",
                    "--search-term",
                    "junk query",
                    "--live",
                ],
                input="n\n",
                catch_exceptions=False,
            )
            self.assertNotEqual(denied.exit_code, 0)
            mutator.add_negative_keyword.assert_not_called()

            allowed = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "google-ads",
                    "adjust-budget",
                    "last-minute",
                    "--brand",
                    "Homescape",
                    "--source",
                    "homescape_ads",
                    "--campaign",
                    "Homescape Search",
                    "--daily-budget",
                    "55",
                    "--live",
                ],
                input="y\n",
                catch_exceptions=False,
            )
            self.assertEqual(allowed.exit_code, 0)
            allowed_payload = json.loads(allowed.stdout)
            self.assertTrue(allowed_payload["live"])
            self.assertEqual(allowed_payload["decision"]["decision"], "approved")
            self.assertEqual(allowed_payload["execution"]["rollback"]["previous_daily_budget"], 50.0)
            record_live_mock.assert_called()

            blocked = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "google-ads",
                    "add-negative",
                    "acme",
                    "--brand",
                    "Homescape",
                    "--source",
                    "shared_google",
                    "--campaign",
                    "Homescape Search",
                    "--search-term",
                    "junk query",
                    "--live",
                ],
                input="y\n",
                catch_exceptions=False,
            )
            self.assertEqual(blocked.exit_code, 0)
            blocked_payload = json.loads(blocked.stdout)
            self.assertEqual(blocked_payload["decision"]["decision"], "blocked")
            self.assertIn("limited to client 'last-minute'", blocked_payload["decision"]["reason"])

    @patch("src.cli.commands.google_ads.record_manual_live_execution")
    @patch("src.cli.commands.google_ads.GoogleAdsMutator")
    @patch("src.cli.commands.google_ads.init_google_ads_client")
    def test_google_ads_live_budget_cooldown_blocks_repeat_actions(
        self,
        init_client_mock,
        mutator_cls,
        record_live_mock,
    ) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()
            MemoryStore().append(
                "last-minute",
                "actions",
                {
                    "record_id": "record-existing",
                    "client_id": "last-minute",
                    "brand": "Homescape",
                    "experiment_id": "EXP-OLD",
                    "action_id": "ACT-OLD",
                    "action_type": "adjust_google_ads_budget",
                    "platform": "google_ads",
                    "source_alias": "homescape_ads",
                    "target_kind": "campaign",
                    "target_id": "123",
                    "status": "executed_live",
                    "created_at": "2026-03-14T00:00:00+00:00",
                    "payload": {},
                },
            )

            init_client_mock.return_value = object()
            mutator = mutator_cls.return_value
            mutator.resolve_campaign.return_value = {
                "campaign_id": "123",
                "campaign_name": "Homescape Search",
                "budget_resource_name": "customers/111/campaignBudgets/1",
                "current_daily_budget": 50.0,
                "currency": "SGD",
            }

            result = self.runner.invoke(
                cli,
                [
                    "--format",
                    "json",
                    "--config",
                    "config",
                    "google-ads",
                    "adjust-budget",
                    "last-minute",
                    "--brand",
                    "Homescape",
                    "--source",
                    "homescape_ads",
                    "--campaign",
                    "Homescape Search",
                    "--daily-budget",
                    "55",
                    "--live",
                ],
                input="y\n",
                catch_exceptions=False,
            )
            self.assertEqual(result.exit_code, 0)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["decision"]["decision"], "blocked")
            mutator.adjust_campaign_budget.assert_not_called()
            record_live_mock.assert_not_called()

    def _write_config(self) -> None:
        config_dir = Path("config/clients")
        config_dir.mkdir(parents=True, exist_ok=True)
        (config_dir / "last-minute.yaml").write_text(CLIENT_CONFIG, encoding="utf-8")
        (config_dir / "acme.yaml").write_text(CLIENT_CONFIG.replace("homescape_ads", "shared_google"), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
