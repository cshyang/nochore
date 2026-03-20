"""Memory command group."""

from __future__ import annotations

import click

from src.cli.workflows.common import resolve_client_id
from src.output import output_data
from src.tools.memory import MemoryStore


@click.group()
def memory() -> None:
    """Inspect structured optimization memory."""


@memory.command("list")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Filter to a single brand.")
@click.option("--kind", "kinds", multiple=True, help="Restrict to experiments, actions, outcomes, or lessons.")
@click.pass_context
def list_memory(ctx: click.Context, client_id: str | None, brand: str | None, kinds: tuple[str, ...]) -> None:
    """List memory rows for a client."""
    cid = resolve_client_id(client_id)
    rows = MemoryStore().list_records(cid, brand=brand, kinds=kinds or None)
    output_data(rows, ctx.obj["format"], title="Memory")


@memory.command("show")
@click.argument("record_id")
@click.pass_context
def show(ctx: click.Context, record_id: str) -> None:
    """Show one memory record by record_id."""
    row = MemoryStore().get_record(record_id)
    output_data(row or {"record_id": record_id, "status": "not_found"}, ctx.obj["format"], title="Memory Record")


@memory.command("search")
@click.argument("client_id", required=False)
@click.argument("query")
@click.pass_context
def search(ctx: click.Context, client_id: str | None, query: str) -> None:
    """Search memory text for a client."""
    cid = resolve_client_id(client_id)
    rows = MemoryStore().search(cid, query)
    output_data(rows, ctx.obj["format"], title="Memory Search")


@memory.command("summarize")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Filter summary to a single brand.")
@click.pass_context
def summarize(ctx: click.Context, client_id: str | None, brand: str | None) -> None:
    """Generate the markdown summary from structured memory."""
    cid = resolve_client_id(client_id)
    path = MemoryStore().summarize(cid, brand=brand)
    output_data(
        {"client_id": cid, "brand": brand, "summary_path": str(path), "status": "complete"},
        ctx.obj["format"],
        title="Memory Summary",
    )
