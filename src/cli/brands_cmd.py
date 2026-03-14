"""Brand discovery commands."""

from __future__ import annotations

import click

from .context import resolve_client_id


@click.group()
def brands() -> None:
    """Discover configured brands for a client."""


@brands.command(name="list")
@click.argument("client_id", required=False, default=None)
@click.pass_context
def list_brands_cmd(ctx: click.Context, client_id: str | None) -> None:
    """List configured brands for a client."""
    from src.config import ConfigManager
    from src.output import output_data
    from src.reporting import list_brands

    fmt = ctx.obj["format"]
    cid = resolve_client_id(client_id)

    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    client_config = cm.get_client_config(cid)
    if not client_config:
        raise click.UsageError(f"Client '{cid}' not found in config.")

    brands = [{"client_id": cid, "brand": brand} for brand in list_brands(cm.get_business_config(cid))]
    output_data(brands, fmt, title=f"Brands: {cid}", columns=["brand"])
