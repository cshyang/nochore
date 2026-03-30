"""Formatting utilities for report generation."""

from typing import Any


def escape_table_cell(value: Any) -> str:
    """Escape values for safe inclusion in markdown tables."""
    if value is None:
        return ""

    text = str(value)
    text = text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", " ")
    text = text.replace("|", "\\|")
    return text.strip()


def format_change(pct: Any) -> str:
    """Format percentage change with +/- sign."""
    if pct is None:
        return "N/A"
    try:
        return f"{float(pct):+.1f}%"
    except Exception:
        return "N/A"


def format_count(value: Any) -> str:
    """Format numeric counts with thousands separators."""
    if value is None:
        return "0"
    try:
        num = float(value)
    except Exception:
        return str(value)
    if abs(num - round(num)) < 1e-6:
        return f"{int(round(num)):,}"
    return f"{num:,.1f}"


def format_pct(value: Any, digits: int = 2) -> str:
    """Format as a percentage string."""
    if value is None:
        return "N/A"
    try:
        return f"{float(value):.{digits}f}%"
    except Exception:
        return "N/A"


def format_money(currency: str, amount: Any) -> str:
    """Format a monetary value with currency prefix."""
    try:
        return f"{currency} {float(amount):,.2f}"
    except Exception:
        return f"{currency} 0.00"


def metric_label(raw: str) -> str:
    """Convert internal metric names to human-readable labels."""
    if raw == "conversions_primary":
        return "primary_leads"
    if raw == "conversions_secondary":
        return "secondary_conversions_google"
    return raw
