"""Plumbing commands: ``fetch``, ``analyze``, ``report``.

These are granular building blocks that map 1-to-1 to the pipeline phases
defined in ``src.pipeline``.  Porcelain commands chain them together.
"""

from __future__ import annotations

from datetime import date, timedelta

import click

from .brand_support import resolve_brand_name, scope_payload
from .context import resolve_client_id


def resolve_dates(month: str | None, days: int | None) -> tuple[bool, date, date]:
    """Resolve date range from --month / --days flags.

    Defaults to last 30 days when neither flag is supplied.
    """
    from src.date_utils import calculate_days_range, parse_month_arg
    from src.date_selector import month_to_date_range

    if days:
        start, end = calculate_days_range(days)
        return False, start, end
    if month:
        year, mon = parse_month_arg(month)
        start, end = month_to_date_range(year, mon)
        return True, start, end

    # Default: last 30 days
    start, end = calculate_days_range(30)
    return False, start, end


# ---------------------------------------------------------------------------
# fetch
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.option(
    "--platform",
    type=click.Choice(["google", "meta", "all"], case_sensitive=False),
    default="all",
    show_default=True,
    help="Platform to fetch.",
)
@click.pass_context
def fetch(ctx: click.Context, client_id: str | None, month: str | None, days: int | None, platform: str) -> None:
    """Pull data from configured sources and store locally."""
    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.output import output_data
    from src.pipeline import fetch_client
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
    storage = StorageManager()
    cred = CredentialManager()

    fetch_client(
        client_id=cid,
        business_config=business_config,
        start_date=start,
        end_date=end,
        storage=storage,
        cred_manager=cred,
    )

    result = {
        "client_id": cid,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "platform": platform,
        "status": "complete",
    }
    output_data(result, fmt, title="Fetch Results")


# ---------------------------------------------------------------------------
# analyze
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--brand", default=None, help="Filter analysis to a single configured brand.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.option("--only", default=None, help="Comma-separated analyzer names to run.")
@click.pass_context
def analyze(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    month: str | None,
    days: int | None,
    only: str | None,
) -> None:
    """Run analyzers on stored data and return structured results."""
    from src.config import ConfigManager
    from src.output import output_data
    from src.pipeline import analyze_client
    from src.storage import StorageManager

    fmt = ctx.obj["format"]
    cid = resolve_client_id(client_id)
    is_monthly, start, end = resolve_dates(month, days)

    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    business_config = cm.get_business_config(cid)
    client_context = cm.get_client_context(cid)
    storage = StorageManager()
    selected_brand = resolve_brand_name(business_config, brand)

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
                "message": "No stored data found for this client/date range.",
            },
            fmt,
            title="Analysis Results",
        )
        return

    output_data(results, fmt, title="Analysis Results")


# ---------------------------------------------------------------------------
# report
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id", required=False, default=None)
@click.option("--brand", default=None, help="Generate reports for a single configured brand.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.option(
    "--type",
    "report_type",
    type=click.Choice(["internal", "summary", "all"], case_sensitive=False),
    default="all",
    show_default=True,
    help="Type of report to generate.",
)
@click.pass_context
def report(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    month: str | None,
    days: int | None,
    report_type: str,
) -> None:
    """Generate markdown reports from analysis results."""
    from src.config import ConfigManager
    from src.output import output_data
    from src.pipeline import analyze_client, generate_reports
    from src.reporting import ClientSummaryGenerator, InternalReportGenerator
    from src.storage import StorageManager

    fmt = ctx.obj["format"]
    cid = resolve_client_id(client_id)
    is_monthly, start, end = resolve_dates(month, days)

    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    business_config = cm.get_business_config(cid)
    selected_brand = resolve_brand_name(business_config, brand)
    storage = StorageManager()

    # Need analysis results first
    results = analyze_client(
        client_id=cid,
        business_config=business_config,
        current_start=start,
        current_end=end,
        storage=storage,
        is_monthly=is_monthly,
        brand=selected_brand,
    )

    if results is None:
        output_data(
            {
                **scope_payload(cid, selected_brand),
                "status": "no_data",
                "message": "No stored data to generate reports from.",
            },
            fmt,
            title="Report Generation",
        )
        return

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
        report_type=report_type,
    )

    result = {
        **scope_payload(cid, selected_brand),
        "report_type": report_type,
        "internal_report": internal_path,
        "client_summary": summary_path,
        "status": "complete",
    }
    output_data(result, fmt, title="Report Generation")
