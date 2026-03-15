"""Execution policy evaluation."""

from __future__ import annotations

from src.models import ActionPlan, ExecutionDecision

ALLOWED_ACTIONS = {
    "google_ads": {"add_negative_keyword", "increase_campaign_budget", "create_keyword_experiment"},
    "meta": {"create_meta_ad_variant", "adjust_meta_budget"},
}


def evaluate_action_plan(action: ActionPlan, *, dry_run: bool) -> ExecutionDecision:
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
        return ExecutionDecision(
            action_id=action.action_id,
            decision="blocked",
            reason="Live execution adapters are not enabled in this phase.",
            checks={"dry_run_required": True},
            warnings=["Re-run with --dry-run while the platform adapters remain skeleton-only."],
        )

    return ExecutionDecision(
        action_id=action.action_id,
        decision="approved",
        reason="Approved for dry-run planning.",
        checks={"dry_run": True},
    )
