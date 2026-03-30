"""Shared workflow helpers for CLI commands."""

from __future__ import annotations

from dataclasses import asdict
from datetime import date, timedelta
from typing import Any, Dict

import click

from src.cli.state import resolve_client_id
from src.config import ConfigManager
from src.credentials import CredentialManager
from src.reporting import canonicalize_brand_name
from src.storage import StorageManager


def resolve_dates(month: str | None, days: int | None) -> tuple[bool, date, date]:
    """Resolve reporting windows from either month or trailing days."""
    from calendar import monthrange

    if month and days:
        raise click.UsageError("Use either --month or --days, not both.")

    if month:
        year_str, month_str = month.split("-")
        year = int(year_str)
        month_num = int(month_str)
        start = date(year, month_num, 1)
        end = date(year, month_num, monthrange(year, month_num)[1])
        return True, start, end

    trailing_days = days or 30
    end = date.today()
    start = end - timedelta(days=trailing_days - 1)
    return False, start, end


def load_runtime(ctx: click.Context, client_id: str | None) -> Dict[str, Any]:
    """Load shared config/runtime objects for a command."""
    cid = resolve_client_id(client_id)
    cm = ConfigManager(ctx.obj["config_path"])
    cm.load_config()
    client_config = cm.get_client_config(cid)
    if not client_config:
        raise click.UsageError(f"Client '{cid}' not found in config.")
    business_config = cm.get_business_config(cid)
    client_context = cm.get_client_context(cid)
    return {
        "client_id": cid,
        "config_manager": cm,
        "client_config": client_config,
        "business_config": business_config,
        "client_context": client_context,
        "storage": StorageManager(),
        "credentials": CredentialManager(),
    }


def resolve_brand(business_config, brand: str | None) -> str | None:
    """Resolve configured brand casing or fail clearly."""
    selected = canonicalize_brand_name(business_config, brand)
    if brand and selected is None:
        raise click.UsageError(f"Unknown brand '{brand}'.")
    return selected


def scope_payload(client_id: str, brand: str | None) -> Dict[str, Any]:
    """Common client/brand payload fields."""
    return {
        "client_id": client_id,
        "scope": "brand" if brand else "client",
        "brand": brand,
    }


def dataclass_list(values: list[Any]) -> list[Any]:
    """Serialize dataclass items to plain dicts."""
    output: list[Any] = []
    for value in values:
        output.append(asdict(value) if hasattr(value, "__dataclass_fields__") else value)
    return output
