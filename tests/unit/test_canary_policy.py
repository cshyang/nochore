"""Unit tests for the Homescape live canary policy."""

from __future__ import annotations

import unittest

from src.engine.policy import evaluate_action_plan, evaluate_canary_scope_only
from src.models import ActionPlan


class CanaryPolicyTests(unittest.TestCase):
    def _budget_action(self, *, client_id="last-minute", brand="Homescape", source_alias="homescape_ads") -> ActionPlan:
        return ActionPlan(
            action_id="ACT-BUDGET",
            hypothesis_id="HYP-1",
            action_type="adjust_google_ads_budget",
            platform="google_ads",
            client_id=client_id,
            brand=brand,
            source_alias=source_alias,
            target_kind="campaign",
            target_id="123",
            confidence="manual",
            risk_level="medium",
            idempotency_key="idemp-budget",
            payload={"daily_budget": 60.0},
        )

    def test_dry_run_stays_approved(self) -> None:
        decision = evaluate_action_plan(self._budget_action(), dry_run=True)
        self.assertEqual(decision.decision, "approved")

    def test_live_scope_blocks_non_canary_client(self) -> None:
        decision = evaluate_action_plan(
            self._budget_action(client_id="nota"),
            dry_run=False,
        )
        self.assertEqual(decision.decision, "blocked")

    def test_live_budget_delta_blocks_outside_cap(self) -> None:
        decision = evaluate_action_plan(
            self._budget_action(),
            dry_run=False,
            current_daily_budget=50.0,
        )
        self.assertEqual(decision.decision, "blocked")

    def test_live_budget_cooldown_blocks_repeat_change(self) -> None:
        decision = evaluate_action_plan(
            ActionPlan(
                action_id="ACT-BUDGET",
                hypothesis_id="HYP-1",
                action_type="adjust_google_ads_budget",
                platform="google_ads",
                client_id="last-minute",
                brand="Homescape",
                source_alias="homescape_ads",
                target_kind="campaign",
                target_id="123",
                confidence="manual",
                risk_level="medium",
                idempotency_key="idemp-budget",
                payload={"daily_budget": 55.0},
            ),
            dry_run=False,
            current_daily_budget=50.0,
            recent_actions=[
                {
                    "action_type": "adjust_google_ads_budget",
                    "status": "executed_live",
                    "target_id": "123",
                    "created_at": "2099-03-14T00:00:00+00:00",
                }
            ],
        )
        self.assertEqual(decision.decision, "blocked")

    def test_live_negative_requires_exact_match(self) -> None:
        decision = evaluate_action_plan(
            ActionPlan(
                action_id="ACT-NEG",
                hypothesis_id="HYP-1",
                action_type="add_negative_keyword",
                platform="google_ads",
                client_id="last-minute",
                brand="Homescape",
                source_alias="homescape_ads",
                target_kind="campaign",
                target_id="123",
                confidence="manual",
                risk_level="low",
                idempotency_key="idemp-neg",
                payload={"search_term": "junk", "match_type": "PHRASE"},
            ),
            dry_run=False,
        )
        self.assertEqual(decision.decision, "blocked")


class CanaryScopeOnlyTests(unittest.TestCase):
    """Tests for the pre-API scope check (evaluate_canary_scope_only)."""

    def _canary_action(self, **overrides) -> ActionPlan:
        defaults = dict(
            action_id="ACT-SCOPE",
            hypothesis_id="HYP-1",
            action_type="add_negative_keyword",
            platform="google_ads",
            client_id="last-minute",
            brand="Homescape",
            source_alias="homescape_ads",
            target_kind="campaign",
            target_id="test-campaign",
            confidence="manual",
            risk_level="low",
            idempotency_key="idemp-scope",
            payload={"search_term": "junk", "match_type": "EXACT"},
        )
        defaults.update(overrides)
        return ActionPlan(**defaults)

    def test_scope_approves_canary_client(self) -> None:
        result = evaluate_canary_scope_only(self._canary_action())
        self.assertIsNone(result)

    def test_scope_blocks_non_canary_client(self) -> None:
        result = evaluate_canary_scope_only(self._canary_action(client_id="nota"))
        self.assertIsNotNone(result)
        self.assertEqual(result.decision, "blocked")
        self.assertIn("last-minute", result.reason)

    def test_scope_blocks_wrong_brand(self) -> None:
        result = evaluate_canary_scope_only(self._canary_action(brand="OtherBrand"))
        self.assertIsNotNone(result)
        self.assertEqual(result.decision, "blocked")

    def test_scope_blocks_wrong_source(self) -> None:
        result = evaluate_canary_scope_only(self._canary_action(source_alias="other_ads"))
        self.assertIsNotNone(result)
        self.assertEqual(result.decision, "blocked")

    def test_scope_rejects_unsupported_action_type(self) -> None:
        result = evaluate_canary_scope_only(self._canary_action(action_type="delete_campaign"))
        self.assertIsNotNone(result)
        self.assertEqual(result.decision, "rejected")


if __name__ == "__main__":
    unittest.main()
