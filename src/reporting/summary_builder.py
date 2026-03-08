"""Build normalized client-facing summary data."""

from __future__ import annotations

import re
from typing import Iterable, List, Optional, Tuple

import polars as pl

from ..models import (
    BrandSection,
    ClientSummaryReport,
    InsightRow,
    LeadCorrectionSummary,
    PlatformThemeBreakdown,
    ReportingConfig,
    SpendingOverviewRow,
    ThemePerformanceRow,
    ThemeRule,
)

PLATFORM_LABELS = {
    "google_ads": "Google Ads",
    "meta": "Meta Ads",
}


def assign_brands(df: pl.DataFrame, reporting_config: ReportingConfig) -> pl.DataFrame:
    """Assign client-facing brands to campaign rows."""
    if df.is_empty():
        return df.with_columns(
            pl.lit(None, dtype=pl.String).alias("brand"),
            pl.lit(None, dtype=pl.String).alias("brand_default_theme"),
        )

    if not reporting_config.brand_rules:
        return df.with_columns(
            pl.lit(None, dtype=pl.String).alias("brand"),
            pl.lit(None, dtype=pl.String).alias("brand_default_theme"),
        )

    brands: List[Optional[str]] = []
    default_themes: List[Optional[str]] = []
    for row in df.iter_rows(named=True):
        brand, default_theme = _match_brand(
            str(row.get("platform", "")),
            str(row.get("source_account_id", "")),
            str(row.get("campaign_name", "")),
            reporting_config,
        )
        brands.append(brand)
        default_themes.append(default_theme)

    return df.with_columns(
        pl.Series("brand", brands, dtype=pl.String),
        pl.Series("brand_default_theme", default_themes, dtype=pl.String),
    )


def assign_themes(df: pl.DataFrame, reporting_config: ReportingConfig) -> pl.DataFrame:
    """Assign client-facing themes to campaign rows."""
    if df.is_empty():
        return df.with_columns(pl.lit("Unmapped").alias("theme"))

    working_df = df
    if "brand" not in working_df.columns:
        working_df = assign_brands(working_df, reporting_config)

    themes = [
        _match_theme(
            platform=str(row.get("platform", "")),
            brand=_normalize_optional_text(row.get("brand")),
            campaign_name=str(row.get("campaign_name", "")),
            brand_default_theme=_normalize_optional_text(row.get("brand_default_theme")),
            reporting_config=reporting_config,
        )
        for row in working_df.iter_rows(named=True)
    ]
    return working_df.with_columns(pl.Series("theme", themes))


def normalize_campaigns(
    campaigns_df: pl.DataFrame,
    conversion_actions_df: pl.DataFrame,
    reporting_config: ReportingConfig,
) -> Tuple[pl.DataFrame, List[LeadCorrectionSummary]]:
    """Normalize Google primary leads using conversion-action rules."""
    if campaigns_df.is_empty():
        return campaigns_df, []

    google_rules = reporting_config.primary_lead_rules.google_ads
    include = set(google_rules.include_conversion_actions)
    exclude = set(google_rules.exclude_conversion_actions)
    if conversion_actions_df.is_empty() or (not include and not exclude):
        return campaigns_df, []

    working_actions = conversion_actions_df
    if include:
        working_actions = working_actions.filter(pl.col("conversion_action_name").is_in(list(include)))
    elif exclude:
        working_actions = working_actions.filter(~pl.col("conversion_action_name").is_in(list(exclude)))

    if working_actions.is_empty():
        return campaigns_df, []

    normalized = (
        working_actions.group_by(["source_account_id", "date", "campaign_id"])
        .agg(pl.col("conversions").fill_null(0).sum().alias("normalized_primary_leads"))
    )

    normalized_campaigns = (
        campaigns_df.join(
            normalized,
            on=["source_account_id", "date", "campaign_id"],
            how="left",
        )
        .with_columns(
            pl.when(
                (pl.col("platform") == "google_ads")
                & pl.col("normalized_primary_leads").is_not_null()
            )
            .then(pl.col("normalized_primary_leads"))
            .otherwise(pl.col("conversions_primary"))
            .alias("conversions_primary")
        )
        .drop("normalized_primary_leads")
    )

    corrections = _build_google_corrections(campaigns_df, normalized_campaigns, include, exclude)
    return normalized_campaigns, corrections


def build_client_summary_report(
    client_id: str,
    current_df: pl.DataFrame,
    reporting_config: ReportingConfig,
    period_start: str,
    period_end: str,
    lead_corrections: Iterable[LeadCorrectionSummary] | None = None,
) -> ClientSummaryReport:
    """Build the structured client-facing summary model."""
    branded_df = assign_brands(current_df, reporting_config)
    themed_df = assign_themes(branded_df, reporting_config)

    spending_overview = _build_spending_overview(themed_df)
    brand_sections = _build_brand_sections(themed_df, reporting_config)
    if brand_sections:
        platform_breakdowns: List[PlatformThemeBreakdown] = []
        breakdown_contexts = [
            (section.brand, breakdown)
            for section in brand_sections
            for breakdown in section.platform_breakdowns
        ]
    else:
        platform_breakdowns = _build_platform_breakdowns(themed_df)
        breakdown_contexts = [(None, breakdown) for breakdown in platform_breakdowns]

    insights = _build_insights(breakdown_contexts)
    recommendations = _build_recommendations(breakdown_contexts)
    corrections = list(lead_corrections or [])
    data_notes = list(reporting_config.data_notes) + _format_correction_notes(corrections)

    return ClientSummaryReport(
        client_id=client_id,
        period_label=f"{period_start} to {period_end}",
        period_start=period_start,
        period_end=period_end,
        spending_overview=spending_overview,
        platform_breakdowns=platform_breakdowns,
        insights=insights,
        recommendations=recommendations,
        data_notes=data_notes,
        brand_sections=brand_sections,
        lead_corrections=corrections,
    )


def _match_brand(
    platform: str,
    source_account_id: str,
    campaign_name: str,
    reporting_config: ReportingConfig,
) -> Tuple[Optional[str], Optional[str]]:
    normalized_source_account_id = _normalize_account_id(source_account_id)

    for rule in reporting_config.brand_rules:
        if rule.platform != platform:
            continue
        if rule.source_account_ids:
            allowed_ids = {_normalize_account_id(item) for item in rule.source_account_ids}
            if normalized_source_account_id not in allowed_ids:
                continue
        if rule.campaign_name_regex and not re.search(
            rule.campaign_name_regex,
            campaign_name,
            flags=re.IGNORECASE,
        ):
            continue
        return rule.brand, rule.default_theme

    if reporting_config.brand_rules:
        return "Unmapped", None
    return None, None


def _match_theme(
    platform: str,
    brand: Optional[str],
    campaign_name: str,
    brand_default_theme: Optional[str],
    reporting_config: ReportingConfig,
) -> str:
    specific_rules = [
        rule
        for rule in reporting_config.theme_rules
        if rule.platform == platform and rule.brand is not None and rule.brand == brand
    ]
    generic_rules = [
        rule
        for rule in reporting_config.theme_rules
        if rule.platform == platform and rule.brand is None
    ]

    matched_theme = _match_theme_rules(specific_rules, campaign_name)
    if matched_theme:
        return matched_theme
    if brand_default_theme:
        return brand_default_theme
    matched_theme = _match_theme_rules(generic_rules, campaign_name)
    if matched_theme:
        return matched_theme
    return "Unmapped"


def _match_theme_rules(rules: List[ThemeRule], campaign_name: str) -> Optional[str]:
    for rule in rules:
        if re.search(rule.campaign_name_regex, campaign_name, flags=re.IGNORECASE):
            return rule.theme
    return None


def _build_spending_overview(df: pl.DataFrame) -> List[SpendingOverviewRow]:
    if df.is_empty():
        return []

    agg = (
        df.group_by(["platform", "currency"])
        .agg(pl.col("spend").fill_null(0).sum().alias("spend"))
        .sort("spend", descending=True)
    )
    total_spend = float(agg["spend"].sum()) if not agg.is_empty() else 0.0

    rows: List[SpendingOverviewRow] = []
    for row in agg.iter_rows(named=True):
        spend = float(row["spend"] or 0)
        rows.append(
            SpendingOverviewRow(
                platform=PLATFORM_LABELS.get(str(row["platform"]), str(row["platform"])),
                currency=str(row["currency"]),
                spend=spend,
                spend_pct=(spend / total_spend * 100) if total_spend > 0 else 0.0,
            )
        )
    return rows


def _build_brand_sections(
    df: pl.DataFrame,
    reporting_config: ReportingConfig,
) -> List[BrandSection]:
    if df.is_empty() or "brand" not in df.columns or not reporting_config.brand_rules:
        return []

    brand_df = df.filter(pl.col("brand").is_not_null())
    if brand_df.is_empty():
        return []

    brand_spend = {
        str(row["brand"]): float(row["spend"] or 0)
        for row in (
            brand_df.group_by("brand")
            .agg(pl.col("spend").fill_null(0).sum().alias("spend"))
            .iter_rows(named=True)
        )
    }

    configured_order: dict[str, int] = {}
    for rule in reporting_config.brand_rules:
        configured_order.setdefault(rule.brand, len(configured_order))

    brand_names = sorted(
        brand_spend,
        key=lambda brand: (
            configured_order.get(brand, len(configured_order)),
            -brand_spend.get(brand, 0.0),
            brand,
        ),
    )

    sections: List[BrandSection] = []
    for brand in brand_names:
        section_df = brand_df.filter(pl.col("brand") == brand)
        sections.append(
            BrandSection(
                brand=brand,
                total_spend=brand_spend.get(brand, 0.0),
                platform_breakdowns=_build_platform_breakdowns(section_df),
            )
        )
    return sections


def _build_platform_breakdowns(df: pl.DataFrame) -> List[PlatformThemeBreakdown]:
    if df.is_empty():
        return []

    breakdowns: List[PlatformThemeBreakdown] = []
    for (platform,), platform_df in df.group_by("platform"):
        currency = _first_currency(platform_df)
        total_spend = float(platform_df["spend"].fill_null(0).sum()) if "spend" in platform_df.columns else 0.0
        total_clicks = int(platform_df["clicks"].fill_null(0).sum()) if "clicks" in platform_df.columns else 0
        total_leads = float(platform_df["conversions_primary"].fill_null(0).sum()) if "conversions_primary" in platform_df.columns else 0.0
        platform_cpl = (total_spend / total_leads) if total_leads > 0 else None

        theme_agg = (
            platform_df.group_by("theme")
            .agg(
                pl.col("spend").fill_null(0).sum().alias("spend"),
                pl.col("clicks").fill_null(0).sum().alias("clicks"),
                pl.col("conversions_primary").fill_null(0).sum().alias("leads"),
            )
            .sort("spend", descending=True)
        )

        rows: List[ThemePerformanceRow] = []
        for row in theme_agg.iter_rows(named=True):
            spend = float(row["spend"] or 0)
            clicks = int(row["clicks"] or 0)
            leads = float(row["leads"] or 0)
            cvr = (leads / clicks * 100) if clicks > 0 else 0.0
            cpl = (spend / leads) if leads > 0 else None
            rows.append(
                ThemePerformanceRow(
                    theme=str(row["theme"]),
                    spend=spend,
                    spend_pct=(spend / total_spend * 100) if total_spend > 0 else 0.0,
                    clicks=clicks,
                    leads=leads,
                    cvr=cvr,
                    cpl=cpl,
                    assessment=_assess_theme(leads, spend, cpl, platform_cpl),
                )
            )

        breakdowns.append(
            PlatformThemeBreakdown(
                platform=PLATFORM_LABELS.get(str(platform), str(platform)),
                currency=currency,
                total_spend=total_spend,
                total_clicks=total_clicks,
                total_leads=total_leads,
                rows=rows,
            )
        )

    breakdowns.sort(key=lambda item: item.total_spend, reverse=True)
    return breakdowns


def _build_insights(
    breakdown_contexts: List[Tuple[Optional[str], PlatformThemeBreakdown]]
) -> List[InsightRow]:
    candidates: List[Tuple[Optional[str], PlatformThemeBreakdown, ThemePerformanceRow]] = []
    for brand, breakdown in breakdown_contexts:
        candidates.extend((brand, breakdown, row) for row in breakdown.rows)

    candidates.sort(
        key=lambda item: (
            0 if item[2].leads > 0 else 1,
            item[2].cpl if item[2].cpl is not None else float("inf"),
            -item[2].spend,
        )
    )

    insights: List[InsightRow] = []
    for index, (brand, breakdown, row) in enumerate(candidates[:6], start=1):
        insights.append(
            InsightRow(
                rank=index,
                brand=brand,
                platform=breakdown.platform,
                theme=row.theme,
                currency=breakdown.currency,
                spend=row.spend,
                leads=row.leads,
                cpl=row.cpl,
                assessment=row.assessment,
            )
        )
    return insights


def _build_recommendations(
    breakdown_contexts: List[Tuple[Optional[str], PlatformThemeBreakdown]]
) -> List[str]:
    recommendations: List[str] = []
    best_row: Tuple[Optional[str], PlatformThemeBreakdown, ThemePerformanceRow] | None = None
    zero_conv_rows: List[Tuple[Optional[str], PlatformThemeBreakdown, ThemePerformanceRow]] = []
    expensive_rows: List[Tuple[Optional[str], PlatformThemeBreakdown, ThemePerformanceRow]] = []

    for brand, breakdown in breakdown_contexts:
        platform_cpl = (
            breakdown.total_spend / breakdown.total_leads if breakdown.total_leads > 0 else None
        )
        for row in breakdown.rows:
            if row.leads > 0 and (
                best_row is None or (row.cpl or float("inf")) < (best_row[2].cpl or float("inf"))
            ):
                best_row = (brand, breakdown, row)
            if row.leads == 0 and row.spend_pct >= 10:
                zero_conv_rows.append((brand, breakdown, row))
            if platform_cpl and row.cpl and row.cpl >= platform_cpl * 2 and row.spend_pct >= 15:
                expensive_rows.append((brand, breakdown, row))

    if best_row:
        brand, breakdown, row = best_row
        recommendations.append(
            f"Scale {_format_target(brand, breakdown.platform, row.theme)} - best CPL at {breakdown.currency} {row.cpl:,.2f}."
        )

    for brand, breakdown, row in zero_conv_rows[:1]:
        recommendations.append(
            f"Investigate {_format_target(brand, breakdown.platform, row.theme)} - {breakdown.currency} {row.spend:,.2f} spent with no primary leads."
        )

    for brand, breakdown, row in expensive_rows[:1]:
        recommendations.append(
            f"Review {_format_target(brand, breakdown.platform, row.theme)} - CPL at {breakdown.currency} {row.cpl:,.2f} is materially above the platform average."
        )

    if not recommendations:
        recommendations.append("Maintain the current budget split while monitoring theme-level lead efficiency.")

    return recommendations[:4]


def _format_target(brand: Optional[str], platform: str, theme: str) -> str:
    if brand:
        return f"{brand} on {platform} ({theme})"
    return f"{platform} {theme}"


def _assess_theme(
    leads: float,
    spend: float,
    cpl: float | None,
    platform_cpl: float | None,
) -> str:
    if leads <= 0 and spend > 0:
        return "Needs review"
    if cpl is None:
        return "No leads yet"
    if platform_cpl is None:
        return "Early signal"
    if cpl <= platform_cpl * 0.75:
        return "Top performer"
    if cpl >= platform_cpl * 1.5:
        return "High CPL"
    return "Stable"


def _format_correction_notes(corrections: Iterable[LeadCorrectionSummary]) -> List[str]:
    notes: List[str] = []
    for correction in corrections:
        context = ""
        if correction.excluded_actions:
            context = f" after excluding {', '.join(correction.excluded_actions)}"
        elif correction.included_actions:
            context = f" using only {', '.join(correction.included_actions)}"
        notes.append(
            f"{correction.platform} lead correction: reported {correction.reported_leads:,.0f} primary leads, normalized to {correction.normalized_leads:,.0f}{context}."
        )
    return notes


def _build_google_corrections(
    raw_campaigns: pl.DataFrame,
    normalized_campaigns: pl.DataFrame,
    include: set[str],
    exclude: set[str],
) -> List[LeadCorrectionSummary]:
    raw_google = raw_campaigns.filter(pl.col("platform") == "google_ads")
    normalized_google = normalized_campaigns.filter(pl.col("platform") == "google_ads")
    if raw_google.is_empty() or normalized_google.is_empty():
        return []

    reported = float(raw_google["conversions_primary"].fill_null(0).sum())
    normalized = float(normalized_google["conversions_primary"].fill_null(0).sum())
    if abs(reported - normalized) < 1e-6:
        return []

    return [
        LeadCorrectionSummary(
            platform=PLATFORM_LABELS["google_ads"],
            reported_leads=reported,
            normalized_leads=normalized,
            excluded_actions=sorted(exclude),
            included_actions=sorted(include),
        )
    ]


def _first_currency(df: pl.DataFrame) -> str:
    if df.is_empty() or "currency" not in df.columns:
        return "USD"
    currencies = df["currency"].drop_nulls().unique().to_list()
    return str(currencies[0]) if currencies else "USD"


def _normalize_account_id(value: str) -> str:
    return str(value).strip().replace("-", "").lower()


def _normalize_optional_text(value: object) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
