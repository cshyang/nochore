"""Interactive date selection utilities for CLI."""

from datetime import date, timedelta
from typing import Tuple

import inquirer
from rich.console import Console

console = Console()


def get_available_years() -> list[int]:
    """Get list of years available for reporting (current year and previous years with data)."""
    today = date.today()
    current_year = today.year
    # Make data available from 2 years back to allow for historical reporting
    return list(range(current_year - 2, current_year + 1))


def get_months_for_year(year: int) -> list[tuple[int, str]]:
    """Get available months for a given year.

    Returns list of (month_number, month_name) tuples.
    For current year, only return months up to current month.
    """
    today = date.today()
    current_year = today.year
    current_month = today.month

    months = [
        (1, "January"),
        (2, "February"),
        (3, "March"),
        (4, "April"),
        (5, "May"),
        (6, "June"),
        (7, "July"),
        (8, "August"),
        (9, "September"),
        (10, "October"),
        (11, "November"),
        (12, "December"),
    ]

    if year == current_year:
        # Only return months up to current month for current year
        months = [(m, name) for m, name in months if m <= current_month]

    return months


def select_year_and_month() -> Tuple[int, int]:
    """Interactive year and month selector using keyboard navigation.

    Returns tuple of (year, month) selected by user.
    """
    console.print()
    console.print("[bold cyan]📅 Select Report Period[/bold cyan]")
    console.print()

    # Step 1: Select year
    years = get_available_years()
    today = date.today()

    year_choices = []
    year_display = []
    for year in years:
        is_current = year == today.year
        year_choices.append(year)

        if is_current:
            year_display.append(f"●  {year}  (current year)")
        else:
            year_display.append(f"○  {year}")

    questions = [
        inquirer.List(
            "year",
            message="Year",
            choices=year_display,
            default=year_display[-1],  # Default to current year
            carousel=False,
        ),
    ]

    answers = inquirer.prompt(questions)
    selected_year = years[year_display.index(answers["year"])]

    # Step 2: Select month
    console.print()
    months = get_months_for_year(selected_year)

    month_choices = []
    month_display = []
    for month_num, month_name in months:
        is_current = selected_year == today.year and month_num == today.month
        month_choices.append(month_num)

        if is_current:
            month_display.append(f"●  {month_name:<12}(current month)")
        else:
            month_display.append(f"○  {month_name:<12}")

    questions = [
        inquirer.List(
            "month",
            message="Month",
            choices=month_display,
            default=month_display[-1],  # Default to most recent available month
            carousel=False,
        ),
    ]

    answers = inquirer.prompt(questions)
    selected_month = months[month_display.index(answers["month"])][0]

    console.print()
    console.print(f"[bold green]✓[/bold green]  [bold]Report period selected:[/bold] [cyan]{selected_month:02d}/{selected_year}[/cyan]")
    console.print()

    return selected_year, selected_month


def month_to_date_range(year: int, month: int) -> Tuple[date, date]:
    """Convert year/month to start and end dates for that calendar month."""
    start_date = date(year, month, 1)

    # Get last day of month
    if month == 12:
        end_date = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end_date = date(year, month + 1, 1) - timedelta(days=1)

    return start_date, end_date
