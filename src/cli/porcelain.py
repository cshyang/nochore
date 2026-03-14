"""Porcelain commands: ``check``, ``investigate``, ``brief``.

High-level workflow shortcuts that chain plumbing operations together.
"""

from __future__ import annotations

from pathlib import Path

import click

from .brand_support import resolve_brand_name, scope_payload
from .context import resolve_client_id
from .plumbing import resolve_dates


def _read_knowledge(client_id: str) -> str | None:
    """Read the knowledge file for a client, if it exists."""
    knowledge_file = Path("data") / client_id / "knowledge.md"
    try:
        return knowledge_file.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--brand", default=None, help="Filter health checks to a single configured brand.")
@click.option("--no-fetch", is_flag=True, help="Skip fetching, use cached data only.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def check(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    no_fetch: bool,
    month: str | None,
    days: int | None,
) -> None:
    """Quick health dashboard -- fetches data, runs all analyzers, shows alerts.

    Equivalent to running ``fetch`` then ``analyze`` in sequence, with
    a summary view highlighting any KPI alerts.
    """
    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.output import output_data
    from src.pipeline import analyze_client, fetch_client
    from src.storage import StorageManager

    fmt = ctx.obj["format"]
    cid = resolve_client_id(client_id)
    is_monthly, start, end = resolve_dates(month, days)

    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    client_config = cm.get_client_config(cid)
    if not client_config:
        raise click.UsageError(f"Client '{cid}' not found in config.")

    business_config = cm.get_business_config(cid)
    client_context = cm.get_client_context(cid)
    storage = StorageManager()
    cred = CredentialManager()
    selected_brand = resolve_brand_name(business_config, brand)

    # Phase 1: fetch (unless --no-fetch)
    if not no_fetch:
        if not ctx.obj["quiet"]:
            click.echo(f"Fetching data for {cid}...", err=True)
        fetch_client(
            client_id=cid,
            business_config=business_config,
            start_date=start,
            end_date=end,
            storage=storage,
            cred_manager=cred,
        )

    # Phase 2: analyze
    if not ctx.obj["quiet"]:
        click.echo(f"Analyzing {cid}...", err=True)
    results = analyze_client(
        client_id=cid,
        business_config=business_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
        context=client_context,
        brand=selected_brand,
    )

    if results is None:
        output_data(
            {**scope_payload(cid, selected_brand), "status": "no_data", "message": "No data available."},
            fmt,
            title="Health Check",
        )
        return

    # Build a compact health summary
    knowledge = _read_knowledge(cid)
    summary = {
        **scope_payload(cid, selected_brand),
        "context": results.context,
        "knowledge": knowledge,
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
        from dataclasses import asdict

        summary["web_quality"] = {
            "summary": results.web_quality.summary,
            "low_engagement_page_count": len(results.web_quality.low_engagement_pages),
            "low_key_event_page_count": len(results.web_quality.low_key_event_pages),
            "paid_engagement_gap_count": len(results.web_quality.paid_engagement_gaps),
            "top_landing_pages": [
                asdict(p) for p in results.web_quality.top_landing_pages[:10]
            ],
        }

    output_data(summary, fmt, title=f"Health Check: {cid}")


# ---------------------------------------------------------------------------
# investigate
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--brand", default=None, help="Filter investigation to a single configured brand.")
@click.option("--metric", required=True, type=click.Choice(["cpl", "cvr", "volume"], case_sensitive=False), help="Metric to investigate.")
@click.option("--no-fetch", is_flag=True, help="Skip fetching, use cached data only.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def investigate(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    metric: str,
    no_fetch: bool,
    month: str | None,
    days: int | None,
) -> None:
    """Deep diagnostic investigation into why a specific metric changed.

    Requires --metric to focus the investigation on CPL, CVR, or lead volume.
    """
    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.output import output_data
    from src.pipeline import analyze_client, fetch_client
    from src.storage import StorageManager

    fmt = ctx.obj["format"]
    cid = resolve_client_id(client_id)
    is_monthly, start, end = resolve_dates(month, days)

    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    client_config = cm.get_client_config(cid)
    if not client_config:
        raise click.UsageError(f"Client '{cid}' not found in config.")

    business_config = cm.get_business_config(cid)
    client_context = cm.get_client_context(cid)
    storage = StorageManager()
    cred = CredentialManager()
    selected_brand = resolve_brand_name(business_config, brand)

    # Fetch (unless --no-fetch)
    if not no_fetch:
        fetch_client(
            client_id=cid,
            business_config=business_config,
            start_date=start,
            end_date=end,
            storage=storage,
            cred_manager=cred,
        )

    results = analyze_client(
        client_id=cid,
        business_config=business_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
        context=client_context,
        brand=selected_brand,
    )

    if results is None:
        output_data(
            {
                **scope_payload(cid, selected_brand),
                "status": "no_data",
                "message": "No data available for investigation.",
            },
            fmt,
            title="Investigation",
        )
        return

    # Build investigation result focused on the chosen metric
    knowledge = _read_knowledge(cid)
    investigation: dict = {
        **scope_payload(cid, selected_brand),
        "context": results.context,
        "knowledge": knowledge,
        "metric": metric,
        "period": results.period_current,
        "comparison_period": results.period_previous,
        "currency": results.currency,
        "kpi_summary": results.kpi_summary,
    }

    if metric == "cpl":
        investigation["related_data"] = {
            "budget_recommendations": results.budget_recommendations,
            "impression_share_opportunities": results.lost_impression_share,
        }
        if results.web_quality:
            from dataclasses import asdict

            investigation["related_data"]["paid_engagement_gaps"] = [
                asdict(p) for p in results.web_quality.paid_engagement_gaps
            ]
    elif metric == "cvr":
        investigation["related_data"] = {
            "quality_score_alerts": results.low_qs_alerts,
            "quality_score_changes": results.qs_changes,
            "negative_keyword_candidates": results.negative_keywords[:20],
        }
        if results.web_quality:
            from dataclasses import asdict

            investigation["related_data"]["web_quality"] = {
                "low_engagement_pages": [
                    asdict(p) for p in results.web_quality.low_engagement_pages
                ],
                "paid_engagement_gaps": [
                    asdict(p) for p in results.web_quality.paid_engagement_gaps
                ],
            }
    elif metric == "volume":
        investigation["related_data"] = {
            "trends": results.trends,
            "anomalies": results.anomalies,
            "forecasts": results.forecasts,
            "impression_share_opportunities": results.lost_impression_share,
        }

    output_data(investigation, fmt, title=f"Investigation: {metric.upper()} for {cid}")


# ---------------------------------------------------------------------------
# brief
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--brand", default=None, help="Generate reports for a single configured brand.")
@click.option("--no-fetch", is_flag=True, help="Skip fetching, use cached data only.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def brief(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    no_fetch: bool,
    month: str | None,
    days: int | None,
) -> None:
    """Generate a client-ready summary report.

    Chains fetch + analyze + report generation, producing both the
    internal detailed report and the client-facing summary.
    """
    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.output import output_data
    from src.pipeline import analyze_client, fetch_client, generate_reports
    from src.reporting import ClientSummaryGenerator, InternalReportGenerator
    from src.storage import StorageManager

    fmt = ctx.obj["format"]
    cid = resolve_client_id(client_id)
    is_monthly, start, end = resolve_dates(month, days)

    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    client_config = cm.get_client_config(cid)
    if not client_config:
        raise click.UsageError(f"Client '{cid}' not found in config.")

    business_config = cm.get_business_config(cid)
    client_context = cm.get_client_context(cid)
    storage = StorageManager()
    cred = CredentialManager()
    selected_brand = resolve_brand_name(business_config, brand)

    # Phase 1: fetch (unless --no-fetch)
    if not no_fetch:
        if not ctx.obj["quiet"]:
            click.echo(f"Fetching data for {cid}...", err=True)
        fetch_client(
            client_id=cid,
            business_config=business_config,
            start_date=start,
            end_date=end,
            storage=storage,
            cred_manager=cred,
        )

    # Phase 2: analyze
    if not ctx.obj["quiet"]:
        click.echo(f"Analyzing {cid}...", err=True)
    results = analyze_client(
        client_id=cid,
        business_config=business_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
        context=client_context,
        brand=selected_brand,
    )

    if results is None:
        output_data(
            {
                **scope_payload(cid, selected_brand),
                "status": "no_data",
                "message": "No data available to generate brief.",
            },
            fmt,
            title="Brief",
        )
        return

    # Phase 3: generate reports
    if not ctx.obj["quiet"]:
        click.echo(f"Generating reports for {cid}...", err=True)
    internal_gen = InternalReportGenerator(output_dir="reports")
    summary_gen = ClientSummaryGenerator(output_dir="reports")

    internal_path, summary_path = generate_reports(
        results=results,
        business_config=business_config,
        current_start=start,
        current_end=end,
        storage=storage,
        internal_report_generator=internal_gen,
        client_summary_generator=summary_gen,
        report_type="all",
    )

    knowledge = _read_knowledge(cid)
    result = {
        **scope_payload(cid, selected_brand),
        "knowledge": knowledge,
        "period": results.period_current,
        "internal_report": internal_path,
        "client_summary": summary_path,
        "status": "complete",
    }
    output_data(result, fmt, title=f"Brief: {cid}")
