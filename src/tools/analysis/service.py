"""Source sync and analysis services."""

from __future__ import annotations

import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import polars as pl
from google.ads.googleads.client import GoogleAdsClient
from rich.console import Console

from src.analyzers.impression_share import ImpressionShareAnalyzer
from src.analyzers.organic_search import OrganicSearchAnalyzer
from src.analyzers.quality_score import QualityScoreAnalyzer
from src.analyzers.search_terms import SearchTermsAnalyzer
from src.analyzers.trends import TrendAnalyzer
from src.analyzers.web_quality import WebQualityAnalyzer
from src.credentials import CredentialManager
from src.date_utils import calculate_previous_period
from src.integrations.ga4 import GA4Fetcher
from src.integrations.google_ads import GoogleAdsFetcher
from src.integrations.meta import MetaAdsFetcher
from src.integrations.search_console import SearchConsoleFetcher
from src.models import AnalysisResults, BusinessConfig
from src.reporting import (
    canonicalize_brand_name,
    compute_kpi_summary,
    filter_to_brand,
    normalize_campaigns,
)
from src.storage import StorageManager

logger = logging.getLogger(__name__)
console = Console(stderr=True)


def init_google_ads_client(
    cred_manager: CredentialManager,
) -> Optional[GoogleAdsClient]:
    """Initialize Google Ads API client from env credentials."""
    if not cred_manager.has_google_ads_credentials():
        return None

    google_creds = cred_manager.get_google_ads_credentials()
    ga_config: Dict[str, Any] = {
        "developer_token": google_creds.get("developer_token"),
        "client_id": google_creds.get("client_id"),
        "client_secret": google_creds.get("client_secret"),
        "refresh_token": google_creds.get("refresh_token"),
        "use_proto_plus": True,
    }

    manager_id = os.getenv("GOOGLE_ADS_MANAGER_ID")
    if manager_id:
        ga_config["login_customer_id"] = manager_id.replace("-", "")

    try:
        return GoogleAdsClient.load_from_dict(ga_config)
    except Exception as exc:
        console.print(f"[red]  Failed to initialize Google Ads client: {exc}[/red]")
        return None


def list_configured_sources(client_id: str, business_config: BusinessConfig) -> List[Dict[str, Any]]:
    """Return configured sources for a client."""
    rows: List[Dict[str, Any]] = []
    for alias, source in business_config.sources.google_ads.items():
        rows.append(
            {
                "client_id": client_id,
                "source_alias": alias,
                "source_type": "google_ads",
                "identifier": source.customer_id,
            }
        )
    for alias, source in business_config.sources.meta.items():
        rows.append(
            {
                "client_id": client_id,
                "source_alias": alias,
                "source_type": "meta",
                "identifier": source.account_id,
            }
        )
    for alias, source in business_config.sources.ga4.items():
        rows.append(
            {
                "client_id": client_id,
                "source_alias": alias,
                "source_type": "ga4",
                "identifier": source.property_id,
            }
        )
    for alias, source in business_config.sources.search_console.items():
        rows.append(
            {
                "client_id": client_id,
                "source_alias": alias,
                "source_type": "search_console",
                "identifier": source.site_url,
            }
        )
    return rows


def get_data_freshness(client_id: str, data_dir: str = "data") -> Dict[str, str]:
    """Return latest parquet timestamp per data type for a client."""
    freshness: Dict[str, str] = {}
    client_dir = Path(data_dir) / client_id
    if not client_dir.exists():
        return freshness

    for dt_dir in sorted(client_dir.iterdir()):
        if not dt_dir.is_dir():
            continue
        parquets = sorted(dt_dir.glob("*.parquet"))
        if not parquets:
            continue
        latest = parquets[-1]
        freshness[dt_dir.name] = datetime.fromtimestamp(
            latest.stat().st_mtime,
            tz=timezone.utc,
        ).astimezone().isoformat(timespec="seconds")

    return freshness


def sync_client_data(
    client_id: str,
    business_config: BusinessConfig,
    start_date: date,
    end_date: date,
    storage: StorageManager,
    cred_manager: CredentialManager,
    requested_sources: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Fetch configured source data and persist it to storage."""
    console.print("[yellow]Phase 1: Syncing data...[/yellow]")

    requested = {item.strip() for item in requested_sources or [] if item.strip()}
    counts: List[Dict[str, Any]] = []

    def wants(source_type: str, alias: str) -> bool:
        if not requested:
            return True
        return source_type in requested or alias in requested

    ga_client = init_google_ads_client(cred_manager)
    if business_config.sources.google_ads and ga_client:
        for alias, source in business_config.sources.google_ads.items():
            if not wants("google_ads", alias):
                continue
            fetcher = GoogleAdsFetcher(ga_client, alias, source.customer_id)
            search_terms = fetcher.fetch_search_terms(client_id, start_date, end_date)
            storage.append(client_id, "search_terms", search_terms)
            impression_share = fetcher.fetch_impression_share(client_id, start_date, end_date)
            storage.append(client_id, "impression_share", impression_share)
            quality_scores = fetcher.fetch_quality_scores(client_id, start_date, end_date)
            storage.append(client_id, "quality_scores", quality_scores)
            campaigns = fetcher.fetch_campaign_performance(client_id, start_date, end_date)
            storage.append(client_id, "campaigns", campaigns)
            conversion_actions = fetcher.fetch_conversion_actions(client_id, start_date, end_date)
            storage.append(client_id, "conversion_actions", conversion_actions)
            counts.append(
                {
                    "source_alias": alias,
                    "source_type": "google_ads",
                    "search_terms": len(search_terms),
                    "impression_share": len(impression_share),
                    "quality_scores": len(quality_scores),
                    "campaigns": len(campaigns),
                    "conversion_actions": len(conversion_actions),
                }
            )
    elif business_config.sources.google_ads and not requested:
        console.print("[yellow]  Skipping Google Ads sync (missing credentials)[/yellow]")

    if business_config.sources.meta:
        if not cred_manager.has_meta_credentials():
            if not requested:
                console.print("[yellow]  Skipping Meta sync (missing credentials)[/yellow]")
        else:
            from facebook_business.api import FacebookAdsApi  # type: ignore

            meta_creds = cred_manager.get_meta_credentials()
            api = FacebookAdsApi.init(
                access_token=meta_creds.get("access_token"),
                api_version="v22.0",
            )
            for alias, source in business_config.sources.meta.items():
                if not wants("meta", alias):
                    continue
                fetcher = MetaAdsFetcher(
                    api,
                    alias,
                    source.account_id,
                    include_action_types=business_config.lead_rules.meta.include_action_types,
                )
                campaigns = fetcher.fetch_campaign_performance(client_id, start_date, end_date)
                storage.append(client_id, "campaigns", campaigns)
                counts.append(
                    {
                        "source_alias": alias,
                        "source_type": "meta",
                        "campaigns": len(campaigns),
                    }
                )

    if business_config.sources.ga4 and cred_manager.has_google_service_account():
        credentials = cred_manager.get_google_service_account_credentials()
        for alias, source in business_config.sources.ga4.items():
            if not wants("ga4", alias):
                continue
            fetcher = GA4Fetcher(credentials, alias, source.property_id)
            records = fetcher.fetch_landing_pages(client_id, start_date, end_date)
            storage.append(client_id, "ga4_landing_pages", records)
            counts.append(
                {
                    "source_alias": alias,
                    "source_type": "ga4",
                    "ga4_landing_pages": len(records),
                }
            )
    elif business_config.sources.ga4 and not requested:
        console.print("[yellow]  Skipping GA4 sync (no service account)[/yellow]")

    if business_config.sources.search_console and cred_manager.has_google_service_account():
        credentials = cred_manager.get_google_service_account_credentials()
        for alias, source in business_config.sources.search_console.items():
            if not wants("search_console", alias):
                continue
            fetcher = SearchConsoleFetcher(credentials, alias, source.site_url)
            rows = fetcher.fetch_search_analytics(client_id, start_date, end_date)
            storage.append(client_id, "search_console_search_analytics", rows)
            counts.append(
                {
                    "source_alias": alias,
                    "source_type": "search_console",
                    "search_console_rows": len(rows),
                }
            )
    elif business_config.sources.search_console and not requested:
        console.print("[yellow]  Skipping Search Console sync (no service account)[/yellow]")

    return {
        "client_id": client_id,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "sources": counts,
        "status": "complete",
    }


def run_analysis(
    client_id: str,
    business_config: BusinessConfig,
    current_start: date,
    current_end: date,
    storage: StorageManager,
    is_monthly: bool = True,
    context: Optional[Dict[str, Any]] = None,
    brand: str | None = None,
) -> Optional[AnalysisResults]:
    """Run analysis over stored source data."""
    console.print("\n[yellow]Phase 2: Analyzing data...[/yellow]")

    previous_start, previous_end = calculate_previous_period(
        current_start, current_end, is_monthly
    )
    selected_brand = canonicalize_brand_name(business_config, brand) if brand else None
    if brand and selected_brand is None:
        raise ValueError(f"Unknown brand '{brand}' for client '{client_id}'.")

    search_terms_df = storage.read(client_id, "search_terms", current_start, current_end)
    impression_share_df = storage.read(client_id, "impression_share", current_start, current_end)
    quality_scores_df = storage.read(client_id, "quality_scores", current_start, current_end)
    raw_campaigns_all = storage.read(client_id, "campaigns", previous_start, current_end)
    conversion_actions_all = storage.read(client_id, "conversion_actions", previous_start, current_end)

    campaigns_all, _ = normalize_campaigns(raw_campaigns_all, conversion_actions_all, business_config)
    if selected_brand:
        _, campaigns_all = filter_to_brand(campaigns_all, business_config, selected_brand)
        _, search_terms_df = filter_to_brand(
            search_terms_df,
            business_config,
            selected_brand,
            default_platform="google_ads",
        )
        _, impression_share_df = filter_to_brand(
            impression_share_df,
            business_config,
            selected_brand,
            default_platform="google_ads",
        )
        _, quality_scores_df = filter_to_brand(
            quality_scores_df,
            business_config,
            selected_brand,
            default_platform="google_ads",
        )

    ga4_df = storage.read(client_id, "ga4_landing_pages", current_start, current_end)
    if selected_brand and not ga4_df.is_empty():
        from src.reporting.brand_scope import filter_ga4_to_brand

        ga4_df = filter_ga4_to_brand(ga4_df, business_config, selected_brand)

    sc_df = storage.read(client_id, "search_console_search_analytics", current_start, current_end)
    brand_terms: List[str] = []
    if selected_brand and not sc_df.is_empty():
        from src.reporting.brand_scope import filter_sc_to_brand, get_brand_definition

        sc_df = filter_sc_to_brand(sc_df, business_config, selected_brand)
        brand_def = get_brand_definition(business_config, selected_brand)
        if brand_def:
            for alias in brand_def.sources:
                filt = brand_def.filters.get(alias)
                if filt and filt.brand_terms:
                    brand_terms.extend(filt.brand_terms)

    campaigns_current = (
        campaigns_all.filter((pl.col("date") >= current_start) & (pl.col("date") <= current_end))
        if not campaigns_all.is_empty()
        else campaigns_all
    )

    if (
        search_terms_df.is_empty()
        and impression_share_df.is_empty()
        and quality_scores_df.is_empty()
        and campaigns_current.is_empty()
        and ga4_df.is_empty()
        and sc_df.is_empty()
    ):
        console.print("[yellow]No stored data found for this client/date range.[/yellow]")
        return None

    st_analyzer = SearchTermsAnalyzer(search_terms_df)
    neg_keywords = st_analyzer.get_negative_keyword_candidates()
    top_search_terms = st_analyzer.get_top_performers(limit=10)
    match_type_breakdown = st_analyzer.get_match_type_distribution()
    search_term_summary = st_analyzer.summarize_search_terms()
    console.print(f"  Identified {search_term_summary.get('zero_conversion_terms', 0)} zero-conversion search terms")

    is_analyzer = ImpressionShareAnalyzer(impression_share_df)
    lost_is = is_analyzer.get_lost_opportunities()
    budget_recs = is_analyzer.get_budget_recommendations()
    is_summary = is_analyzer.summarize_impression_share()
    console.print(f"  Found {len(is_summary)} campaigns with impression share data")

    qs_analyzer = QualityScoreAnalyzer(quality_scores_df)
    qs_changes = qs_analyzer.get_qs_changes()
    qs_summaries = qs_analyzer.summarize_quality_scores()
    qs_distribution = qs_analyzer.get_distribution()
    console.print(f"  Summarized {len(qs_summaries)} keyword quality scores")

    trend_analyzer = TrendAnalyzer(campaigns_current)
    leads_trend = trend_analyzer.calculate_trends("conversions_primary")
    clicks_trend = trend_analyzer.calculate_trends("clicks")
    anomalies = trend_analyzer.detect_anomalies("conversions_primary")
    leads_forecast = trend_analyzer.forecast("conversions_primary")
    console.print(f"  Detected {len(anomalies)} anomalies")

    web_quality = None
    if not ga4_df.is_empty():
        wq_analyzer = WebQualityAnalyzer(ga4_df)
        web_quality = wq_analyzer.analyze()
        if web_quality:
            console.print(f"  GA4: {web_quality.summary.get('total_sessions', 0)} sessions analyzed")

    organic_search = None
    if not sc_df.is_empty():
        os_analyzer = OrganicSearchAnalyzer(sc_df, brand_terms=brand_terms)
        organic_search = os_analyzer.analyze()
        if organic_search:
            console.print(
                f"  Search Console: {organic_search.summary.get('total_clicks', 0)} clicks, "
                f"{organic_search.summary.get('unique_queries', 0)} queries"
            )

    kpi_summary = (
        compute_kpi_summary(
            campaigns_all=campaigns_all,
            current_start=current_start,
            current_end=current_end,
            previous_start=previous_start,
            previous_end=previous_end,
            neg_keywords_count=len(neg_keywords),
        )
        if not campaigns_all.is_empty()
        else {
            "period_current": f"{current_start.isoformat()} to {current_end.isoformat()}",
            "period_previous": f"{previous_start.isoformat()} to {previous_end.isoformat()}",
        }
    )

    currency = ""
    if not campaigns_current.is_empty() and "currency" in campaigns_current.columns:
        first_currency = campaigns_current.select("currency").row(0)[0]
        if first_currency:
            currency = first_currency

    # Load knowledge.md and memory for the data package
    knowledge_path = Path("data") / client_id / "knowledge.md"
    knowledge_text = knowledge_path.read_text(encoding="utf-8") if knowledge_path.exists() else None

    from src.tools.memory import MemoryStore

    memory_store = MemoryStore()
    memory_rows = memory_store.list_records(client_id, brand=selected_brand)
    memory_summary: Dict[str, Any] = {
        "total_records": len(memory_rows),
        "recent": memory_rows[-10:] if memory_rows else [],
    }

    return AnalysisResults(
        client_id=client_id,
        period_current=f"{current_start.isoformat()} to {current_end.isoformat()}",
        period_previous=f"{previous_start.isoformat()} to {previous_end.isoformat()}",
        currency=currency,
        scope="brand" if selected_brand else "client",
        brand=selected_brand,
        context=context or {},
        kpi_summary=kpi_summary,
        web_quality=web_quality,
        organic_search=organic_search,
        negative_keywords=neg_keywords,
        top_search_terms=top_search_terms,
        match_type_breakdown=match_type_breakdown,
        lost_impression_share=lost_is,
        budget_recommendations=budget_recs,
        qs_changes=qs_changes,
        qs_summaries=qs_summaries,
        low_qs_alerts=qs_summaries,
        qs_distribution=qs_distribution,
        trends=[leads_trend, clicks_trend],
        anomalies=anomalies,
        forecasts=[leads_forecast],
        search_term_summary=search_term_summary,
        impression_share_summary=is_summary,
        knowledge=knowledge_text,
        memory_summary=memory_summary,
    )
