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
    """Show configured clients and their platforms."""
    from src.config import ConfigManager
    from src.output import OutputFormat, output_data

    fmt = OutputFormat(ctx.obj["format"])
    cm = ConfigManager(ctx.obj["config_path"])
    config_data = cm.load_config()

    if not config_data:
        raise click.ClickException(f"Failed to load config from {ctx.obj['config_path']}.")

    clients = cm.get_clients()
    rows = []
    for cid in clients:
        cc = cm.get_client_config(cid)
        platforms = []
        if "google_ads" in cc:
            platforms.append("google_ads")
        if "meta" in cc:
            platforms.append("meta")
        rows.append({
            "client_id": cid,
            "platforms": ", ".join(platforms),
            "google_ads_accounts": len(cc.get("google_ads", {}).get("customer_ids", [])),
            "meta_ad_accounts": len(cc.get("meta", {}).get("ad_accounts", [])),
        })

    output_data(rows, fmt, title="Configured Clients", columns=["client_id", "platforms", "google_ads_accounts", "meta_ad_accounts"])


@config.command("check-creds")
@click.pass_context
def check_creds(ctx: click.Context) -> None:
    """Verify API credentials for all configured platforms."""
    from src.credentials import CredentialManager
    from src.output import OutputFormat, output_data

    fmt = OutputFormat(ctx.obj["format"])
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
