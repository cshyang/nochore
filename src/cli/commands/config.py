"""Config command group."""

from __future__ import annotations

import click

from src.config import ConfigManager
from src.credentials import CredentialManager
from src.output import output_data


@click.group()
def config() -> None:
    """Inspect configuration and credentials."""


@config.command("list")
@click.pass_context
def list_config(ctx: click.Context) -> None:
    """Show configured clients and their source aliases."""
    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    rows = []
    for cid in cm.get_clients():
        business_config = cm.get_business_config(cid)
        source_types = []
        if business_config.sources.google_ads:
            source_types.append("google_ads")
        if business_config.sources.meta:
            source_types.append("meta")
        if business_config.sources.ga4:
            source_types.append("ga4")
        if business_config.sources.search_console:
            source_types.append("search_console")
        rows.append(
            {
                "client_id": cid,
                "source_types": ", ".join(source_types),
                "source_aliases": ", ".join(business_config.sources.aliases()),
                "brand_count": len(business_config.brands),
            }
        )
    output_data(
        rows,
        ctx.obj["format"],
        title="Configured Clients",
        columns=["client_id", "source_types", "source_aliases", "brand_count"],
    )


@config.command("check-creds")
@click.pass_context
def check_creds(ctx: click.Context) -> None:
    """Show configured credential coverage."""
    cred = CredentialManager()
    status = cred.validate_credentials()
    output_data(status, ctx.obj["format"], title="Credential Status")
