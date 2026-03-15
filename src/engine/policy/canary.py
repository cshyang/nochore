"""Hardcoded canary policy for the first live Google Ads rollout."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, Optional

from src.models import ActionPlan, ExecutionDecision


@dataclass(frozen=True)
class CanaryPolicy:
    """Static canary constraints for Homescape live execution."""

    client_id: str = "last-minute"
    brand: str = "Homescape"
    source_alias: str = "homescape_ads"
    platform: str = "google_ads"
    negative_match_type: str = "EXACT"
    budget_max_delta_pct: float = 15.0
    budget_cooldown_days: int = 7
    allowed_actions: tuple[str, ...] = (
        "add_negative_keyword",
        "adjust_google_ads_budget",
    )


CANARY_POLICY = CanaryPolicy()


def evaluate_live_canary_scope(action: ActionPlan) -> Optional[ExecutionDecision]:
    """Validate that a live action stays within the Homescape canary."""
    if action.client_id != CANARY_POLICY.client_id:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=f"Live execution is limited to client '{CANARY_POLICY.client_id}' in this phase.",
            checks={"client_id": action.client_id},
        )
    if action.brand != CANARY_POLICY.brand:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=f"Live execution is limited to brand '{CANARY_POLICY.brand}' in this phase.",
            checks={"brand": action.brand},
        )
    if action.platform != CANARY_POLICY.platform:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=f"Live execution is limited to platform '{CANARY_POLICY.platform}' in this phase.",
            checks={"platform": action.platform},
        )
    if action.source_alias != CANARY_POLICY.source_alias:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=f"Live execution is limited to source alias '{CANARY_POLICY.source_alias}' in this phase.",
            checks={"source_alias": action.source_alias},
        )
    if action.action_type not in CANARY_POLICY.allowed_actions:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=f"Action '{action.action_type}' is not live-enabled in this phase.",
            checks={"action_type": action.action_type},
        )
    return None


def evaluate_negative_payload(action: ActionPlan) -> Optional[ExecutionDecision]:
    """Validate the negative-keyword payload against canary rules."""
    match_type = str(action.payload.get("match_type", "")).upper()
    if match_type != CANARY_POLICY.negative_match_type:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=f"Live negatives must use {CANARY_POLICY.negative_match_type} match type in this phase.",
            checks={"match_type": match_type},
        )
    return None


def evaluate_budget_delta(
    action: ActionPlan,
    *,
    current_daily_budget: float,
) -> Optional[ExecutionDecision]:
    """Validate the requested budget change against the canary cap."""
    requested_daily_budget = float(action.payload.get("daily_budget", 0.0))
    if current_daily_budget <= 0:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason="Current campaign budget could not be resolved for live validation.",
            checks={"current_daily_budget": current_daily_budget},
        )

    delta_pct = abs((requested_daily_budget - current_daily_budget) / current_daily_budget) * 100
    if delta_pct > CANARY_POLICY.budget_max_delta_pct:
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason=(
                f"Requested budget change exceeds the {CANARY_POLICY.budget_max_delta_pct:.0f}% canary limit."
            ),
            checks={
                "current_daily_budget": current_daily_budget,
                "requested_daily_budget": requested_daily_budget,
                "delta_pct": round(delta_pct, 2),
            },
        )
    return None


def evaluate_budget_cooldown(
    action: ActionPlan,
    *,
    recent_actions: Iterable[Dict[str, Any]] | None = None,
) -> Optional[ExecutionDecision]:
    """Block repeated live budget edits inside the canary cooldown window."""
    if action.action_type != "adjust_google_ads_budget":
        return None

    cutoff = datetime.now(timezone.utc) - timedelta(days=CANARY_POLICY.budget_cooldown_days)
    for row in recent_actions or []:
        if row.get("action_type") != "adjust_google_ads_budget":
            continue
        if row.get("status") != "executed_live":
            continue
        if row.get("target_id") != action.target_id:
            continue
        created_at_raw = row.get("created_at")
        if not created_at_raw:
            continue
        try:
            created_at = datetime.fromisoformat(str(created_at_raw).replace("Z", "+00:00"))
        except ValueError:
            continue
        if created_at >= cutoff:
            return ExecutionDecision(
                action_id=action.action_id,
                decision="blocked",
                reason=(
                    f"Live budget changes are limited to one per campaign per {CANARY_POLICY.budget_cooldown_days} days."
                ),
                checks={
                    "campaign_id": action.target_id,
                    "last_change_at": created_at.isoformat(),
                },
            )
    return None
