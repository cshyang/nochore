"""Report generation services."""

from __future__ import annotations

from datetime import date
from typing import Any, Dict, Optional, Tuple

from rich.console import Console

from src.models import AnalysisResults, BusinessConfig
from src.reporting import (
    ClientSummaryGenerator,
    InternalReportGenerator,
    build_client_summary_report,
    filter_to_brand,
    normalize_campaigns,
)
from src.storage import StorageManager

console = Console(stderr=True)


def generate_reports(
    results: AnalysisResults,
    business_config: BusinessConfig,
    current_start: date,
    current_end: date,
    storage: StorageManager,
    internal_report_generator: InternalReportGenerator,
    client_summary_generator: ClientSummaryGenerator,
    report_type: str = "all",
) -> Tuple[Optional[str], Optional[str]]:
    """Generate markdown reports from analysis results."""
    console.print("\n[yellow]Phase 3: Generating markdown report...[/yellow]")

    client_id = results.client_id
    report_path = (
        internal_report_generator.generate_report(
            client_id=client_id,
            period=current_end.strftime("%Y-%m"),
            kpi_summary=results.kpi_summary,
            neg_keywords=results.negative_keywords,
            top_search_terms=results.top_search_terms,
            match_type_breakdown=results.match_type_breakdown,
            lost_is=results.lost_impression_share,
            budget_recs=results.budget_recommendations,
            qs_changes=results.qs_changes,
            low_qs_alerts=results.low_qs_alerts,
            qs_distribution=results.qs_distribution,
            trends=results.trends,
            anomalies=results.anomalies,
            forecast=results.forecasts,
            brand=results.brand,
        )
        if report_type in {"all", "internal"}
        else None
    )

    raw_campaigns_current = storage.read(client_id, "campaigns", current_start, current_end)
    conversion_actions_current = storage.read(
        client_id, "conversion_actions", current_start, current_end
    )
    if results.brand:
        _, raw_campaigns_current = filter_to_brand(raw_campaigns_current, business_config, results.brand)
        _, conversion_actions_current = filter_to_brand(
            conversion_actions_current,
            business_config,
            results.brand,
            default_platform="google_ads",
        )
    campaigns_current, lead_corrections = normalize_campaigns(
        raw_campaigns_current,
        conversion_actions_current,
        business_config,
    )

    client_summary_path = None
    if report_type in {"all", "summary"}:
        client_summary_report = build_client_summary_report(
            client_id=client_id,
            current_df=campaigns_current,
            business_config=business_config,
            period_start=current_start.isoformat(),
            period_end=current_end.isoformat(),
            brand=results.brand,
            lead_corrections=lead_corrections,
        )
        client_summary_path = client_summary_generator.generate_report(client_summary_report)

    if report_path:
        console.print(f"\n[bold green]Internal report generated: {report_path}[/bold green]")
    if client_summary_path:
        console.print(f"[bold green]Client summary generated: {client_summary_path}[/bold green]")
    if report_path or client_summary_path:
        console.print()

    return report_path, client_summary_path


def build_brief_payload(
    results: AnalysisResults,
    internal_report: Optional[str],
    client_summary: Optional[str],
) -> Dict[str, Any]:
    """Return the standard brief payload."""
    return {
        "client_id": results.client_id,
        "scope": results.scope,
        "brand": results.brand,
        "period": results.period_current,
        "internal_report": internal_report,
        "client_summary": client_summary,
        "status": "complete",
    }
