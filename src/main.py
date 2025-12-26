"""Main CLI for ads report automation (AI-ready analytics pipeline)."""

import logging
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

import click
import polars as pl
from rich.console import Console

from google.ads.googleads.client import GoogleAdsClient

from src.analyzers.impression_share import ImpressionShareAnalyzer
from src.analyzers.quality_score import QualityScoreAnalyzer
from src.analyzers.search_terms import SearchTermsAnalyzer
from src.analyzers.trends import TrendAnalyzer
from src.config import ConfigManager
from src.credentials import CredentialManager
from src.date_selector import month_to_date_range, select_year_and_month
from src.fetchers.google_ads import GoogleAdsFetcher
from src.report import MarkdownReportGenerator
from src.storage import StorageManager

LOG_DIR = Path("logs")
LOG_DIR.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.FileHandler(LOG_DIR / "ads_report.log"),
        logging.StreamHandler(),
    ],
)
logger = logging.getLogger(__name__)

console = Console()


def _pct_change(current: float, previous: float) -> Optional[float]:
    if previous == 0:
        return 0.0 if current == 0 else None
    return ((current - previous) / previous) * 100


def _safe_sum(df: pl.DataFrame, column: str) -> float:
    if df.is_empty() or column not in df.columns:
        return 0.0
    return float(df[column].fill_null(0).sum())


def _safe_int_sum(df: pl.DataFrame, column: str) -> int:
    if df.is_empty() or column not in df.columns:
        return 0
    return int(df[column].fill_null(0).sum())


def _compute_currency_breakdown(df: pl.DataFrame) -> List[Dict[str, Any]]:
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


def _compute_platform_currency_breakdown(df: pl.DataFrame) -> List[Dict[str, Any]]:
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
        rows.append(
            {
                **row,
                "cpc": (spend / clicks) if clicks > 0 else 0.0,
            }
        )
    return rows


def _compute_kpi_summary(
    campaigns_all: pl.DataFrame,
    current_start: date,
    current_end: date,
    previous_start: date,
    previous_end: date,
    neg_keywords_count: int,
) -> Dict[str, Any]:
    current_df = campaigns_all.filter((pl.col("date") >= current_start) & (pl.col("date") <= current_end))
    previous_df = campaigns_all.filter((pl.col("date") >= previous_start) & (pl.col("date") <= previous_end))

    clicks_current = _safe_int_sum(current_df, "clicks")
    clicks_previous = _safe_int_sum(previous_df, "clicks")


    impressions_current = _safe_int_sum(current_df, "impressions")
    impressions_previous = _safe_int_sum(previous_df, "impressions")

    leads_primary_current = _safe_sum(current_df, "conversions_primary")
    leads_primary_previous = _safe_sum(previous_df, "conversions_primary")

    conversions_secondary_current = _safe_sum(current_df, "conversions_secondary")
    conversions_secondary_previous = _safe_sum(previous_df, "conversions_secondary")

    ctr_current = (clicks_current / impressions_current * 100) if impressions_current > 0 else 0.0
    ctr_previous = (clicks_previous / impressions_previous * 100) if impressions_previous > 0 else 0.0

    cvr_current = (leads_primary_current / clicks_current * 100) if clicks_current > 0 else 0.0
    cvr_previous = (leads_primary_previous / clicks_previous * 100) if clicks_previous > 0 else 0.0

    return {
        "period_current": f"{current_start.isoformat()} to {current_end.isoformat()}",
        "period_previous": f"{previous_start.isoformat()} to {previous_end.isoformat()}",
        "impressions_current": impressions_current,
        "impressions_previous": impressions_previous,
        "impressions_change": _pct_change(float(impressions_current), float(impressions_previous)),
        "clicks_current": clicks_current,
        "clicks_previous": clicks_previous,
        "clicks_change": _pct_change(float(clicks_current), float(clicks_previous)),
        "leads_primary_current": leads_primary_current,
        "leads_primary_previous": leads_primary_previous,
        "leads_primary_change": _pct_change(leads_primary_current, leads_primary_previous),
        "conversions_secondary_current": conversions_secondary_current,
        "conversions_secondary_previous": conversions_secondary_previous,
        "conversions_secondary_change": _pct_change(conversions_secondary_current, conversions_secondary_previous),
        "ctr_current": ctr_current,
        "ctr_previous": ctr_previous,
        "ctr_change": _pct_change(ctr_current, ctr_previous),
        "cvr_current": cvr_current,
        "cvr_previous": cvr_previous,
        "cvr_change": _pct_change(cvr_current, cvr_previous),
        "currency_breakdown_current": _compute_currency_breakdown(current_df),
        "currency_breakdown_previous": _compute_currency_breakdown(previous_df),
        "platform_currency_breakdown_current": _compute_platform_currency_breakdown(current_df),
        "platform_currency_breakdown_previous": _compute_platform_currency_breakdown(previous_df),
        "findings": [
            f"Primary leads: {leads_primary_current:,.0f}",
            f"Google secondary conversions: {conversions_secondary_current:,.0f}",
            f"Data from {len(current_df)} campaign records" if not current_df.is_empty() else "No campaign data available",
        ],
    }


def _init_google_ads_client(cred_manager: CredentialManager) -> Optional[GoogleAdsClient]:
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
        console.print(f"[red]  ❌ Failed to initialize Google Ads client: {exc}[/red]")
        return None


def _fetch_google_ads(client_id: str, client_config: Dict[str, Any], start_date: date, end_date: date, storage: StorageManager, ga_client: GoogleAdsClient) -> None:
    customer_ids = client_config.get("google_ads", {}).get("customer_ids", [])
    for customer_id in customer_ids:
        fetcher = GoogleAdsFetcher(ga_client, customer_id)

        search_terms = fetcher.fetch_search_terms(client_id, start_date, end_date)
        storage.append(client_id, "search_terms", search_terms)
        console.print(f"  ✓ Fetched {len(search_terms)} search terms ({customer_id})")

        impression_share = fetcher.fetch_impression_share(client_id, start_date, end_date)
        storage.append(client_id, "impression_share", impression_share)
        console.print(f"  ✓ Fetched {len(impression_share)} impression share records ({customer_id})")

        quality_scores = fetcher.fetch_quality_scores(client_id, start_date, end_date)
        storage.append(client_id, "quality_scores", quality_scores)
        console.print(f"  ✓ Fetched {len(quality_scores)} quality score records ({customer_id})")

        campaigns = fetcher.fetch_campaign_performance(client_id, start_date, end_date)
        storage.append(client_id, "campaigns", campaigns)
        console.print(f"  ✓ Fetched {len(campaigns)} campaign performance records ({customer_id})")


def _fetch_meta(client_id: str, client_config: Dict[str, Any], start_date: date, end_date: date, storage: StorageManager, cred_manager: CredentialManager) -> None:
    if not cred_manager.has_meta_credentials():
        console.print("[yellow]  ⚠️  Skipping Meta fetch (missing credentials)[/yellow]")
        return

    meta_config = client_config.get("meta", {})
    ad_accounts = meta_config.get("ad_accounts", [])
    if not ad_accounts:
        return

    try:
        from facebook_business.api import FacebookAdsApi  # type: ignore
        from src.fetchers.meta_ads import MetaAdsFetcher
    except ImportError as exc:
        console.print(f"[red]  ❌ Meta SDK not available: {exc}[/red]")
        return

    meta_creds = cred_manager.get_meta_credentials()
    api = FacebookAdsApi.init(access_token=meta_creds.get("access_token"), api_version="v22.0")

    for account in ad_accounts:
        account_id = account.get("id")
        if not account_id:
            continue

        fetcher = MetaAdsFetcher(api, account_id)
        campaigns = fetcher.fetch_campaign_performance(client_id, start_date, end_date)
        storage.append(client_id, "campaigns", campaigns)
        console.print(f"  ✓ Fetched {len(campaigns)} Meta campaign performance records ({account_id})")


def _process_client(
    client_id: str,
    client_config: Dict[str, Any],
    current_start: date,
    current_end: date,
    storage: StorageManager,
    report_generator: MarkdownReportGenerator,
    cred_manager: CredentialManager,
    no_fetch: bool,
    is_monthly: bool = True,
) -> None:
    console.print(f"[blue]📋 Processing {client_id}[/blue]\n")

    period_days = (current_end - current_start).days + 1

    # For monthly reports, compare to previous month (month-over-month)
    # For custom day ranges, compare to previous period
    if is_monthly:
        # Month-over-month comparison: previous full month
        previous_end = current_start - timedelta(days=1)
        # Get the start of the previous month
        if current_start.month == 1:
            # If current month is January, previous month is December of previous year
            previous_start = date(current_start.year - 1, 12, 1)
        else:
            previous_start = date(current_start.year, current_start.month - 1, 1)
    else:
        # Previous period comparison (relative to current period)
        previous_end = current_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=period_days - 1)

    if not no_fetch:
        console.print("[yellow]Phase 1: Fetching data...[/yellow]")

        ga_client = _init_google_ads_client(cred_manager)
        if "google_ads" in client_config and ga_client:
            _fetch_google_ads(client_id, client_config, current_start, current_end, storage, ga_client)
        elif "google_ads" in client_config:
            console.print("[yellow]  ⚠️  Skipping Google Ads fetch (missing credentials)[/yellow]")

        if "meta" in client_config:
            _fetch_meta(client_id, client_config, current_start, current_end, storage, cred_manager)

    console.print("\n[yellow]Phase 2: Analyzing data...[/yellow]")

    search_terms_df = storage.read(client_id, "search_terms", current_start, current_end)
    impression_share_df = storage.read(client_id, "impression_share", current_start, current_end)
    quality_scores_df = storage.read(client_id, "quality_scores", current_start, current_end)
    campaigns_all = storage.read(client_id, "campaigns", previous_start, current_end)

    campaigns_current = campaigns_all.filter((pl.col("date") >= current_start) & (pl.col("date") <= current_end)) if not campaigns_all.is_empty() else campaigns_all

    if search_terms_df.is_empty() and impression_share_df.is_empty() and quality_scores_df.is_empty() and campaigns_current.is_empty():
        console.print("[yellow]⚠️  No stored data found for this client/date range.[/yellow]")
        return

    st_analyzer = SearchTermsAnalyzer(search_terms_df)
    neg_keywords = st_analyzer.get_negative_keyword_candidates()
    top_search_terms = st_analyzer.get_top_performers()
    match_type_breakdown = st_analyzer.get_match_type_distribution()
    console.print(f"  ✓ Identified {len(neg_keywords)} negative keyword candidates")

    is_analyzer = ImpressionShareAnalyzer(impression_share_df)
    lost_is = is_analyzer.get_lost_opportunities()
    budget_recs = is_analyzer.get_budget_recommendations()
    console.print(f"  ✓ Found {len(lost_is)} impression share opportunities")

    qs_analyzer = QualityScoreAnalyzer(quality_scores_df)
    qs_changes = qs_analyzer.get_qs_changes()
    low_qs_alerts = qs_analyzer.get_low_qs_alerts()
    qs_distribution = qs_analyzer.get_distribution()
    console.print(f"  ✓ Generated {len(low_qs_alerts)} low QS alerts")

    trend_analyzer = TrendAnalyzer(campaigns_current)
    leads_trend = trend_analyzer.calculate_trends("conversions_primary")
    clicks_trend = trend_analyzer.calculate_trends("clicks")
    anomalies = trend_analyzer.detect_anomalies("conversions_primary")
    leads_forecast = trend_analyzer.forecast("conversions_primary")
    console.print(f"  ✓ Detected {len(anomalies)} anomalies")

    console.print("\n[yellow]Phase 3: Generating markdown report...[/yellow]")

    kpi_summary = (
        _compute_kpi_summary(
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

    report_path = report_generator.generate_report(
        client_id=client_id,
        period=current_end.strftime("%Y-%m"),
        kpi_summary=kpi_summary,
        neg_keywords=neg_keywords,
        top_search_terms=top_search_terms,
        match_type_breakdown=match_type_breakdown,
        lost_is=lost_is,
        budget_recs=budget_recs,
        qs_changes=qs_changes,
        low_qs_alerts=low_qs_alerts,
        qs_distribution=qs_distribution,
        trends=[leads_trend, clicks_trend],
        anomalies=anomalies,
        forecast=[leads_forecast],
    )

    console.print(f"\n[bold green]✅ Report generated: {report_path}[/bold green]\n")


@click.command()
@click.option("--client", "-c", help="Client ID to process (all clients if omitted)")
@click.option("--month", "-m", help="Target month (YYYY-MM format, e.g., 2025-12)")
@click.option("--days", "-d", type=int, help="Number of days of data to analyze (overrides --month)")
@click.option("--config", default="clients.yaml", show_default=True, help="Configuration file")
@click.option("--output-dir", default="monthly_summaries", show_default=True, help="Output directory for reports")
@click.option("--no-fetch", is_flag=True, help="Skip API fetching and use stored data only")
@click.option("--check-creds", is_flag=True, help="Check API credential status and exit")
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
def cli(client: Optional[str], month: Optional[str], days: Optional[int], config: str, output_dir: str, no_fetch: bool, check_creds: bool, verbose: bool) -> None:
    """Generate markdown reports with actionable Google Ads insights and campaign-level trends."""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    console.print("[bold green]🚀 Ads Report Automation[/bold green]\n")

    cred_manager = CredentialManager()
    if check_creds:
        cred_manager.print_credential_status()
        from src.credentials import test_api_connections

        test_api_connections()
        return

    # Determine the date range and whether this is a monthly report
    is_monthly = True
    if days:
        # Use --days if explicitly provided (relative to today)
        current_end = date.today() - timedelta(days=1)
        current_start = current_end - timedelta(days=max(days - 1, 0))
        is_monthly = False  # Custom day ranges use period comparison, not YoY
    elif month:
        # Parse --month in YYYY-MM format
        try:
            year, month_num = map(int, month.split("-"))
            current_start, current_end = month_to_date_range(year, month_num)
            is_monthly = True  # Explicit month uses year-over-year comparison
        except (ValueError, AttributeError):
            console.print("[red]❌ Invalid month format. Use YYYY-MM (e.g., 2025-12)[/red]")
            return
    else:
        # Interactive mode: let user select year and month
        selected_year, selected_month = select_year_and_month()
        current_start, current_end = month_to_date_range(selected_year, selected_month)
        is_monthly = True  # Interactive selection uses year-over-year comparison

    config_manager = ConfigManager(config)
    config_data = config_manager.load_config()
    if not config_data:
        console.print("[red]❌ Failed to load configuration[/red]")
        return

    storage = StorageManager()
    report_generator = MarkdownReportGenerator(output_dir=output_dir)

    clients_to_process = [client] if client else config_manager.get_clients()
    if not clients_to_process:
        console.print("[red]❌ No clients found in configuration[/red]")
        return

    for client_id in clients_to_process:
        client_config = config_manager.get_client_config(client_id)
        if not client_config:
            console.print(f"[red]❌ Client not found in config: {client_id}[/red]")
            continue

        try:
            _process_client(client_id, client_config, current_start, current_end, storage, report_generator, cred_manager, no_fetch, is_monthly)
        except Exception as exc:
            logger.exception("Error processing client %s", client_id)
            console.print(f"[red]❌ Failed to process {client_id}: {exc}[/red]")


if __name__ == "__main__":
    cli()
