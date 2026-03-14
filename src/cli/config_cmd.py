"""Configuration subcommands: ``config list`` and ``config check-creds``."""

import click


@click.group("config")
@click.pass_context
def config(ctx: click.Context) -> None:
    """Manage client configuration and credentials."""
    ctx.ensure_object(dict)


@config.command("list")
@click.pass_context
def config_list(ctx: click.Context) -> None:
    """Show configured clients and their source aliases."""
    from src.config import ConfigManager
    from src.output import output_data

    fmt = ctx.obj["format"]
    cm = ConfigManager(ctx.obj["config_path"])
    config_data = cm.load_config()

    if not config_data:
        raise click.ClickException(f"Failed to load config from {ctx.obj['config_path']}.")

    clients = cm.get_clients()
    rows = []
    for cid in clients:
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
        rows.append({
            "client_id": cid,
            "source_types": ", ".join(source_types),
            "source_aliases": ", ".join(business_config.sources.aliases()),
            "brand_count": len(business_config.brands),
        })

    output_data(
        rows,
        fmt,
        title="Configured Clients",
        columns=["client_id", "source_types", "source_aliases", "brand_count"],
    )


@config.command("check-creds")
@click.pass_context
def check_creds(ctx: click.Context) -> None:
    """Verify API credentials for all configured platforms."""
    from src.credentials import CredentialManager
    from src.output import output_data

    fmt = ctx.obj["format"]
    cred = CredentialManager()
    status = cred.validate_credentials()

    rows = []
    for platform, available in status.items():
        row = {"platform": platform, "configured": available}
        if platform == "google_ads" and not available:
            row["missing"] = ", ".join(cred.get_missing_google_ads_credentials())
        else:
            row["missing"] = ""
        rows.append(row)

    output_data(rows, fmt, title="Credential Status", columns=["platform", "configured", "missing"])
