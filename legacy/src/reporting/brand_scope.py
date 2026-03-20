"""Shared helpers for brand matching and brand-scoped filtering."""

from __future__ import annotations

import re
from typing import List, Optional, Tuple

import polars as pl

from ..models import BrandDefinition, BusinessConfig


def list_brands(business_config: BusinessConfig) -> List[str]:
    """Return configured brands in declaration order without duplicates."""
    seen: set[str] = set()
    brands: List[str] = []
    for brand in business_config.brands:
        key = brand.name.casefold()
        if not brand.name or key in seen:
            continue
        seen.add(key)
        brands.append(brand.name)
    return brands


def canonicalize_brand_name(
    business_config: BusinessConfig,
    brand_name: str | None,
) -> Optional[str]:
    """Resolve *brand_name* to the configured casing."""
    candidate = str(brand_name or "").strip()
    if not candidate:
        return None

    for brand in list_brands(business_config):
        if brand.casefold() == candidate.casefold():
            return brand
    return None


def get_brand_definition(
    business_config: BusinessConfig, brand_name: str | None
) -> Optional[BrandDefinition]:
    """Return the configured BrandDefinition for *brand_name*."""
    canonical = canonicalize_brand_name(business_config, brand_name)
    if canonical is None:
        return None
    for brand in business_config.brands:
        if brand.name.casefold() == canonical.casefold():
            return brand
    return None


def match_brand(
    platform: str,
    source_alias: str,
    campaign_name: str,
    business_config: BusinessConfig,
) -> Tuple[Optional[str], Optional[str]]:
    """Return the matching brand and default theme for a row."""
    source_meta = business_config.sources.get(source_alias)
    if source_meta is None:
        return None, None

    source_type, _ = source_meta
    if source_type != platform:
        return None, None

    for brand in business_config.brands:
        if source_alias not in brand.sources:
            continue
        filters = brand.filters.get(source_alias)
        regex = filters.campaign_name_regex if filters else ".*"
        if regex and not re.search(regex, campaign_name, flags=re.IGNORECASE):
            continue
        return brand.name, brand.default_theme

    return None, None


def assign_brand_columns(
    df: pl.DataFrame,
    business_config: BusinessConfig,
    *,
    default_platform: str | None = None,
    unmatched_label: str | None = None,
) -> pl.DataFrame:
    """Add ``brand`` and ``brand_default_theme`` columns to *df*."""
    if df.is_empty():
        return df.with_columns(
            pl.lit(None, dtype=pl.String).alias("brand"),
            pl.lit(None, dtype=pl.String).alias("brand_default_theme"),
        )

    if not business_config.brands or "source_alias" not in df.columns:
        return df.with_columns(
            pl.lit(None, dtype=pl.String).alias("brand"),
            pl.lit(None, dtype=pl.String).alias("brand_default_theme"),
        )

    brands: List[Optional[str]] = []
    default_themes: List[Optional[str]] = []
    for row in df.iter_rows(named=True):
        platform = default_platform or str(row.get("platform", ""))
        brand, default_theme = match_brand(
            platform=platform,
            source_alias=str(row.get("source_alias", "")),
            campaign_name=str(row.get("campaign_name", "")),
            business_config=business_config,
        )
        if brand is None and unmatched_label is not None:
            brand = unmatched_label
        brands.append(brand)
        default_themes.append(default_theme)

    return df.with_columns(
        pl.Series("brand", brands, dtype=pl.String),
        pl.Series("brand_default_theme", default_themes, dtype=pl.String),
    )


def filter_to_brand(
    df: pl.DataFrame,
    business_config: BusinessConfig,
    brand_name: str,
    *,
    default_platform: str | None = None,
) -> Tuple[Optional[str], pl.DataFrame]:
    """Return the canonical brand name and a filtered dataframe."""
    canonical_brand = canonicalize_brand_name(business_config, brand_name)
    if canonical_brand is None:
        return None, _with_empty_brand_columns(df)

    branded_df = assign_brand_columns(
        df,
        business_config,
        default_platform=default_platform,
        unmatched_label=None,
    )
    return canonical_brand, branded_df.filter(pl.col("brand") == canonical_brand)


def filter_ga4_to_brand(
    df: pl.DataFrame,
    business_config: BusinessConfig,
    brand_name: str,
) -> pl.DataFrame:
    """Filter GA4 landing page data by source alias and landing-page regex."""
    if df.is_empty() or "source_alias" not in df.columns:
        return df.head(0)

    brand = get_brand_definition(business_config, brand_name)
    if brand is None:
        return df.head(0)

    frames: List[pl.DataFrame] = []
    for alias in brand.sources:
        source = business_config.sources.get(alias)
        if source is None or source[0] != "ga4":
            continue
        scoped = df.filter(pl.col("source_alias") == alias)
        filters = brand.filters.get(alias)
        regex = filters.landing_page_regex if filters else ".*"
        if regex and regex != ".*":
            scoped = scoped.filter(pl.col("landing_page").str.contains(regex))
        if not scoped.is_empty():
            frames.append(scoped)

    if not frames:
        return df.head(0)
    if len(frames) == 1:
        return frames[0]
    return pl.concat(frames, how="diagonal")


def filter_sc_to_brand(
    df: pl.DataFrame,
    business_config: BusinessConfig,
    brand_name: str,
) -> pl.DataFrame:
    """Filter Search Console data by source alias and page regex."""
    if df.is_empty() or "source_alias" not in df.columns:
        return df.head(0)

    brand = get_brand_definition(business_config, brand_name)
    if brand is None:
        return df.head(0)

    frames: List[pl.DataFrame] = []
    for alias in brand.sources:
        source = business_config.sources.get(alias)
        if source is None or source[0] != "search_console":
            continue
        scoped = df.filter(pl.col("source_alias") == alias)
        filters = brand.filters.get(alias)
        regex = filters.page_regex if filters else ".*"
        if regex and regex != ".*":
            scoped = scoped.filter(pl.col("page").str.contains(regex))
        if not scoped.is_empty():
            frames.append(scoped)

    if not frames:
        return df.head(0)
    if len(frames) == 1:
        return frames[0]
    return pl.concat(frames, how="diagonal")


def _with_empty_brand_columns(df: pl.DataFrame) -> pl.DataFrame:
    if "brand" in df.columns and "brand_default_theme" in df.columns:
        return df.head(0)
    return df.head(0).with_columns(
        pl.lit(None, dtype=pl.String).alias("brand"),
        pl.lit(None, dtype=pl.String).alias("brand_default_theme"),
    )
