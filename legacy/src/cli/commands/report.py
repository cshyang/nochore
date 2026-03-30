"""Report command group."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_brand, resolve_dates, scope_payload
from src.cli.workflows.reporting import build_report_payload
from src.output import output_data
from src.reporting import ClientSummaryGenerator, InternalReportGenerator
from src.tools.analysis import run_analysis, sync_client_data
from src.tools.reporting import generate_reports


@click.group()
def report() -> None:
    """Generate report artifacts."""


@report.command("brief")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Generate a brand-scoped brief.")
@click.option("--refresh", is_flag=True, help="Refresh source data before analysis.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def brief(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    refresh: bool,
    month: str | None,
    days: int | None,
) -> None:
    """Run the brief workflow."""
    runtime = load_runtime(ctx, client_id)
    is_monthly, start, end = resolve_dates(month, days)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    if refresh:
        sync_client_data(
            runtime["client_id"],
            runtime["business_config"],
            start,
            end,
            runtime["storage"],
            runtime["credentials"],
        )
    results = run_analysis(
        runtime["client_id"],
        runtime["business_config"],
        start,
        end,
        runtime["storage"],
        is_monthly=is_monthly,
        context=runtime["client_context"],
        brand=selected_brand,
    )
    if results is None:
        output_data(
            {
                **scope_payload(runtime["client_id"], selected_brand),
                "status": "no_data",
                "message": "No data available to generate brief.",
            },
            ctx.obj["format"],
            title="Brief",
        )
        return
    internal_path, summary_path = generate_reports(
        results,
        runtime["business_config"],
        start,
        end,
        runtime["storage"],
        InternalReportGenerator(output_dir="reports"),
        ClientSummaryGenerator(output_dir="reports"),
        report_type="all",
    )
    output_data(
        build_report_payload(runtime["client_id"], selected_brand, results.period_current, internal_path, summary_path),
        ctx.obj["format"],
        title="Brief",
    )


@report.command("generate")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Generate a brand-scoped report.")
@click.option("--type", "report_type", type=click.Choice(["internal", "summary", "all"], case_sensitive=False), default="all", show_default=True)
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def generate(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    report_type: str,
    month: str | None,
    days: int | None,
) -> None:
    """Generate report files from stored analysis data."""
    runtime = load_runtime(ctx, client_id)
    is_monthly, start, end = resolve_dates(month, days)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    results = run_analysis(
        runtime["client_id"],
        runtime["business_config"],
        start,
        end,
        runtime["storage"],
        is_monthly=is_monthly,
        context=runtime["client_context"],
        brand=selected_brand,
    )
    if results is None:
        output_data(
            {
                **scope_payload(runtime["client_id"], selected_brand),
                "status": "no_data",
                "message": "No stored data to generate reports from.",
            },
            ctx.obj["format"],
            title="Report",
        )
        return
    internal_path, summary_path = generate_reports(
        results,
        runtime["business_config"],
        start,
        end,
        runtime["storage"],
        InternalReportGenerator(output_dir="reports"),
        ClientSummaryGenerator(output_dir="reports"),
        report_type=report_type,
    )
    output_data(
        build_report_payload(runtime["client_id"], selected_brand, results.period_current, internal_path, summary_path),
        ctx.obj["format"],
        title="Report",
    )
