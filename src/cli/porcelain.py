"""Porcelain commands: ``check``, ``investigate``, ``brief``.

High-level workflow shortcuts that chain plumbing operations together.
"""

from __future__ import annotations

import click

from .context import resolve_client_id
from .plumbing import resolve_dates


# ---------------------------------------------------------------------------
# check
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def check(ctx: click.Context, client_id: str | None, month: str | None, days: int | None) -> None:
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

    reporting_config = cm.get_reporting_config(cid)
    storage = StorageManager()
    cred = CredentialManager()

    # Phase 1: fetch
    if not ctx.obj["quiet"]:
        click.echo(f"Fetching data for {cid}...", err=True)
    fetch_client(
        client_id=cid,
        client_config=client_config,
        reporting_config=reporting_config,
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
        reporting_config=reporting_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
    )

    if results is None:
        output_data(
            {"client_id": cid, "status": "no_data", "message": "No data available."},
            fmt,
            title="Health Check",
        )
        return

    # Build a compact health summary
    summary = {
        "client_id": cid,
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

    output_data(summary, fmt, title=f"Health Check: {cid}")


# ---------------------------------------------------------------------------
# investigate
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--metric", required=True, type=click.Choice(["cpl", "cvr", "volume"], case_sensitive=False), help="Metric to investigate.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def investigate(ctx: click.Context, client_id: str | None, metric: str, month: str | None, days: int | None) -> None:
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

    reporting_config = cm.get_reporting_config(cid)
    storage = StorageManager()
    cred = CredentialManager()

    # Fetch + analyze
    fetch_client(
        client_id=cid,
        client_config=client_config,
        reporting_config=reporting_config,
        start_date=start,
        end_date=end,
        storage=storage,
        cred_manager=cred,
    )

    results = analyze_client(
        client_id=cid,
        reporting_config=reporting_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
    )

    if results is None:
        output_data(
            {"client_id": cid, "status": "no_data", "message": "No data available for investigation."},
            fmt,
            title="Investigation",
        )
        return

    # Build investigation result focused on the chosen metric
    investigation: dict = {
        "client_id": cid,
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
    elif metric == "cvr":
        investigation["related_data"] = {
            "quality_score_alerts": results.low_qs_alerts,
            "quality_score_changes": results.qs_changes,
            "negative_keyword_candidates": results.negative_keywords[:20],
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
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def brief(ctx: click.Context, client_id: str | None, month: str | None, days: int | None) -> None:
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

    reporting_config = cm.get_reporting_config(cid)
    storage = StorageManager()
    cred = CredentialManager()

    # Phase 1: fetch
    if not ctx.obj["quiet"]:
        click.echo(f"Fetching data for {cid}...", err=True)
    fetch_client(
        client_id=cid,
        client_config=client_config,
        reporting_config=reporting_config,
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
        reporting_config=reporting_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
    )

    if results is None:
        output_data(
            {"client_id": cid, "status": "no_data", "message": "No data available to generate brief."},
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
        reporting_config=reporting_config,
        current_start=start,
        current_end=end,
        storage=storage,
        internal_report_generator=internal_gen,
        client_summary_generator=summary_gen,
    )

    result = {
        "client_id": cid,
        "period": results.period_current,
        "internal_report": internal_path,
        "client_summary": summary_path,
        "status": "complete",
    }
    output_data(result, fmt, title=f"Brief: {cid}")
