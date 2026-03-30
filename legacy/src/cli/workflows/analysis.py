"""Analysis workflow payload builders."""

from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict

from src.models import AnalysisResults

from .common import dataclass_list, scope_payload


def _base_payload(results: AnalysisResults) -> Dict[str, Any]:
    """Shared data package header used by both check and investigate."""
    return {
        **scope_payload(results.client_id, results.brand),
        "context": results.context,
        "period": results.period_current,
        "comparison_period": results.period_previous,
        "currency": results.currency,
        "knowledge": results.knowledge,
        "memory": results.memory_summary,
        "kpi_summary": results.kpi_summary,
    }


def _full_data_section(results: AnalysisResults) -> Dict[str, Any]:
    """All analysis data — no pre-filtering, no counts-only. LLM reasons over this."""
    data: Dict[str, Any] = {
        "search_terms": results.search_term_summary,
        "impression_share": results.impression_share_summary,
        "quality_scores": dataclass_list(results.qs_summaries),
        "qs_changes": dataclass_list(results.qs_changes),
        "qs_distribution": results.qs_distribution,
        "match_type_breakdown": dataclass_list(results.match_type_breakdown),
        "trends": dataclass_list(results.trends),
        "anomalies": dataclass_list(results.anomalies),
        "forecasts": dataclass_list(results.forecasts),
        "composition_shifts": dataclass_list(results.composition_shifts),
    }

    if results.web_quality:
        data["web_quality"] = {
            "summary": results.web_quality.summary,
            "landing_pages": [asdict(p) for p in results.web_quality.top_landing_pages],
            "paid_engagement_gaps": [asdict(p) for p in results.web_quality.paid_engagement_gaps],
        }

    if results.organic_search:
        data["organic_search"] = {
            "summary": results.organic_search.summary,
            "branded_vs_nonbranded": results.organic_search.branded_vs_nonbranded,
            "top_queries": [asdict(q) for q in results.organic_search.top_queries],
            "ctr_opportunities": [asdict(o) for o in results.organic_search.ctr_opportunities],
            "demand_trends": [asdict(t) for t in results.organic_search.demand_trends],
        }

    return data


def build_check_payload(results: AnalysisResults) -> Dict[str, Any]:
    """Build the full data package for health check — all data, no filtering."""
    return {
        **_base_payload(results),
        **_full_data_section(results),
    }


def build_investigation_payload(results: AnalysisResults, metric: str) -> Dict[str, Any]:
    """Build the full data package for investigation — same data, metric noted."""
    return {
        **_base_payload(results),
        "metric": metric,
        **_full_data_section(results),
    }
