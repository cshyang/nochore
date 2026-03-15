"""Analysis workflow payload builders."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from src.models import AnalysisResults

from .common import dataclass_list, scope_payload


def build_check_payload(results: AnalysisResults) -> Dict[str, Any]:
    """Build the check summary payload."""
    summary = {
        **scope_payload(results.client_id, results.brand),
        "context": results.context,
        "period": results.period_current,
        "comparison_period": results.period_previous,
        "currency": results.currency,
        "kpi_summary": results.kpi_summary,
        "alerts": {
            "negative_keyword_candidates": len(results.negative_keywords),
            "low_quality_score_alerts": len(results.low_qs_alerts),
            "anomalies_detected": len(results.anomalies),
            "impression_share_opportunities": len(results.lost_impression_share),
            "budget_recommendations": len(results.budget_recommendations),
        },
    }

    if results.web_quality:
        summary["web_quality"] = {
            "summary": results.web_quality.summary,
            "low_engagement_page_count": len(results.web_quality.low_engagement_pages),
            "low_key_event_page_count": len(results.web_quality.low_key_event_pages),
            "paid_engagement_gap_count": len(results.web_quality.paid_engagement_gaps),
            "top_landing_pages": [asdict(p) for p in results.web_quality.top_landing_pages[:10]],
        }

    if results.organic_search:
        summary["organic_search"] = {
            "summary": results.organic_search.summary,
            "branded_vs_nonbranded": results.organic_search.branded_vs_nonbranded,
            "ctr_opportunity_count": len(results.organic_search.ctr_opportunities),
            "rising_queries": len(
                [t for t in results.organic_search.demand_trends if t.direction == "rising"]
            ),
            "falling_queries": len(
                [t for t in results.organic_search.demand_trends if t.direction == "falling"]
            ),
            "top_queries": [asdict(q) for q in results.organic_search.top_queries[:10]],
        }

    return summary


def build_investigation_payload(results: AnalysisResults, metric: str) -> Dict[str, Any]:
    """Build an investigation payload focused on one metric."""
    payload: Dict[str, Any] = {
        **scope_payload(results.client_id, results.brand),
        "context": results.context,
        "metric": metric,
        "period": results.period_current,
        "comparison_period": results.period_previous,
        "currency": results.currency,
        "kpi_summary": results.kpi_summary,
    }

    if metric == "cpl":
        payload["related_data"] = {
            "budget_recommendations": dataclass_list(results.budget_recommendations),
            "impression_share_opportunities": dataclass_list(results.lost_impression_share),
        }
        if results.web_quality:
            payload["related_data"]["paid_engagement_gaps"] = [
                asdict(p) for p in results.web_quality.paid_engagement_gaps
            ]
    elif metric == "cvr":
        payload["related_data"] = {
            "quality_score_alerts": dataclass_list(results.low_qs_alerts),
            "quality_score_changes": dataclass_list(results.qs_changes),
            "negative_keyword_candidates": dataclass_list(results.negative_keywords[:20]),
        }
        if results.web_quality:
            payload["related_data"]["web_quality"] = {
                "low_engagement_pages": [
                    asdict(p) for p in results.web_quality.low_engagement_pages
                ],
                "paid_engagement_gaps": [
                    asdict(p) for p in results.web_quality.paid_engagement_gaps
                ],
            }
    elif metric == "volume":
        payload["related_data"] = {
            "trends": dataclass_list(results.trends),
            "anomalies": dataclass_list(results.anomalies),
            "forecasts": dataclass_list(results.forecasts),
            "impression_share_opportunities": dataclass_list(results.lost_impression_share),
        }

    return payload
