"""Date calculation utilities for ads report automation."""
from datetime import date, timedelta
from typing import Tuple


def calculate_previous_period(
    current_start: date,
    current_end: date,
    is_monthly: bool = True,
) -> Tuple[date, date]:
    """Calculate the comparison period dates.

    For monthly reports: previous calendar month (month-over-month comparison)
    For custom day ranges: previous period of same duration

    Args:
        current_start: Start date of current period
        current_end: End date of current period
        is_monthly: If True, use month-over-month comparison

    Returns:
        Tuple of (previous_start, previous_end) dates
    """
    period_days = (current_end - current_start).days + 1

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

    return previous_start, previous_end


def parse_month_arg(month_str: str) -> Tuple[int, int]:
    """Parse YYYY-MM string into (year, month) tuple.

    Args:
        month_str: Month string in YYYY-MM format (e.g., "2025-12")

    Returns:
        Tuple of (year, month) integers

    Raises:
        ValueError: If the format is invalid
    """
    try:
        year, month = map(int, month_str.split("-"))
        if not (1 <= month <= 12):
            raise ValueError(f"Month must be 1-12, got {month}")
        if year < 2000 or year > 2100:
            raise ValueError(f"Year must be 2000-2100, got {year}")
        return year, month
    except (ValueError, AttributeError) as e:
        raise ValueError(f"Invalid month format '{month_str}'. Use YYYY-MM (e.g., 2025-12)") from e


def calculate_days_range(days: int) -> Tuple[date, date]:
    """Calculate date range for last N days (ending yesterday).

    Args:
        days: Number of days to include in the range

    Returns:
        Tuple of (start_date, end_date)
    """
    current_end = date.today() - timedelta(days=1)
    current_start = current_end - timedelta(days=max(days - 1, 0))
    return current_start, current_end
