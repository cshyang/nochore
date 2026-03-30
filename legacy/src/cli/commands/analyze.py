"""Analyze command group."""

from __future__ import annotations

import click

from src.cli.workflows.analysis import build_check_payload, build_investigation_payload
from src.cli.workflows.common import load_runtime, resolve_brand, resolve_dates, scope_payload
from src.output import output_data
from src.reporting.brand_scope import list_brands
from src.tools.analysis import run_analysis, sync_client_data


@click.group()
def analyze() -> None:
    """Run analytics workflows."""


@analyze.command("run")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Filter analysis to a single configured brand.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def run(ctx: click.Context, client_id: str | None, brand: str | None, month: str | None, days: int | None) -> None:
    """Run analyzers on stored data."""
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
                "message": "No stored data found for this client/date range.",
            },
            ctx.obj["format"],
            title="Analysis",
        )
        return
    output_data(results, ctx.obj["format"], title="Analysis")


@analyze.command("check")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Filter check to a single configured brand.")
@click.option("--refresh", is_flag=True, help="Refresh source data before analysis.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def check(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    refresh: bool,
    month: str | None,
    days: int | None,
) -> None:
    """Run the health-check workflow."""
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
                "message": "No data available.",
            },
            ctx.obj["format"],
            title="Health Check",
        )
        return
    output_data(build_check_payload(results), ctx.obj["format"], title="Health Check")


@analyze.command("investigate")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Filter investigation to a single configured brand.")
@click.option("--metric", required=True, type=click.Choice(["cpl", "cvr", "volume"], case_sensitive=False))
@click.option("--refresh", is_flag=True, help="Refresh source data before analysis.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def investigate(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    metric: str,
    refresh: bool,
    month: str | None,
    days: int | None,
) -> None:
    """Investigate a metric change in more detail."""
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
                "message": "No data available for investigation.",
            },
            ctx.obj["format"],
            title="Investigation",
        )
        return
    output_data(
        build_investigation_payload(results, metric.lower()),
        ctx.obj["format"],
        title="Investigation",
    )


@analyze.command("brands")
@click.argument("client_id", required=False)
@click.pass_context
def brands(ctx: click.Context, client_id: str | None) -> None:
    """List configured brands for a client."""
    runtime = load_runtime(ctx, client_id)
    rows = [
        {"client_id": runtime["client_id"], "brand": brand}
        for brand in list_brands(runtime["business_config"])
    ]
    output_data(rows, ctx.obj["format"], title="Brands", columns=["client_id", "brand"])
