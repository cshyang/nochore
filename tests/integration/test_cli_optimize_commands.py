"""Integration tests for optimize and memory commands."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
import unittest

from click.testing import CliRunner

from src.cli.main import cli
from src.models import (
    ImpressionShareRecord,
    OutcomeRecord,
    PerformanceRecord,
    Platform,
    SearchTermRecord,
)
from src.storage import StorageManager
from src.tools.memory import MemoryStore


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
business:
  brands:
    - name: "Homescape"
      sources:
        - "shared_google"
        - "home_meta"
      filters:
        shared_google:
          campaign_name_regex: "(?i)home"
"""


class CliOptimizeCommandsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.runner = CliRunner()

    def test_optimize_plan_run_review_and_learn(self) -> None:
        with self.runner.isolated_filesystem():
            self._write_config()
            self._seed_campaign_data()

            plan_result = self._invoke(
                ["--format", "json", "--config", "config", "optimize", "plan", "acme", "--brand", "Homescape", "--month", "2026-01"]
            )
            self.assertEqual(plan_result.exit_code, 0)
            plan_payload = json.loads(plan_result.stdout)
            self.assertEqual(plan_payload["scope"], "brand")
            self.assertGreaterEqual(len(plan_payload["hypotheses"]), 1)
            self.assertGreaterEqual(len(plan_payload["actions"]), 1)
            self.assertEqual(
                {row["action_type"] for row in plan_payload["actions"]},
                {"add_negative_keyword", "adjust_google_ads_budget"},
            )

            run_result = self._invoke(
                ["--format", "json", "--config", "config", "optimize", "run", "acme", "--brand", "Homescape", "--month", "2026-01", "--dry-run"]
            )
            self.assertEqual(run_result.exit_code, 0)
            run_payload = json.loads(run_result.stdout)
            self.assertEqual(run_payload["status"], "complete")
            self.assertTrue(run_payload["dry_run"])
            experiment_id = run_payload["experiments"][0]["experiment_id"]

            review_result = self._invoke(
                ["--format", "json", "--config", "config", "optimize", "review", experiment_id]
            )
            self.assertEqual(review_result.exit_code, 0)
            review_payload = json.loads(review_result.stdout)
            self.assertEqual(review_payload["status"], "pending_outcomes")

            learn_result = self._invoke(
                ["--format", "json", "--config", "config", "optimize", "learn", experiment_id]
            )
            self.assertEqual(learn_result.exit_code, 0)
            learn_payload = json.loads(learn_result.stdout)
            self.assertEqual(learn_payload["status"], "pending_outcomes")

            MemoryStore().append(
                "acme",
                "outcomes",
                OutcomeRecord(
                    record_id="record-out-1",
                    client_id="acme",
                    brand="Homescape",
                    experiment_id=experiment_id,
                    outcome_id="OUT-1",
                    measured_at="2026-03-21T00:00:00Z",
                    status="win",
                ),
            )
            learn_result = self._invoke(
                ["--format", "json", "--config", "config", "optimize", "learn", experiment_id]
            )
            self.assertEqual(learn_result.exit_code, 0)
            learn_payload = json.loads(learn_result.stdout)
            self.assertEqual(learn_payload["status"], "complete")

            summary_result = self._invoke(
                ["--format", "json", "--config", "config", "memory", "summarize", "acme", "--brand", "Homescape"]
            )
            self.assertEqual(summary_result.exit_code, 0)
            summary_payload = json.loads(summary_result.stdout)
            self.assertTrue(Path(summary_payload["summary_path"]).exists())

    def _write_config(self) -> None:
        config_dir = Path("config/clients")
        config_dir.mkdir(parents=True, exist_ok=True)
        (config_dir / "acme.yaml").write_text(CLIENT_CONFIG, encoding="utf-8")

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
        ]
        storage.append("acme", "campaigns", records)
        storage.append(
            "acme",
            "search_terms",
            [
                SearchTermRecord(
                    client_id="acme",
                    source_alias="shared_google",
                    source_account_id="1111111111",
                    date=date(2026, 1, 5),
                    campaign_id="g-home",
                    campaign_name="Homescape Search",
                    ad_group_id="ag-1",
                    ad_group_name="Core",
                    search_term="cheap renovation ideas",
                    match_type="BROAD",
                    impressions=500,
                    clicks=60,
                    cost=120.0,
                    conversions=0.0,
                    currency="MYR",
                ),
            ],
        )
        storage.append(
            "acme",
            "impression_share",
            [
                ImpressionShareRecord(
                    client_id="acme",
                    source_alias="shared_google",
                    source_account_id="1111111111",
                    date=date(2026, 1, 5),
                    campaign_id="g-home",
                    campaign_name="Homescape Search",
                    impression_share=0.35,
                    search_budget_lost_is=0.40,
                    search_rank_lost_is=0.10,
                    absolute_top_is=0.15,
                ),
            ],
        )

    def _invoke(self, args):
        return self.runner.invoke(cli, args, catch_exceptions=False)


if __name__ == "__main__":
    unittest.main()
