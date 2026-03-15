"""Optimize command group."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_brand, resolve_dates, scope_payload
from src.output import output_data
from src.tools.analysis import run_analysis
from src.tools.experiments import learn_experiment, plan_optimization, review_experiment, run_optimization
from src.tools.memory import MemoryStore


@click.group()
def optimize() -> None:
    """Optimization planning and review workflows."""


@optimize.command("plan")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Plan for a single configured brand.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def plan(ctx: click.Context, client_id: str | None, brand: str | None, month: str | None, days: int | None) -> None:
    """Build an optimization plan from analysis plus memory."""
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
                "message": "No stored data available for optimization planning.",
            },
            ctx.obj["format"],
            title="Optimization Plan",
        )
        return
    payload = plan_optimization(results, MemoryStore())
    output_data(payload, ctx.obj["format"], title="Optimization Plan")


@optimize.command("run")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Run for a single configured brand.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.option("--dry-run", is_flag=True, help="Required in this phase; validates and records planned actions only.")
@click.pass_context
def run(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    month: str | None,
    days: int | None,
    dry_run: bool,
) -> None:
    """Run optimizer planning and policy evaluation."""
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
                "message": "No stored data available for optimization execution.",
            },
            ctx.obj["format"],
            title="Optimization Run",
        )
        return
    payload = run_optimization(results, MemoryStore(), dry_run=dry_run)
    output_data(payload, ctx.obj["format"], title="Optimization Run")


@optimize.command("review")
@click.argument("experiment_id")
@click.pass_context
def review(ctx: click.Context, experiment_id: str) -> None:
    """Review one experiment from memory."""
    output_data(review_experiment(MemoryStore(), experiment_id), ctx.obj["format"], title="Experiment Review")


@optimize.command("learn")
@click.argument("experiment_id")
@click.pass_context
def learn(ctx: click.Context, experiment_id: str) -> None:
    """Generate a lesson from one experiment."""
    output_data(learn_experiment(MemoryStore(), experiment_id), ctx.obj["format"], title="Experiment Learning")
