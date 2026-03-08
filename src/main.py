"""Main CLI for ads report automation (AI-ready analytics pipeline)."""

import logging
from datetime import date, timedelta
from pathlib import Path
from typing import Optional

import click
from rich.console import Console

from src.cli_prompts import prompt_clients
from src.config import ConfigManager
from src.credentials import CredentialManager
from src.date_selector import month_to_date_range, select_year_and_month
from src.date_utils import calculate_days_range, parse_month_arg
from src.pipeline import process_client
from src.reporting import ClientSummaryGenerator, InternalReportGenerator
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


@click.command()
@click.option("--client", "-c", help="Client ID to process (all clients if omitted)")
@click.option("--month", "-m", help="Target month (YYYY-MM format, e.g., 2025-12)")
@click.option(
    "--days",
    "-d",
    type=int,
    help="Number of days of data to analyze (overrides --month)",
)
@click.option(
    "--config", default="clients.yaml", show_default=True, help="Configuration file"
)
@click.option(
    "--output-dir",
    default="reports",
    show_default=True,
    help="Output directory for reports",
)
@click.option(
    "--no-fetch", is_flag=True, help="Skip API fetching and use stored data only"
)
@click.option(
    "--check-creds", is_flag=True, help="Check API credential status and exit"
)
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging")
def cli(
    client: Optional[str],
    month: Optional[str],
    days: Optional[int],
    config: str,
    output_dir: str,
    no_fetch: bool,
    check_creds: bool,
    verbose: bool,
) -> None:
    """Generate markdown reports with actionable Google Ads insights and campaign-level trends."""
    if verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    console.print("[bold green]Ads Report Automation[/bold green]\n")

    cred_manager = CredentialManager()
    if check_creds:
        cred_manager.print_credential_status()
        from src.credentials import test_api_connections

        test_api_connections()
        return

    # Determine the date range and whether this is a monthly report
    is_monthly, current_start, current_end = _resolve_date_range(month, days)

    config_manager = ConfigManager(config)
    config_data = config_manager.load_config()
    if not config_data:
        console.print("[red]Failed to load configuration[/red]")
        return

    storage = StorageManager()
    internal_report_generator = InternalReportGenerator(output_dir=output_dir)
    client_summary_generator = ClientSummaryGenerator(output_dir=output_dir)

    clients_to_process = (
        [client] if client else prompt_clients(config_manager.get_clients())
    )
    if not clients_to_process:
        console.print("[red]No clients found in configuration[/red]")
        return

    for client_id in clients_to_process:
        client_config = config_manager.get_client_config(client_id)
        reporting_config = config_manager.get_reporting_config(client_id)
        if not client_config:
            console.print(f"[red]Client not found in config: {client_id}[/red]")
            continue

        try:
            process_client(
                client_id,
                client_config,
                reporting_config,
                current_start,
                current_end,
                storage,
                internal_report_generator,
                client_summary_generator,
                cred_manager,
                no_fetch,
                is_monthly,
            )
        except Exception as exc:
            logger.exception("Error processing client %s", client_id)
            console.print(f"[red]Failed to process {client_id}: {exc}[/red]")


def _resolve_date_range(
    month: Optional[str], days: Optional[int]
) -> tuple[bool, date, date]:
    """Resolve date range from CLI arguments.

    Args:
        month: Optional month string in YYYY-MM format
        days: Optional number of days

    Returns:
        Tuple of (is_monthly, start_date, end_date)
    """
    if days:
        # Use --days if explicitly provided (relative to today)
        current_start, current_end = calculate_days_range(days)
        return False, current_start, current_end

    if month:
        # Parse --month in YYYY-MM format
        try:
            year, month_num = parse_month_arg(month)
            current_start, current_end = month_to_date_range(year, month_num)
            return True, current_start, current_end
        except ValueError as e:
            console.print(f"[red]{e}[/red]")
            raise SystemExit(1)

    # Interactive mode: let user select year and month
    selected_year, selected_month = select_year_and_month()
    current_start, current_end = month_to_date_range(selected_year, selected_month)
    return True, current_start, current_end


if __name__ == "__main__":
    cli()
