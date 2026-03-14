"""Helpers shared by brand-aware CLI commands."""

from __future__ import annotations

from typing import Dict, Optional

import click

from src.models import BusinessConfig
from src.reporting import canonicalize_brand_name, list_brands


def resolve_brand_name(
    business_config: BusinessConfig,
    brand: str | None,
) -> Optional[str]:
    """Resolve *brand* to configured casing or raise a Click usage error."""
    if not brand:
        return None

    canonical_brand = canonicalize_brand_name(business_config, brand)
    if canonical_brand is not None:
        return canonical_brand

    configured_brands = list_brands(business_config)
    if configured_brands:
        choices = ", ".join(configured_brands)
        raise click.UsageError(f"Unknown brand '{brand}'. Available brands: {choices}")
    raise click.UsageError("This client has no configured brands.")


def scope_payload(client_id: str, brand: str | None) -> Dict[str, Optional[str]]:
    """Return consistent scope metadata for command outputs."""
    return {
        "client_id": client_id,
        "scope": "brand" if brand else "client",
        "brand": brand,
    }
