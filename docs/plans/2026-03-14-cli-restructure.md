# Campaign CLI Restructure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the monolithic `ads-report` CLI into a `campaign` CLI with porcelain+plumbing layers, decoupled pipeline, and `--format json` support on every command.

**Architecture:** Two-layer CLI (porcelain for workflows, plumbing for precision). Pipeline decoupled into `fetch_client()` and `analyze_client()` returning `AnalysisResults`. Dead code removed. All commands support `--format json` for agent consumption.

**Tech Stack:** Python 3.9+, Click (groups + subcommands), Polars, Rich, existing fetchers/analyzers unchanged.

**Base path:** `/Users/cshyang/Documents/Coding Repositories/ads-report-automation`

---

### Task 1: Delete Dead Code

**Files:**
- Delete: `src/calculations.py`
- Delete: `src/formatting.py`
- Delete: `src/data_models.py`
- Delete: `src/report.py`

**Step 1: Verify no imports exist**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && grep -r "from src.calculations\|from src.formatting\|from src.data_models\|from src.report " src/ --include="*.py" | grep -v "__pycache__"`
Expected: No matches (the shim files import FROM other modules, nothing imports FROM them)

**Step 2: Delete the files**

```bash
cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation"
rm src/calculations.py src/formatting.py src/data_models.py src/report.py
```

**Step 3: Run tests to verify nothing broke**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -m unittest discover -s tests -v`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add -A && git commit -m "chore: remove dead compatibility shim files"
```

---

### Task 2: Split models/diagnostics.py

Separate analyzer output types from diagnostic engine types.

**Files:**
- Create: `src/models/analysis.py` (analyzer outputs)
- Modify: `src/models/diagnostics.py` (keep only diagnostic engine types)
- Modify: `src/models/__init__.py` (update imports)

**Step 1: Create `src/models/analysis.py`**

Move these classes from `diagnostics.py` to `analysis.py`:
- `NegativeKeywordRec`, `TopSearchTerm`, `MatchTypeBreakdown`
- `LostISInsight`, `BudgetRec`
- `QSChange`, `LowQSAlert`
- `TrendResult`, `Anomaly`, `Forecast`
- `CompositionSegment`, `CompositionBreakdown`, `CompositionShift`
- `AnalysisResults`

```python
"""Analyzer output models."""

from dataclasses import dataclass, field
from datetime import date
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class NegativeKeywordRec:
    # ... (exact copy from diagnostics.py)

# ... all analyzer output classes ...

@dataclass
class AnalysisResults:
    # ... (exact copy, but imports from this file now)
```

**Step 2: Update `src/models/diagnostics.py`**

Remove the moved classes. Keep only:
- `EvidenceRule`, `RecommendationTemplate`, `DiagnosticCheckConfig`
- `EvidenceResult`, `Diagnosis`, `Recommendation`, `Investigation`
- `MetricConfig`, `CheckConfig`, `ThresholdConfig`, `DiagnosticTreeConfig`

Update `AnalysisResults` import in remaining classes if needed (Investigation is referenced by AnalysisResults, not the other way around — so no circular dependency).

**Step 3: Update `src/models/__init__.py`**

Add imports from `analysis.py`, remove them from `diagnostics.py` imports. All public names stay the same — no downstream changes needed.

```python
from .analysis import (
    AnalysisResults,
    Anomaly,
    BudgetRec,
    CompositionBreakdown,
    CompositionSegment,
    CompositionShift,
    Forecast,
    LostISInsight,
    LowQSAlert,
    MatchTypeBreakdown,
    NegativeKeywordRec,
    QSChange,
    TopSearchTerm,
    TrendResult,
)
from .diagnostics import (
    CheckConfig,
    Diagnosis,
    DiagnosticCheckConfig,
    DiagnosticTreeConfig,
    EvidenceResult,
    EvidenceRule,
    Investigation,
    MetricConfig,
    Recommendation,
    RecommendationTemplate,
    ThresholdConfig,
)
from .reporting import (
    # ... unchanged ...
)
```

**Step 4: Verify all imports resolve**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -c "from src.models import *; print('All imports OK')"`
Expected: "All imports OK"

**Step 5: Run tests**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -m unittest discover -s tests -v`
Expected: All tests pass

**Step 6: Commit**

```bash
git add src/models/analysis.py src/models/diagnostics.py src/models/__init__.py
git commit -m "refactor: split analyzer outputs from diagnostic engine models"
```

---

### Task 3: Decouple Pipeline — `fetch_client()` and `analyze_client()`

The critical decoupling. Pipeline returns data instead of rendering reports.

**Files:**
- Modify: `src/pipeline.py`

**Step 1: Refactor `process_client()` into three functions**

```python
"""Pipeline orchestration for campaign analytics."""
import logging
import os
from datetime import date
from typing import Any, Dict, Optional

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


# Keep init_google_ads_client(), fetch_google_ads(), fetch_meta() unchanged


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

    Pulls data from Google Ads and Meta for the given client and date range.
    Results are persisted to partitioned Parquet storage.
    """
    ga_client = init_google_ads_client(cred_manager)
    if "google_ads" in client_config and ga_client:
        fetch_google_ads(client_id, client_config, start_date, end_date, storage, ga_client)
    elif "google_ads" in client_config:
        console.print("[yellow]  Skipping Google Ads fetch (missing credentials)[/yellow]")

    if "meta" in client_config:
        fetch_meta(client_id, client_config, reporting_config, start_date, end_date, storage, cred_manager)


def analyze_client(
    client_id: str,
    reporting_config: ReportingConfig,
    current_start: date,
    current_end: date,
    storage: StorageManager,
    is_monthly: bool = True,
) -> Optional[AnalysisResults]:
    """Phase 2: Analyze stored data and return structured results.

    Reads stored data, runs all analyzers, and returns an AnalysisResults
    container. Returns None if no data is available.
    """
    previous_start, previous_end = calculate_previous_period(current_start, current_end, is_monthly)

    # Read stored data
    search_terms_df = storage.read(client_id, "search_terms", current_start, current_end)
    impression_share_df = storage.read(client_id, "impression_share", current_start, current_end)
    quality_scores_df = storage.read(client_id, "quality_scores", current_start, current_end)
    raw_campaigns_all = storage.read(client_id, "campaigns", previous_start, current_end)
    conversion_actions_all = storage.read(client_id, "conversion_actions", previous_start, current_end)

    campaigns_all, _ = normalize_campaigns(raw_campaigns_all, conversion_actions_all, reporting_config)
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
    ):
        return None

    # Run analyzers
    st_analyzer = SearchTermsAnalyzer(search_terms_df)
    neg_keywords = st_analyzer.get_negative_keyword_candidates()
    top_search_terms = st_analyzer.get_top_performers()
    match_type_breakdown = st_analyzer.get_match_type_distribution()

    is_analyzer = ImpressionShareAnalyzer(impression_share_df)
    lost_is = is_analyzer.get_lost_opportunities()
    budget_recs = is_analyzer.get_budget_recommendations()

    qs_analyzer = QualityScoreAnalyzer(quality_scores_df)
    qs_changes = qs_analyzer.get_qs_changes()
    low_qs_alerts = qs_analyzer.get_low_qs_alerts()
    qs_distribution = qs_analyzer.get_distribution()

    trend_analyzer = TrendAnalyzer(campaigns_current)
    leads_trend = trend_analyzer.calculate_trends("conversions_primary")
    clicks_trend = trend_analyzer.calculate_trends("clicks")
    anomalies = trend_analyzer.detect_anomalies("conversions_primary")
    leads_forecast = trend_analyzer.forecast("conversions_primary")

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

    return AnalysisResults(
        client_id=client_id,
        period_current=f"{current_start.isoformat()} to {current_end.isoformat()}",
        period_previous=f"{previous_start.isoformat()} to {previous_end.isoformat()}",
        currency="",  # determined per-campaign
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
) -> tuple[str, str]:
    """Phase 3: Generate markdown reports from analysis results.

    Returns tuple of (internal_report_path, client_summary_path).
    """
    period = current_end.strftime("%Y-%m")

    internal_path = internal_report_generator.generate_report(
        client_id=results.client_id,
        period=period,
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

    # Read campaign data for summary report
    raw_campaigns_current = storage.read(results.client_id, "campaigns", current_start, current_end)
    conversion_actions_current = storage.read(results.client_id, "conversion_actions", current_start, current_end)
    campaigns_current, lead_corrections = normalize_campaigns(
        raw_campaigns_current, conversion_actions_current, reporting_config
    )

    client_summary_report = build_client_summary_report(
        client_id=results.client_id,
        current_df=campaigns_current,
        reporting_config=reporting_config,
        period_start=current_start.isoformat(),
        period_end=current_end.isoformat(),
        lead_corrections=lead_corrections,
    )
    summary_path = client_summary_generator.generate_report(client_summary_report)

    return internal_path, summary_path


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
    """Process a single client: fetch, analyze, report.

    Preserved for backward compatibility with existing CLI.
    Internally delegates to fetch_client(), analyze_client(), generate_reports().
    """
    console.print(f"[blue]Processing {client_id}[/blue]\n")

    if not no_fetch:
        console.print("[yellow]Phase 1: Fetching data...[/yellow]")
        fetch_client(client_id, client_config, reporting_config, current_start, current_end, storage, cred_manager)

    console.print("\n[yellow]Phase 2: Analyzing data...[/yellow]")
    results = analyze_client(client_id, reporting_config, current_start, current_end, storage, is_monthly)

    if results is None:
        console.print("[yellow]No stored data found for this client/date range.[/yellow]")
        return

    console.print(f"  Identified {len(results.negative_keywords)} negative keyword candidates")
    console.print(f"  Found {len(results.lost_impression_share)} impression share opportunities")
    console.print(f"  Generated {len(results.low_qs_alerts)} low QS alerts")
    console.print(f"  Detected {len(results.anomalies)} anomalies")

    console.print("\n[yellow]Phase 3: Generating markdown report...[/yellow]")
    internal_path, summary_path = generate_reports(
        results, reporting_config, current_start, current_end, storage,
        internal_report_generator, client_summary_generator,
    )

    console.print(f"\n[bold green]Internal report generated: {internal_path}[/bold green]")
    console.print(f"[bold green]Client summary generated: {summary_path}[/bold green]\n")
```

**Step 2: Verify existing CLI still works**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -c "from src.pipeline import process_client, fetch_client, analyze_client, generate_reports; print('Pipeline imports OK')"`
Expected: "Pipeline imports OK"

**Step 3: Run tests**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -m unittest discover -s tests -v`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/pipeline.py
git commit -m "refactor: decouple pipeline into fetch_client, analyze_client, generate_reports"
```

---

### Task 4: Add Output Formatter (--format json support)

Create a shared output formatter that all commands will use.

**Files:**
- Create: `src/output.py`

**Step 1: Create `src/output.py`**

```python
"""Output formatting for CLI commands.

Supports table (human), json (agent), and csv output modes.
"""

import json
import sys
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from rich.console import Console
from rich.table import Table

console = Console(stderr=True)  # Rich output to stderr, data to stdout


class OutputFormat(str, Enum):
    TABLE = "table"
    JSON = "json"
    CSV = "csv"


def _serialize(obj: Any) -> Any:
    """Make objects JSON-serializable."""
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, set):
        return list(obj)
    return obj


def output_json(data: Any) -> None:
    """Print data as JSON to stdout."""
    print(json.dumps(data, default=_serialize, indent=2))


def output_table(title: str, rows: List[Dict[str, Any]], columns: Optional[List[str]] = None) -> None:
    """Print data as a Rich table to stderr (visible to humans)."""
    if not rows:
        console.print(f"[dim]No data for: {title}[/dim]")
        return

    table = Table(title=title)
    cols = columns or list(rows[0].keys())
    for col in cols:
        table.add_column(col)
    for row in rows:
        table.add_row(*[str(row.get(c, "")) for c in cols])
    console.print(table)


def output_data(data: Any, fmt: OutputFormat, title: str = "", columns: Optional[List[str]] = None) -> None:
    """Route output to the appropriate formatter."""
    if fmt == OutputFormat.JSON:
        if is_dataclass(data) and not isinstance(data, type):
            output_json(asdict(data))
        elif isinstance(data, list) and data and is_dataclass(data[0]):
            output_json([asdict(item) for item in data])
        else:
            output_json(data)
    elif fmt == OutputFormat.TABLE:
        if is_dataclass(data) and not isinstance(data, type):
            rows = [asdict(data)]
        elif isinstance(data, list) and data and is_dataclass(data[0]):
            rows = [asdict(item) for item in data]
        elif isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
        else:
            console.print(str(data))
            return
        output_table(title, rows, columns)
    elif fmt == OutputFormat.CSV:
        import csv
        import io
        if is_dataclass(data) and not isinstance(data, type):
            rows = [asdict(data)]
        elif isinstance(data, list) and data and is_dataclass(data[0]):
            rows = [asdict(item) for item in data]
        elif isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
        else:
            print(str(data))
            return
        if rows:
            writer = csv.DictWriter(sys.stdout, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
```

**Step 2: Test the formatter**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -c "
from src.output import output_data, OutputFormat
from src.models import NegativeKeywordRec
rec = NegativeKeywordRec('test term', 'Campaign 1', 'AdGroup 1', 'USD', 100.0, 50, 0.0, 'low_cvr', 'No conversions')
output_data([rec], OutputFormat.JSON, 'Negative Keywords')
"`
Expected: JSON output of the record

**Step 3: Commit**

```bash
git add src/output.py
git commit -m "feat: add output formatter with json/table/csv support"
```

---

### Task 5: Create CLI Group Structure

Transform the single `@click.command()` into a Click group with subcommands.

**Files:**
- Create: `src/cli/__init__.py`
- Create: `src/cli/main.py` (top-level group + global flags)
- Create: `src/cli/context.py` (campaign use/status commands)
- Create: `src/cli/plumbing.py` (fetch, analyze, report commands)
- Create: `src/cli/porcelain.py` (check, investigate, brief commands)
- Create: `src/cli/config_cmd.py` (config list, check-creds)
- Modify: `pyproject.toml` (update entry point)

**Step 1: Create `src/cli/__init__.py`**

```python
"""Campaign CLI — porcelain + plumbing for campaign analytics."""
```

**Step 2: Create `src/cli/main.py`**

```python
"""Main CLI entry point with global flags and group."""

import logging
from pathlib import Path
from typing import Optional

import click
from rich.console import Console

from src.output import OutputFormat

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

console = Console()

CONTEXT_FILE = Path(".campaign-context")


def get_active_client() -> Optional[str]:
    """Read the active client from context file."""
    if CONTEXT_FILE.exists():
        return CONTEXT_FILE.read_text().strip() or None
    return None


def resolve_client(client_id: Optional[str]) -> Optional[str]:
    """Resolve client ID from argument or active context."""
    if client_id:
        return client_id
    active = get_active_client()
    if active:
        console.print(f"[dim]Using active client: {active}[/dim]", stderr=True)
    return active


@click.group()
@click.option("--format", "output_format", type=click.Choice(["table", "json", "csv"]), default="table", help="Output format")
@click.option("--quiet", "-q", is_flag=True, help="Suppress prompts and status messages")
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
@click.option("--config", "config_path", default="clients.yaml", show_default=True, help="Configuration file")
@click.pass_context
def cli(ctx, output_format, quiet, verbose, config_path):
    """Campaign analytics CLI — porcelain + plumbing for campaign optimization."""
    ctx.ensure_object(dict)
    ctx.obj["format"] = OutputFormat(output_format)
    ctx.obj["quiet"] = quiet
    ctx.obj["config_path"] = config_path

    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    if quiet:
        logging.getLogger().setLevel(logging.WARNING)


# Register subcommand groups
from src.cli.context import use, status
from src.cli.plumbing import fetch, analyze, report
from src.cli.porcelain import check, investigate, brief
from src.cli.config_cmd import config

cli.add_command(use)
cli.add_command(status)
cli.add_command(fetch)
cli.add_command(analyze)
cli.add_command(report)
cli.add_command(check)
cli.add_command(investigate)
cli.add_command(brief)
cli.add_command(config)
```

**Step 3: Create `src/cli/context.py`**

```python
"""Context management — set/show active client."""

import click
from pathlib import Path
from rich.console import Console

console = Console()
CONTEXT_FILE = Path(".campaign-context")


@click.command()
@click.argument("client_id")
def use(client_id):
    """Set the active client context."""
    CONTEXT_FILE.write_text(client_id)
    console.print(f"Active client set to: [bold]{client_id}[/bold]")


@click.command()
@click.pass_context
def status(ctx):
    """Show current context and data freshness."""
    from src.config import ConfigManager
    from src.storage import StorageManager

    active = CONTEXT_FILE.read_text().strip() if CONTEXT_FILE.exists() else None
    config_path = ctx.obj["config_path"]
    config_manager = ConfigManager(config_path)
    clients = config_manager.get_clients()

    console.print(f"[bold]Active client:[/bold] {active or '(none)'}")
    console.print(f"[bold]Config:[/bold] {config_path}")
    console.print(f"[bold]Clients:[/bold] {', '.join(clients)}")

    storage = StorageManager()
    for client_id in clients:
        data_dir = storage.base_dir / client_id
        if data_dir.exists():
            parquet_files = list(data_dir.rglob("*.parquet"))
            if parquet_files:
                latest = max(f.stat().st_mtime for f in parquet_files)
                from datetime import datetime
                console.print(f"  {client_id}: last data {datetime.fromtimestamp(latest).strftime('%Y-%m-%d %H:%M')}")
            else:
                console.print(f"  {client_id}: [dim]no data[/dim]")
        else:
            console.print(f"  {client_id}: [dim]no data[/dim]")
```

**Step 4: Create `src/cli/plumbing.py`**

```python
"""Plumbing commands — granular access to fetch, analyze, report."""

from datetime import date
from typing import Optional

import click
from rich.console import Console

from src.cli.main import resolve_client
from src.output import OutputFormat, output_data

console = Console()


def _resolve_dates(month: Optional[str], days: Optional[int]) -> tuple:
    """Resolve date range from CLI options. Returns (is_monthly, start, end)."""
    from src.date_utils import calculate_days_range, parse_month_arg
    from src.date_selector import month_to_date_range

    if days:
        start, end = calculate_days_range(days)
        return False, start, end
    if month:
        year, month_num = parse_month_arg(month)
        start, end = month_to_date_range(year, month_num)
        return True, start, end
    # Default: last 30 days
    start, end = calculate_days_range(30)
    return False, start, end


@click.command()
@click.argument("client_id", required=False)
@click.option("--month", "-m", help="Target month (YYYY-MM)")
@click.option("--days", "-d", type=int, help="Number of days (default: 30)")
@click.option("--platform", type=click.Choice(["google", "meta", "all"]), default="all")
@click.pass_context
def fetch(ctx, client_id, month, days, platform):
    """Pull data from ad platforms and store locally."""
    client_id = resolve_client(client_id)
    if not client_id:
        raise click.UsageError("No client specified. Use 'campaign use <client>' or pass client_id.")

    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.pipeline import fetch_client
    from src.storage import StorageManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    client_config = config_manager.get_client_config(client_id)
    reporting_config = config_manager.get_reporting_config(client_id)
    if not client_config:
        raise click.UsageError(f"Client not found: {client_id}")

    _, start, end = _resolve_dates(month, days)
    storage = StorageManager()
    cred_manager = CredentialManager()

    if not ctx.obj["quiet"]:
        console.print(f"[blue]Fetching data for {client_id} ({start} to {end})[/blue]")

    fetch_client(client_id, client_config, reporting_config, start, end, storage, cred_manager)

    if not ctx.obj["quiet"]:
        console.print("[green]Fetch complete.[/green]")


@click.command()
@click.argument("client_id", required=False)
@click.option("--month", "-m", help="Target month (YYYY-MM)")
@click.option("--days", "-d", type=int, help="Number of days (default: 30)")
@click.option("--only", "only_analyzers", help="Comma-separated analyzer names (search-terms,trends,quality-score,impression-share)")
@click.pass_context
def analyze(ctx, client_id, month, days, only_analyzers):
    """Run analyzers on stored data and return structured results."""
    client_id = resolve_client(client_id)
    if not client_id:
        raise click.UsageError("No client specified. Use 'campaign use <client>' or pass client_id.")

    from src.config import ConfigManager
    from src.pipeline import analyze_client
    from src.storage import StorageManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    reporting_config = config_manager.get_reporting_config(client_id)

    is_monthly, start, end = _resolve_dates(month, days)
    storage = StorageManager()

    if not ctx.obj["quiet"]:
        console.print(f"[blue]Analyzing {client_id} ({start} to {end})[/blue]")

    results = analyze_client(client_id, reporting_config, start, end, storage, is_monthly)

    if results is None:
        if ctx.obj["format"] == OutputFormat.JSON:
            output_data({"error": "no_data", "client_id": client_id}, ctx.obj["format"])
        else:
            console.print("[yellow]No data found for this client/date range.[/yellow]")
        return

    output_data(results, ctx.obj["format"], title=f"Analysis: {client_id}")


@click.command()
@click.argument("client_id", required=False)
@click.option("--month", "-m", help="Target month (YYYY-MM)")
@click.option("--days", "-d", type=int, help="Number of days (default: 30)")
@click.option("--type", "report_type", type=click.Choice(["internal", "summary", "all"]), default="all")
@click.pass_context
def report(ctx, client_id, month, days, report_type):
    """Generate markdown reports from analysis results."""
    client_id = resolve_client(client_id)
    if not client_id:
        raise click.UsageError("No client specified. Use 'campaign use <client>' or pass client_id.")

    from src.config import ConfigManager
    from src.pipeline import analyze_client, generate_reports
    from src.reporting import ClientSummaryGenerator, InternalReportGenerator
    from src.storage import StorageManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    reporting_config = config_manager.get_reporting_config(client_id)

    is_monthly, start, end = _resolve_dates(month, days)
    storage = StorageManager()

    results = analyze_client(client_id, reporting_config, start, end, storage, is_monthly)
    if results is None:
        console.print("[yellow]No data to report on.[/yellow]")
        return

    internal_gen = InternalReportGenerator(output_dir="reports")
    summary_gen = ClientSummaryGenerator(output_dir="reports")

    internal_path, summary_path = generate_reports(
        results, reporting_config, start, end, storage, internal_gen, summary_gen,
    )

    if ctx.obj["format"] == OutputFormat.JSON:
        output_data({"internal_report": internal_path, "summary_report": summary_path}, ctx.obj["format"])
    else:
        console.print(f"[green]Internal report: {internal_path}[/green]")
        console.print(f"[green]Client summary: {summary_path}[/green]")
```

**Step 5: Create `src/cli/porcelain.py`**

```python
"""Porcelain commands — high-level workflows for daily use."""

from typing import Optional

import click
from rich.console import Console

from src.cli.main import resolve_client
from src.cli.plumbing import _resolve_dates
from src.output import OutputFormat, output_data

console = Console()


@click.command()
@click.argument("client_id", required=False)
@click.option("--month", "-m", help="Target month (YYYY-MM)")
@click.option("--days", "-d", type=int, help="Number of days (default: 30)")
@click.pass_context
def check(ctx, client_id, month, days):
    """Quick health dashboard for a client.

    Fetches fresh data (if needed), runs all analyzers, and shows
    a concise health summary with key metrics and alerts.
    """
    client_id = resolve_client(client_id)
    if not client_id:
        raise click.UsageError("No client specified. Use 'campaign use <client>' or pass client_id.")

    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.pipeline import analyze_client, fetch_client
    from src.storage import StorageManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    client_config = config_manager.get_client_config(client_id)
    reporting_config = config_manager.get_reporting_config(client_id)
    if not client_config:
        raise click.UsageError(f"Client not found: {client_id}")

    is_monthly, start, end = _resolve_dates(month, days)
    storage = StorageManager()
    cred_manager = CredentialManager()

    if not ctx.obj["quiet"]:
        console.print(f"[blue]Health check: {client_id} ({start} to {end})[/blue]\n")

    # Fetch + analyze in one shot
    fetch_client(client_id, client_config, reporting_config, start, end, storage, cred_manager)
    results = analyze_client(client_id, reporting_config, start, end, storage, is_monthly)

    if results is None:
        console.print("[yellow]No data available.[/yellow]")
        return

    if ctx.obj["format"] == OutputFormat.JSON:
        output_data(results, ctx.obj["format"])
        return

    # Human-readable health summary
    kpi = results.kpi_summary
    console.print(f"[bold]KPI Summary[/bold]")
    for key, value in kpi.items():
        if key.startswith("period"):
            continue
        console.print(f"  {key}: {value}")

    if results.anomalies:
        console.print(f"\n[bold red]Anomalies ({len(results.anomalies)})[/bold red]")
        for a in results.anomalies:
            console.print(f"  {a.date} | {a.campaign} | {a.metric}: expected {a.expected:.1f}, got {a.actual:.1f} ({a.severity})")

    if results.low_qs_alerts:
        console.print(f"\n[bold yellow]Low Quality Scores ({len(results.low_qs_alerts)})[/bold yellow]")
        for alert in results.low_qs_alerts[:5]:
            console.print(f"  QS={alert.quality_score} | {alert.keyword} | {alert.campaign}")

    if results.negative_keywords:
        console.print(f"\n[bold]Negative Keyword Candidates ({len(results.negative_keywords)})[/bold]")
        for nk in results.negative_keywords[:5]:
            console.print(f"  \"{nk.search_term}\" | {nk.currency} {nk.spend:.2f} spent | {nk.reason}")

    if results.lost_impression_share:
        console.print(f"\n[bold]Impression Share Opportunities ({len(results.lost_impression_share)})[/bold]")
        for lis in results.lost_impression_share[:5]:
            console.print(f"  {lis.campaign} | IS={lis.current_is:.1%} | Lost to budget: {lis.lost_to_budget:.1%}")


@click.command()
@click.argument("client_id", required=False)
@click.option("--metric", required=True, type=click.Choice(["cpl", "cvr", "volume"]), help="Metric to investigate")
@click.option("--month", "-m", help="Target month (YYYY-MM)")
@click.option("--days", "-d", type=int, help="Number of days (default: 30)")
@click.pass_context
def investigate(ctx, client_id, metric, month, days):
    """Deep diagnostic investigation into why a metric changed.

    Runs the diagnostic engine to find root causes, evaluate evidence,
    and generate prioritized recommendations.
    """
    client_id = resolve_client(client_id)
    if not client_id:
        raise click.UsageError("No client specified.")

    # TODO: Wire diagnostic engine. For now, run full analysis and show relevant section.
    from src.config import ConfigManager
    from src.pipeline import analyze_client
    from src.storage import StorageManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    reporting_config = config_manager.get_reporting_config(client_id)

    is_monthly, start, end = _resolve_dates(month, days)
    storage = StorageManager()

    results = analyze_client(client_id, reporting_config, start, end, storage, is_monthly)
    if results is None:
        console.print("[yellow]No data available.[/yellow]")
        return

    # Map metric name to investigation field
    investigation = getattr(results, f"{metric}_investigation", None)
    if investigation:
        output_data(investigation, ctx.obj["format"], title=f"Investigation: {metric.upper()}")
    else:
        if ctx.obj["format"] == OutputFormat.JSON:
            output_data({"status": "no_investigation", "metric": metric, "note": "Diagnostic engine not yet wired for this metric"}, ctx.obj["format"])
        else:
            console.print(f"[yellow]No investigation data for {metric}. Diagnostic engine integration pending.[/yellow]")


@click.command()
@click.argument("client_id", required=False)
@click.option("--month", "-m", help="Target month (YYYY-MM)")
@click.option("--days", "-d", type=int, help="Number of days (default: 30)")
@click.pass_context
def brief(ctx, client_id, month, days):
    """Generate a client-ready summary brief.

    Fetches data, analyzes, and produces a concise client-facing report.
    """
    client_id = resolve_client(client_id)
    if not client_id:
        raise click.UsageError("No client specified.")

    from src.config import ConfigManager
    from src.credentials import CredentialManager
    from src.pipeline import analyze_client, fetch_client, generate_reports
    from src.reporting import ClientSummaryGenerator, InternalReportGenerator
    from src.storage import StorageManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    client_config = config_manager.get_client_config(client_id)
    reporting_config = config_manager.get_reporting_config(client_id)
    if not client_config:
        raise click.UsageError(f"Client not found: {client_id}")

    is_monthly, start, end = _resolve_dates(month, days)
    storage = StorageManager()
    cred_manager = CredentialManager()

    if not ctx.obj["quiet"]:
        console.print(f"[blue]Generating brief for {client_id} ({start} to {end})[/blue]\n")

    fetch_client(client_id, client_config, reporting_config, start, end, storage, cred_manager)
    results = analyze_client(client_id, reporting_config, start, end, storage, is_monthly)

    if results is None:
        console.print("[yellow]No data available.[/yellow]")
        return

    internal_gen = InternalReportGenerator(output_dir="reports")
    summary_gen = ClientSummaryGenerator(output_dir="reports")
    _, summary_path = generate_reports(
        results, reporting_config, start, end, storage, internal_gen, summary_gen,
    )

    if ctx.obj["format"] == OutputFormat.JSON:
        # Read and output the summary content as JSON
        with open(summary_path) as f:
            output_data({"path": summary_path, "content": f.read()}, ctx.obj["format"])
    else:
        console.print(f"[green]Client brief generated: {summary_path}[/green]")
        # Print the summary content
        with open(summary_path) as f:
            console.print(f.read())
```

**Step 6: Create `src/cli/config_cmd.py`**

```python
"""Config commands — manage configuration and credentials."""

import click
from rich.console import Console

from src.output import OutputFormat, output_data

console = Console()


@click.group()
def config():
    """Manage configuration and credentials."""
    pass


@config.command("list")
@click.pass_context
def config_list(ctx):
    """Show all configured clients."""
    from src.config import ConfigManager

    config_manager = ConfigManager(ctx.obj["config_path"])
    clients = config_manager.get_clients()

    if ctx.obj["format"] == OutputFormat.JSON:
        output_data({"clients": clients}, ctx.obj["format"])
    else:
        console.print("[bold]Configured clients:[/bold]")
        for c in clients:
            console.print(f"  {c}")


@config.command("check-creds")
def check_creds():
    """Check API credential status."""
    from src.credentials import CredentialManager, test_api_connections

    cred_manager = CredentialManager()
    cred_manager.print_credential_status()
    test_api_connections()
```

**Step 7: Create `src/cli/tools_cmd.py`**

```python
"""Tools command — agent discovery of available capabilities."""

import click
from src.output import OutputFormat, output_data


TOOL_MANIFEST = [
    {
        "name": "check",
        "description": "Quick health dashboard — fetches data, runs all analyzers, shows alerts",
        "params": ["client_id", "--month", "--days"],
        "when_to_use": "When you want an overview of how a client is doing",
    },
    {
        "name": "investigate",
        "description": "Deep diagnostic investigation into why a specific metric changed",
        "params": ["client_id", "--metric (cpl|cvr|volume)", "--month", "--days"],
        "when_to_use": "When CPL, CVR, or volume has changed and you need to understand why",
    },
    {
        "name": "brief",
        "description": "Generate a client-ready summary report",
        "params": ["client_id", "--month", "--days"],
        "when_to_use": "When preparing for a client call or need a shareable summary",
    },
    {
        "name": "fetch",
        "description": "Pull data from ad platforms (Google Ads, Meta) and store locally",
        "params": ["client_id", "--platform (google|meta|all)", "--month", "--days"],
        "when_to_use": "When you need fresh data before analysis",
    },
    {
        "name": "analyze",
        "description": "Run analyzers on stored data and return structured results",
        "params": ["client_id", "--only (search-terms,trends,...)", "--month", "--days"],
        "when_to_use": "When you need specific analyzer output, not a full health check",
    },
    {
        "name": "report",
        "description": "Generate markdown reports from analysis results",
        "params": ["client_id", "--type (internal|summary|all)", "--month", "--days"],
        "when_to_use": "When you need to save a report to disk",
    },
]


@click.command()
@click.pass_context
def tools(ctx):
    """List all available capabilities (for agent discovery)."""
    fmt = ctx.obj.get("format", OutputFormat.TABLE)
    if fmt == OutputFormat.JSON:
        output_data(TOOL_MANIFEST, fmt)
    else:
        from rich.console import Console
        console = Console()
        console.print("[bold]Available commands:[/bold]\n")
        for tool in TOOL_MANIFEST:
            console.print(f"  [cyan]{tool['name']}[/cyan] — {tool['description']}")
            console.print(f"    Use when: {tool['when_to_use']}")
            console.print()
```

**Step 8: Update `src/cli/main.py` to register tools command**

Add to the imports and registrations at the bottom of `src/cli/main.py`:

```python
from src.cli.tools_cmd import tools
cli.add_command(tools)
```

**Step 9: Update `pyproject.toml` entry point**

```toml
[project.scripts]
campaign = "src.cli.main:cli"
ads-report = "src.main:cli"
```

Keep `ads-report` for backward compatibility.

**Step 10: Verify CLI works**

Run:
```bash
cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation"
uv sync
uv run campaign --help
uv run campaign tools
uv run campaign config list
uv run campaign tools --format json
```
Expected: Help output shows all commands. Tools lists capabilities.

**Step 11: Run tests**

Run: `cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation" && uv run python -m unittest discover -s tests -v`
Expected: All existing tests still pass

**Step 12: Commit**

```bash
git add src/cli/ pyproject.toml
git commit -m "feat: add campaign CLI with porcelain+plumbing layers and agent discovery"
```

---

### Task 6: Verify End-to-End

**Step 1: Test the full porcelain flow (with --no-fetch using cached data)**

```bash
cd "/Users/cshyang/Documents/Coding Repositories/ads-report-automation"
# Set context
uv run campaign use last-minute

# Check health (uses cached data if available)
uv run campaign analyze --days 30

# JSON output for agents
uv run campaign analyze --format json --days 30

# Tools discovery
uv run campaign tools --format json

# Status
uv run campaign status
```

**Step 2: Verify backward compatibility**

```bash
uv run ads-report --no-fetch --client last-minute -m 2026-02
```
Expected: Old CLI still works exactly as before

**Step 3: Final commit**

```bash
git add -A
git commit -m "docs: add CLI restructure implementation plan"
```

---

## Summary of Changes

| What | Before | After |
|------|--------|-------|
| Entry point | `ads-report` (single command) | `campaign` (group with subcommands) + `ads-report` (kept for compat) |
| Pipeline | Monolithic `process_client()` | `fetch_client()` + `analyze_client()` → `AnalysisResults` + `generate_reports()` |
| Output | Markdown files only | `--format json\|table\|csv` on every command |
| Dead code | 4 shim files | Deleted |
| Models | `diagnostics.py` (mixed concerns) | `analysis.py` + `diagnostics.py` (separated) |
| Agent discovery | None | `campaign tools --format json` |
| Client context | Pass `--client` every time | `campaign use <client>` (sticky) |
| Workflow commands | None | `check`, `investigate`, `brief` |
