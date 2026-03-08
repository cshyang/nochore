"""Reporting entrypoints and shared helpers."""

from .calculations import compute_kpi_summary
from .client_summary import ClientSummaryGenerator
from .internal import InternalReportGenerator
from .summary_builder import (
    assign_brands,
    assign_themes,
    build_client_summary_report,
    normalize_campaigns,
)

__all__ = [
    "ClientSummaryGenerator",
    "InternalReportGenerator",
    "assign_brands",
    "assign_themes",
    "build_client_summary_report",
    "compute_kpi_summary",
    "normalize_campaigns",
]
