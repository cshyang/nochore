"""Execution policy evaluation."""

from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from src.models import ActionPlan, ExecutionDecision
from .canary import (
    evaluate_budget_cooldown,
    evaluate_budget_delta,
    evaluate_live_canary_scope,
    evaluate_negative_payload,
)

ALLOWED_ACTIONS = {
    "google_ads": {"add_negative_keyword", "adjust_google_ads_budget", "create_keyword_experiment"},
    "meta": {"create_meta_ad_variant", "adjust_meta_budget"},
}


def evaluate_canary_scope_only(action: ActionPlan) -> ExecutionDecision | None:
    """Quick canary scope check before any API calls.

    Returns an ExecutionDecision if blocked, None if approved.
    Only checks action_type and canary scope (client, brand, source, platform).
    Budget delta and cooldown checks require API data and run later.
    """
    allowed = action.action_type in ALLOWED_ACTIONS.get(action.platform, set())
    if not allowed:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="rejected",
            reason=f"Unsupported action type '{action.action_type}' for platform '{action.platform}'",
            checks={"platform": action.platform, "action_type": action.action_type},
        )
    return evaluate_live_canary_scope(action)


def evaluate_action_plan(
    action: ActionPlan,
    *,
    dry_run: bool,
    recent_actions: Optional[Iterable[Dict[str, Any]]] = None,
    current_daily_budget: float | None = None,
) -> ExecutionDecision:
    """Evaluate whether an action is permitted in the current phase."""
    allowed = action.action_type in ALLOWED_ACTIONS.get(action.platform, set())
    if not allowed:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="rejected",
            reason=f"Unsupported action type '{action.action_type}' for platform '{action.platform}'",
            checks={"platform": action.platform, "action_type": action.action_type},
        )

    if not dry_run:
        scope_decision = evaluate_live_canary_scope(action)
        if scope_decision is not None:
            return scope_decision
        if action.action_type == "add_negative_keyword":
            payload_decision = evaluate_negative_payload(action)
            if payload_decision is not None:
                return payload_decision
        if action.action_type == "adjust_google_ads_budget" and current_daily_budget is not None:
            budget_decision = evaluate_budget_delta(
                action,
                current_daily_budget=current_daily_budget,
            )
            if budget_decision is not None:
                return budget_decision
        cooldown_decision = evaluate_budget_cooldown(action, recent_actions=recent_actions)
        if cooldown_decision is not None:
            return cooldown_decision

        return ExecutionDecision(
            action_id=action.action_id,
            decision="approved",
            reason="Approved for live canary execution.",
            checks={"live_canary": True},
        )

    return ExecutionDecision(
        action_id=action.action_id,
        decision="approved",
        reason="Approved for dry-run planning.",
        checks={"dry_run": True},
    )
