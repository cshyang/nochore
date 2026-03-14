"""Pipeline orchestration for ads report generation."""
import logging
import os
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import polars as pl
from rich.console import Console

from google.ads.googleads.client import GoogleAdsClient

from src.analyzers.impression_share import ImpressionShareAnalyzer
from src.analyzers.quality_score import QualityScoreAnalyzer
from src.analyzers.search_terms import SearchTermsAnalyzer
from src.analyzers.trends import TrendAnalyzer
from src.credentials import CredentialManager
from src.date_utils import calculate_previous_period
from src.fetchers.google_ads import GoogleAdsFetcher
from src.models import AnalysisResults, ReportingConfig
from src.reporting import (
    ClientSummaryGenerator,
    InternalReportGenerator,
    build_client_summary_report,
    compute_kpi_summary,
    normalize_campaigns,
)
from src.storage import StorageManager

logger = logging.getLogger(__name__)
console = Console()


def init_google_ads_client(
    cred_manager: CredentialManager,
) -> Optional[GoogleAdsClient]:
    """Initialize Google Ads API client from credentials.

    Args:
        cred_manager: Credential manager instance

    Returns:
        GoogleAdsClient instance or None if credentials unavailable
    """
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


def fetch_google_ads(
    client_id: str,
    client_config: Dict[str, Any],
    start_date: date,
    end_date: date,
    storage: StorageManager,
    ga_client: GoogleAdsClient,
) -> None:
    """Fetch all Google Ads data for a client.

    Fetches search terms, impression share, quality scores, and campaign performance.

    Args:
        client_id: Client identifier
        client_config: Client configuration dict
        start_date: Start of date range
        end_date: End of date range
        storage: Storage manager for persisting data
        ga_client: Initialized Google Ads client
    """
    customer_ids = client_config.get("google_ads", {}).get("customer_ids", [])
    for customer_id in customer_ids:
        fetcher = GoogleAdsFetcher(ga_client, customer_id)

        search_terms = fetcher.fetch_search_terms(client_id, start_date, end_date)
        storage.append(client_id, "search_terms", search_terms)
        console.print(f"  Fetched {len(search_terms)} search terms ({customer_id})")

        impression_share = fetcher.fetch_impression_share(
            client_id, start_date, end_date
        )
        storage.append(client_id, "impression_share", impression_share)
        console.print(
            f"  Fetched {len(impression_share)} impression share records ({customer_id})"
        )

        quality_scores = fetcher.fetch_quality_scores(client_id, start_date, end_date)
        storage.append(client_id, "quality_scores", quality_scores)
        console.print(
            f"  Fetched {len(quality_scores)} quality score records ({customer_id})"
        )

        campaigns = fetcher.fetch_campaign_performance(client_id, start_date, end_date)
        storage.append(client_id, "campaigns", campaigns)
        console.print(
            f"  Fetched {len(campaigns)} campaign performance records ({customer_id})"
        )

        conversion_actions = fetcher.fetch_conversion_actions(
            client_id, start_date, end_date
        )
        storage.append(client_id, "conversion_actions", conversion_actions)
        console.print(
            f"  Fetched {len(conversion_actions)} conversion action records ({customer_id})"
        )


def fetch_meta(
    client_id: str,
    client_config: Dict[str, Any],
    reporting_config: ReportingConfig,
    start_date: date,
    end_date: date,
    storage: StorageManager,
    cred_manager: CredentialManager,
) -> None:
    """Fetch Meta Ads campaign data for a client.

    Args:
        client_id: Client identifier
        client_config: Client configuration dict
        start_date: Start of date range
        end_date: End of date range
        storage: Storage manager for persisting data
        cred_manager: Credential manager for Meta API access
    """
    if not cred_manager.has_meta_credentials():
        console.print("[yellow]  Skipping Meta fetch (missing credentials)[/yellow]")
        return

    meta_config = client_config.get("meta", {})
    ad_accounts = meta_config.get("ad_accounts", [])
    if not ad_accounts:
        return

    try:
        from facebook_business.api import FacebookAdsApi  # type: ignore
        from src.fetchers.meta_ads import MetaAdsFetcher
    except ImportError as exc:
        console.print(f"[red]  Meta SDK not available: {exc}[/red]")
        return

    meta_creds = cred_manager.get_meta_credentials()
    api = FacebookAdsApi.init(
        access_token=meta_creds.get("access_token"), api_version="v22.0"
    )

    for account in ad_accounts:
        account_id = account.get("id")
        if not account_id:
            continue

        fetcher = MetaAdsFetcher(
            api,
            account_id,
            include_action_types=reporting_config.primary_lead_rules.meta.include_action_types,
        )
        campaigns = fetcher.fetch_campaign_performance(client_id, start_date, end_date)
        storage.append(client_id, "campaigns", campaigns)
        console.print(
            f"  Fetched {len(campaigns)} Meta campaign performance records ({account_id})"
        )


def fetch_client(
    client_id: str,
    client_config: Dict[str, Any],
    reporting_config: ReportingConfig,
    start_date: date,
    end_date: date,
    storage: StorageManager,
    cred_manager: CredentialManager,
) -> None:
    """Phase 1: Fetch data from APIs and store.

    Fetches Google Ads and Meta data for the given client and date range,
    persisting all results via the storage manager.

    Args:
        client_id: Client identifier
        client_config: Client configuration dict
        reporting_config: Reporting configuration
        start_date: Start of date range
        end_date: End of date range
        storage: Storage manager for persisting data
        cred_manager: Credential manager for API access
    """
    console.print("[yellow]Phase 1: Fetching data...[/yellow]")

    ga_client = init_google_ads_client(cred_manager)
    if "google_ads" in client_config and ga_client:
        fetch_google_ads(
            client_id, client_config, start_date, end_date, storage, ga_client
        )
    elif "google_ads" in client_config:
        console.print(
            "[yellow]  Skipping Google Ads fetch (missing credentials)[/yellow]"
        )

    if "meta" in client_config:
        fetch_meta(
            client_id,
            client_config,
            reporting_config,
            start_date,
            end_date,
            storage,
            cred_manager,
        )


def analyze_client(
    client_id: str,
    reporting_config: ReportingConfig,
    current_start: date,
    current_end: date,
    storage: StorageManager,
    is_monthly: bool = True,
    context: Optional[Dict[str, Any]] = None,
) -> Optional[AnalysisResults]:
    """Phase 2: Run analyzers on stored data and return structured results.

    Reads data from storage, normalizes campaigns, runs all analyzers
    (search terms, impression share, quality score, trends), and computes
    the KPI summary. Returns an AnalysisResults object or None if no data
    is found.

    Args:
        client_id: Client identifier
        reporting_config: Reporting configuration
        current_start: Start date of current reporting period
        current_end: End date of current reporting period
        storage: Storage manager for reading persisted data
        is_monthly: If True, use month-over-month comparison

    Returns:
        AnalysisResults with all analyzer outputs, or None if no data found
    """
    console.print("\n[yellow]Phase 2: Analyzing data...[/yellow]")

    previous_start, previous_end = calculate_previous_period(
        current_start, current_end, is_monthly
    )

    # Read stored data
    search_terms_df = storage.read(
        client_id, "search_terms", current_start, current_end
    )
    impression_share_df = storage.read(
        client_id, "impression_share", current_start, current_end
    )
    quality_scores_df = storage.read(
        client_id, "quality_scores", current_start, current_end
    )
    raw_campaigns_all = storage.read(client_id, "campaigns", previous_start, current_end)
    conversion_actions_all = storage.read(
        client_id, "conversion_actions", previous_start, current_end
    )

    # Normalize campaigns for analysis (full period)
    campaigns_all, _ = normalize_campaigns(
        raw_campaigns_all, conversion_actions_all, reporting_config
    )

    campaigns_current = (
        campaigns_all.filter(
            (pl.col("date") >= current_start) & (pl.col("date") <= current_end)
        )
        if not campaigns_all.is_empty()
        else campaigns_all
    )

    # Early exit if no data at all
    if (
        search_terms_df.is_empty()
        and impression_share_df.is_empty()
        and quality_scores_df.is_empty()
        and campaigns_current.is_empty()
    ):
        console.print(
            "[yellow]No stored data found for this client/date range.[/yellow]"
        )
        return None

    # Run analyzers
    st_analyzer = SearchTermsAnalyzer(search_terms_df)
    neg_keywords = st_analyzer.get_negative_keyword_candidates()
    top_search_terms = st_analyzer.get_top_performers()
    match_type_breakdown = st_analyzer.get_match_type_distribution()
    console.print(f"  Identified {len(neg_keywords)} negative keyword candidates")

    is_analyzer = ImpressionShareAnalyzer(impression_share_df)
    lost_is = is_analyzer.get_lost_opportunities()
    budget_recs = is_analyzer.get_budget_recommendations()
    console.print(f"  Found {len(lost_is)} impression share opportunities")

    qs_analyzer = QualityScoreAnalyzer(quality_scores_df)
    qs_changes = qs_analyzer.get_qs_changes()
    low_qs_alerts = qs_analyzer.get_low_qs_alerts()
    qs_distribution = qs_analyzer.get_distribution()
    console.print(f"  Generated {len(low_qs_alerts)} low QS alerts")

    trend_analyzer = TrendAnalyzer(campaigns_current)
    leads_trend = trend_analyzer.calculate_trends("conversions_primary")
    clicks_trend = trend_analyzer.calculate_trends("clicks")
    anomalies = trend_analyzer.detect_anomalies("conversions_primary")
    leads_forecast = trend_analyzer.forecast("conversions_primary")
    console.print(f"  Detected {len(anomalies)} anomalies")

    # Compute KPI summary
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

    # Determine currency from campaign data
    currency = ""
    if not campaigns_current.is_empty() and "currency" in campaigns_current.columns:
        first_currency = campaigns_current.select("currency").row(0)[0]
        if first_currency:
            currency = first_currency

    return AnalysisResults(
        client_id=client_id,
        period_current=f"{current_start.isoformat()} to {current_end.isoformat()}",
        period_previous=f"{previous_start.isoformat()} to {previous_end.isoformat()}",
        currency=currency,
        context=context or {},
        kpi_summary=kpi_summary,
        negative_keywords=neg_keywords,
        top_search_terms=top_search_terms,
        match_type_breakdown=match_type_breakdown,
        lost_impression_share=lost_is,
        budget_recommendations=budget_recs,
        qs_changes=qs_changes,
        low_qs_alerts=low_qs_alerts,
        qs_distribution=qs_distribution,
        trends=[leads_trend, clicks_trend],
        anomalies=anomalies,
        forecasts=[leads_forecast],
    )


def generate_reports(
    results: AnalysisResults,
    reporting_config: ReportingConfig,
    current_start: date,
    current_end: date,
    storage: StorageManager,
    internal_report_generator: InternalReportGenerator,
    client_summary_generator: ClientSummaryGenerator,
) -> Tuple[str, str]:
    """Phase 3: Generate markdown reports from analysis results.

    Produces both the internal detailed report and the client-facing summary.
    Re-reads raw campaign data from storage and normalizes it to obtain
    lead corrections needed for the client summary.

    Args:
        results: Structured analysis results from analyze_client()
        reporting_config: Reporting configuration
        current_start: Start date of current reporting period
        current_end: End date of current reporting period
        storage: Storage manager for reading campaign data
        internal_report_generator: Generator for internal reports
        client_summary_generator: Generator for client summaries

    Returns:
        Tuple of (internal_report_path, client_summary_path)
    """
    console.print("\n[yellow]Phase 3: Generating markdown report...[/yellow]")

    client_id = results.client_id

    # Generate internal report from analysis results
    report_path = internal_report_generator.generate_report(
        client_id=client_id,
        period=current_end.strftime("%Y-%m"),
        kpi_summary=results.kpi_summary,
        neg_keywords=results.negative_keywords,
        top_search_terms=results.top_search_terms,
        match_type_breakdown=results.match_type_breakdown,
        lost_is=results.lost_impression_share,
        budget_recs=results.budget_recommendations,
        qs_changes=results.qs_changes,
        low_qs_alerts=results.low_qs_alerts,
        qs_distribution=results.qs_distribution,
        trends=results.trends,
        anomalies=results.anomalies,
        forecast=results.forecasts,
    )

    # Re-read and normalize current-period raw campaigns for lead corrections
    raw_campaigns_current = storage.read(
        client_id, "campaigns", current_start, current_end
    )
    conversion_actions_current = storage.read(
        client_id, "conversion_actions", current_start, current_end
    )
    campaigns_current, lead_corrections = normalize_campaigns(
        raw_campaigns_current, conversion_actions_current, reporting_config
    )

    # Generate client summary
    client_summary_report = build_client_summary_report(
        client_id=client_id,
        current_df=campaigns_current,
        reporting_config=reporting_config,
        period_start=current_start.isoformat(),
        period_end=current_end.isoformat(),
        lead_corrections=lead_corrections,
    )
    client_summary_path = client_summary_generator.generate_report(client_summary_report)

    console.print(f"\n[bold green]Internal report generated: {report_path}[/bold green]")
    console.print(f"[bold green]Client summary generated: {client_summary_path}[/bold green]\n")

    return report_path, client_summary_path


def process_client(
    client_id: str,
    client_config: Dict[str, Any],
    reporting_config: ReportingConfig,
    current_start: date,
    current_end: date,
    storage: StorageManager,
    internal_report_generator: InternalReportGenerator,
    client_summary_generator: ClientSummaryGenerator,
    cred_manager: CredentialManager,
    no_fetch: bool = False,
    is_monthly: bool = True,
) -> None:
    """Process a single client: fetch data, analyze, and generate report.

    This is the main pipeline orchestrator that coordinates:
    1. Data fetching from Google Ads and Meta APIs
    2. Running all analyzers on the fetched data
    3. Generating the markdown report

    Preserved for backward compatibility. Delegates to fetch_client(),
    analyze_client(), and generate_reports().

    Args:
        client_id: Client identifier
        client_config: Client configuration dict
        reporting_config: Reporting configuration
        current_start: Start date of current reporting period
        current_end: End date of current reporting period
        storage: Storage manager instance
        internal_report_generator: Internal report generator instance
        client_summary_generator: Client summary generator instance
        cred_manager: Credential manager instance
        no_fetch: If True, skip API fetching and use cached data
        is_monthly: If True, use month-over-month comparison
    """
    console.print(f"[blue]Processing {client_id}[/blue]\n")

    # Phase 1: Fetch data (optional)
    if not no_fetch:
        fetch_client(
            client_id=client_id,
            client_config=client_config,
            reporting_config=reporting_config,
            start_date=current_start,
            end_date=current_end,
            storage=storage,
            cred_manager=cred_manager,
        )

    # Phase 2: Analyze data
    results = analyze_client(
        client_id=client_id,
        reporting_config=reporting_config,
        current_start=current_start,
        current_end=current_end,
        storage=storage,
        is_monthly=is_monthly,
    )

    if results is None:
        return

    # Phase 3: Generate reports
    generate_reports(
        results=results,
        reporting_config=reporting_config,
        current_start=current_start,
        current_end=current_end,
        storage=storage,
        internal_report_generator=internal_report_generator,
        client_summary_generator=client_summary_generator,
    )
