"""Optimization planning engine."""

from __future__ import annotations

from typing import Any, Dict, List

from src.models import ActionPlan, AnalysisResults, ExperimentHypothesis


def build_optimization_plan(results: AnalysisResults, memory_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build a deterministic optimization plan from analysis results and memory."""
    hypotheses: List[ExperimentHypothesis] = []
    actions: List[ActionPlan] = []
    brand = results.brand
    memory_count = len(memory_rows)

    for index, item in enumerate(results.negative_keywords[:5], start=1):
        hypothesis_id = f"HYP-GADS-NEG-{index}"
        hypotheses.append(
            ExperimentHypothesis(
                hypothesis_id=hypothesis_id,
                client_id=results.client_id,
                brand=brand,
                title=f"Block wasteful query: {item.search_term}",
                summary=f"Search term '{item.search_term}' spent {item.spend:.2f} {item.currency} with weak efficiency.",
                confidence="high",
                expected_outcome="Reduce wasted Google Ads spend and improve query quality.",
                evidence={"negative_keyword": item.search_term, "memory_rows_considered": memory_count},
            )
        )
        actions.append(
            ActionPlan(
                action_id=f"ACT-GADS-NEG-{index}",
                hypothesis_id=hypothesis_id,
                action_type="add_negative_keyword",
                platform="google_ads",
                client_id=results.client_id,
                brand=brand,
                source_alias=item.source_alias or None,
                target_kind="campaign",
                target_id=item.campaign_id or item.campaign,
                confidence="high",
                risk_level="low",
                idempotency_key=(
                    f"{results.client_id}:{brand or 'client'}:"
                    f"{item.source_alias or 'google_ads'}:neg:{item.campaign_id or item.campaign}:{item.search_term}"
                ),
                payload={
                    "campaign_id": item.campaign_id,
                    "campaign_name": item.campaign,
                    "ad_group_id": item.ad_group_id,
                    "ad_group_name": item.ad_group,
                    "search_term": item.search_term,
                    "match_type": item.match_type,
                },
            )
        )

    for index, item in enumerate(results.budget_recommendations[:3], start=1):
        hypothesis_id = f"HYP-GADS-BUD-{index}"
        hypotheses.append(
            ExperimentHypothesis(
                hypothesis_id=hypothesis_id,
                client_id=results.client_id,
                brand=brand,
                title=f"Expand budget on constrained campaign: {item.campaign}",
                summary=f"Campaign is losing impression share and may benefit from controlled budget expansion.",
                confidence="medium",
                expected_outcome="Recover impression share on a constrained campaign while monitoring CPL.",
                evidence={"campaign": item.campaign, "expected_is_gain": item.expected_is_gain},
            )
        )
        actions.append(
            ActionPlan(
                action_id=f"ACT-GADS-BUD-{index}",
                hypothesis_id=hypothesis_id,
                action_type="adjust_google_ads_budget",
                platform="google_ads",
                client_id=results.client_id,
                brand=brand,
                source_alias=item.source_alias or None,
                target_kind="campaign",
                target_id=item.campaign_id or item.campaign,
                confidence="medium",
                risk_level="medium",
                idempotency_key=(
                    f"{results.client_id}:{brand or 'client'}:"
                    f"{item.source_alias or 'google_ads'}:budget:{item.campaign_id or item.campaign}"
                ),
                payload={
                    "campaign_id": item.campaign_id,
                    "campaign_name": item.campaign,
                    "current_daily": item.current_daily,
                    "recommended_daily": item.recommended_daily,
                    "recommended_delta_pct": item.recommended_delta_pct,
                },
            )
        )

    return {
        "client_id": results.client_id,
        "scope": results.scope,
        "brand": results.brand,
        "period": results.period_current,
        "memory_rows_considered": memory_count,
        "hypotheses": hypotheses,
        "actions": actions,
    }
