"""Data command group."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_dates
from src.output import output_data
from src.tools.analysis import get_data_freshness, list_configured_sources, sync_client_data


@click.group()
def data() -> None:
    """Manage source sync and cache inspection."""


@data.command("sync")
@click.argument("client_id", required=False)
@click.option("--source", "sources", multiple=True, help="Source type or alias to sync.")
@click.option("--month", "-m", default=None, help="Target month YYYY-MM.")
@click.option("--days", "-d", type=int, default=None, help="Number of trailing days.")
@click.pass_context
def sync(
    ctx: click.Context,
    client_id: str | None,
    sources: tuple[str, ...],
    month: str | None,
    days: int | None,
) -> None:
    """Sync configured source data into local storage."""
    runtime = load_runtime(ctx, client_id)
    _, start, end = resolve_dates(month, days)
    result = sync_client_data(
        runtime["client_id"],
        runtime["business_config"],
        start,
        end,
        runtime["storage"],
        runtime["credentials"],
        list(sources),
    )
    output_data(result, ctx.obj["format"], title="Data Sync")


@data.command("freshness")
@click.argument("client_id", required=False)
@click.pass_context
def freshness(ctx: click.Context, client_id: str | None) -> None:
    """Show stored data freshness for a client."""
    runtime = load_runtime(ctx, client_id)
    output_data(
        {
            "client_id": runtime["client_id"],
            "data_types": runtime["storage"].list_data_types(runtime["client_id"]),
            "data_freshness": get_data_freshness(runtime["client_id"]),
        },
        ctx.obj["format"],
        title="Data Freshness",
    )


@data.command("sources")
@click.argument("client_id", required=False)
@click.pass_context
def sources(ctx: click.Context, client_id: str | None) -> None:
    """List configured client data sources."""
    runtime = load_runtime(ctx, client_id)
    rows = list_configured_sources(runtime["client_id"], runtime["business_config"])
    output_data(
        rows,
        ctx.obj["format"],
        title="Configured Sources",
        columns=["client_id", "source_alias", "source_type", "identifier"],
    )
