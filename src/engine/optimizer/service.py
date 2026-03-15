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
                source_alias=None,
                target_kind="campaign",
                target_id=item.campaign,
                confidence="high",
                risk_level="low",
                idempotency_key=f"{results.client_id}:{brand or 'client'}:neg:{item.campaign}:{item.search_term}",
                payload={"campaign": item.campaign, "search_term": item.search_term},
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
                action_type="increase_campaign_budget",
                platform="google_ads",
                client_id=results.client_id,
                brand=brand,
                source_alias=None,
                target_kind="campaign",
                target_id=item.campaign,
                confidence="medium",
                risk_level="medium",
                idempotency_key=f"{results.client_id}:{brand or 'client'}:budget:{item.campaign}",
                payload={
                    "campaign": item.campaign,
                    "current_daily": item.current_daily,
                    "recommended_daily": item.recommended_daily,
                },
            )
        )

    has_meta = any(
        row.get("platform") == "meta"
        for row in results.kpi_summary.get("platform_currency_breakdown_current", [])
    )
    if has_meta:
        hypothesis_id = "HYP-META-CREATIVE-1"
        hypotheses.append(
            ExperimentHypothesis(
                hypothesis_id=hypothesis_id,
                client_id=results.client_id,
                brand=brand,
                title="Launch a new Meta creative angle test",
                summary="Meta spend is active; create a new ad variant to test a fresh angle against the current control.",
                confidence="low",
                expected_outcome="Generate a controlled learning loop for Meta creative performance.",
                evidence={"platform": "meta", "reason": "skeleton creative test"},
            )
        )
        actions.append(
            ActionPlan(
                action_id="ACT-META-CREATIVE-1",
                hypothesis_id=hypothesis_id,
                action_type="create_meta_ad_variant",
                platform="meta",
                client_id=results.client_id,
                brand=brand,
                source_alias=None,
                target_kind="adset",
                target_id=None,
                confidence="low",
                risk_level="medium",
                idempotency_key=f"{results.client_id}:{brand or 'client'}:meta:creative-variant",
                payload={
                    "variant_name": f"{brand or results.client_id} Variant A",
                    "message": "Placeholder creative variant generated for dry-run planning.",
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
