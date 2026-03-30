"""Context command group."""

from __future__ import annotations

from pathlib import Path

import click

from src.cli.state import CONTEXT_FILE, read_context, write_context
from src.cli.workflows.common import load_runtime
from src.output import output_data
from src.tools.analysis import get_data_freshness


@click.group()
def context() -> None:
    """Manage active client context."""


@context.command("use")
@click.argument("client_id")
@click.pass_context
def use(ctx: click.Context, client_id: str) -> None:
    """Set the active client context."""
    runtime = load_runtime(ctx, client_id)
    write_context(runtime["client_id"])
    output_data(
        {
            "active_client": runtime["client_id"],
            "context_file": str(CONTEXT_FILE),
        },
        ctx.obj["format"],
        title="Active Context",
    )


@context.command("status")
@click.pass_context
def status(ctx: click.Context) -> None:
    """Show current context and cached data status."""
    active = read_context()
    info: dict = {
        "active_client": active or "(none)",
        "context_file": str(CONTEXT_FILE),
        "context_file_exists": CONTEXT_FILE.exists(),
    }

    if active:
        runtime = load_runtime(ctx, active)
        info["context"] = runtime["client_context"]
        info["data_types"] = runtime["storage"].list_data_types(active)
        info["data_freshness"] = get_data_freshness(active)
        memory_summary = Path("data") / active / "memory" / "summary.md"
        info["memory_summary"] = str(memory_summary)
        info["memory_summary_exists"] = memory_summary.exists()

    output_data(info, ctx.obj["format"], title="Campaign Status")
