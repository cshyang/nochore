"""Unit tests for the Google Ads live mutation adapter."""

from __future__ import annotations

from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock

from src.integrations.google_ads import GoogleAdsMutator


class GoogleAdsMutatorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = MagicMock()
        self.ga_service = MagicMock()
        self.campaign_service = MagicMock()
        self.campaign_criterion_service = MagicMock()
        self.campaign_budget_service = MagicMock()
        self.client.get_service.side_effect = lambda name: {
            "GoogleAdsService": self.ga_service,
            "CampaignService": self.campaign_service,
            "CampaignCriterionService": self.campaign_criterion_service,
            "CampaignBudgetService": self.campaign_budget_service,
        }[name]
        self.client.enums.KeywordMatchTypeEnum.EXACT = "EXACT"
        self.campaign_service.campaign_path.return_value = "customers/111/campaigns/123"
        self.mutator = GoogleAdsMutator(self.client, "homescape_ads", "111-111-1111")

    def test_add_negative_keyword_returns_rollback_identifiers(self) -> None:
        self.ga_service.search.return_value = [
            SimpleNamespace(
                campaign=SimpleNamespace(
                    id=123,
                    name="Homescape Search",
                    campaign_budget="customers/111/campaignBudgets/9",
                ),
                campaign_budget=SimpleNamespace(amount_micros=50_000_000),
                customer=SimpleNamespace(currency_code="SGD"),
            )
        ]
        criterion_create = SimpleNamespace(
            campaign="",
            negative=False,
            keyword=SimpleNamespace(text="", match_type=None),
        )
        self.client.get_type.side_effect = lambda name: {
            "CampaignCriterionOperation": SimpleNamespace(create=criterion_create),
        }[name]
        self.campaign_criterion_service.mutate_campaign_criteria.return_value = SimpleNamespace(
            results=[SimpleNamespace(resource_name="customers/111/campaignCriteria/123~456")]
        )

        payload = self.mutator.add_negative_keyword("123", "junk query")

        self.assertEqual(payload["mutation_result"]["criterion_id"], "456")
        self.assertEqual(payload["rollback"]["resource_name"], "customers/111/campaignCriteria/123~456")
        self.assertEqual(criterion_create.keyword.text, "junk query")
        self.assertEqual(criterion_create.keyword.match_type, "EXACT")
        self.assertTrue(criterion_create.negative)

    def test_adjust_campaign_budget_returns_previous_and_new_values(self) -> None:
        self.ga_service.search.return_value = [
            SimpleNamespace(
                campaign=SimpleNamespace(
                    id=123,
                    name="Homescape Search",
                    campaign_budget="customers/111/campaignBudgets/9",
                ),
                campaign_budget=SimpleNamespace(amount_micros=50_000_000),
                customer=SimpleNamespace(currency_code="SGD"),
            )
        ]
        budget_update = SimpleNamespace(resource_name="", amount_micros=0)
        update_mask = SimpleNamespace(paths=[])
        self.client.get_type.side_effect = lambda name: {
            "CampaignBudgetOperation": SimpleNamespace(update=budget_update, update_mask=update_mask),
        }[name]
        self.campaign_budget_service.mutate_campaign_budgets.return_value = SimpleNamespace(
            results=[SimpleNamespace(resource_name="customers/111/campaignBudgets/9")]
        )

        payload = self.mutator.adjust_campaign_budget("123", 55.0)

        self.assertEqual(payload["pre_mutation_state"]["previous_daily_budget"], 50.0)
        self.assertEqual(payload["mutation_result"]["new_daily_budget"], 55.0)
        self.assertEqual(payload["rollback"]["previous_daily_budget"], 50.0)
        self.assertEqual(update_mask.paths, ["amount_micros"])
        self.assertEqual(budget_update.amount_micros, 55_000_000)


if __name__ == "__main__":
    unittest.main()
