"""KPI calculation utilities for ads report automation."""

from datetime import date
from typing import Any, Dict, List, Optional

import polars as pl


def pct_change(current: float, previous: float) -> Optional[float]:
    """Calculate percentage change between two values."""
    if previous == 0:
        return 0.0 if current == 0 else None
    return ((current - previous) / previous) * 100


def safe_sum(df: pl.DataFrame, column: str) -> float:
    """Safely sum a dataframe column."""
    if df.is_empty() or column not in df.columns:
        return 0.0
    return float(df[column].fill_null(0).sum())


def safe_int_sum(df: pl.DataFrame, column: str) -> int:
    """Safely sum a dataframe column as an integer."""
    if df.is_empty() or column not in df.columns:
        return 0
    return int(df[column].fill_null(0).sum())


def compute_currency_breakdown(df: pl.DataFrame) -> List[Dict[str, Any]]:
    """Aggregate metrics by currency."""
    if df.is_empty() or "currency" not in df.columns:
        return []

    working_df = df
    if "conversions_secondary" not in working_df.columns:
        working_df = working_df.with_columns(pl.lit(0.0).alias("conversions_secondary"))

    agg = (
        working_df.group_by("currency")
        .agg(
            pl.col("spend").fill_null(0).sum().alias("spend"),
            pl.col("impressions").fill_null(0).sum().alias("impressions"),
            pl.col("clicks").fill_null(0).sum().alias("clicks"),
            pl.col("conversions_primary").fill_null(0).sum().alias("leads_primary"),
            pl.col("conversions_secondary").fill_null(0).sum().alias("conversions_secondary"),
        )
        .sort("spend", descending=True)
    )
    return list(agg.iter_rows(named=True))


def compute_platform_currency_breakdown(df: pl.DataFrame) -> List[Dict[str, Any]]:
    """Aggregate metrics by platform and currency."""
    if df.is_empty() or "platform" not in df.columns or "currency" not in df.columns:
        return []

    working_df = df
    if "conversions_secondary" not in working_df.columns:
        working_df = working_df.with_columns(pl.lit(0.0).alias("conversions_secondary"))

    agg = (
        working_df.group_by(["platform", "currency"])
        .agg(
            pl.col("spend").fill_null(0).sum().alias("spend"),
            pl.col("impressions").fill_null(0).sum().alias("impressions"),
            pl.col("clicks").fill_null(0).sum().alias("clicks"),
            pl.col("conversions_primary").fill_null(0).sum().alias("leads_primary"),
            pl.col("conversions_secondary").fill_null(0).sum().alias("conversions_secondary"),
        )
        .sort("spend", descending=True)
    )

    rows: List[Dict[str, Any]] = []
    for row in agg.iter_rows(named=True):
        spend = float(row["spend"] or 0)
        clicks = int(row["clicks"] or 0)
        rows.append({**row, "cpc": (spend / clicks) if clicks > 0 else 0.0})
    return rows


def compute_kpi_summary(
    campaigns_all: pl.DataFrame,
    current_start: date,
    current_end: date,
    previous_start: date,
    previous_end: date,
    neg_keywords_count: int,
) -> Dict[str, Any]:
    """Compute the internal KPI summary comparing current vs previous period."""
    current_df = campaigns_all.filter((pl.col("date") >= current_start) & (pl.col("date") <= current_end))
    previous_df = campaigns_all.filter((pl.col("date") >= previous_start) & (pl.col("date") <= previous_end))

    clicks_current = safe_int_sum(current_df, "clicks")
    clicks_previous = safe_int_sum(previous_df, "clicks")
    impressions_current = safe_int_sum(current_df, "impressions")
    impressions_previous = safe_int_sum(previous_df, "impressions")
    leads_primary_current = safe_sum(current_df, "conversions_primary")
    leads_primary_previous = safe_sum(previous_df, "conversions_primary")
    conversions_secondary_current = safe_sum(current_df, "conversions_secondary")
    conversions_secondary_previous = safe_sum(previous_df, "conversions_secondary")

    ctr_current = (clicks_current / impressions_current * 100) if impressions_current > 0 else 0.0
    ctr_previous = (clicks_previous / impressions_previous * 100) if impressions_previous > 0 else 0.0
    cvr_current = (leads_primary_current / clicks_current * 100) if clicks_current > 0 else 0.0
    cvr_previous = (leads_primary_previous / clicks_previous * 100) if clicks_previous > 0 else 0.0

    return {
        "period_current": f"{current_start.isoformat()} to {current_end.isoformat()}",
        "period_previous": f"{previous_start.isoformat()} to {previous_end.isoformat()}",
        "impressions_current": impressions_current,
        "impressions_previous": impressions_previous,
        "impressions_change": pct_change(float(impressions_current), float(impressions_previous)),
        "clicks_current": clicks_current,
        "clicks_previous": clicks_previous,
        "clicks_change": pct_change(float(clicks_current), float(clicks_previous)),
        "leads_primary_current": leads_primary_current,
        "leads_primary_previous": leads_primary_previous,
        "leads_primary_change": pct_change(leads_primary_current, leads_primary_previous),
        "conversions_secondary_current": conversions_secondary_current,
        "conversions_secondary_previous": conversions_secondary_previous,
        "conversions_secondary_change": pct_change(
            conversions_secondary_current,
            conversions_secondary_previous,
        ),
        "ctr_current": ctr_current,
        "ctr_previous": ctr_previous,
        "ctr_change": pct_change(ctr_current, ctr_previous),
        "cvr_current": cvr_current,
        "cvr_previous": cvr_previous,
        "cvr_change": pct_change(cvr_current, cvr_previous),
        "currency_breakdown_current": compute_currency_breakdown(current_df),
        "currency_breakdown_previous": compute_currency_breakdown(previous_df),
        "platform_currency_breakdown_current": compute_platform_currency_breakdown(current_df),
        "platform_currency_breakdown_previous": compute_platform_currency_breakdown(previous_df),
        "findings": [
            f"Primary leads: {leads_primary_current:,.0f}",
            f"Google secondary conversions: {conversions_secondary_current:,.0f}",
            f"Negative keyword candidates: {neg_keywords_count:,}",
        ],
    }
