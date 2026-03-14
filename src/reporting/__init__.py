"""Reporting entrypoints and shared helpers."""

from .brand_scope import canonicalize_brand_name, filter_to_brand, list_brands, match_brand
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
    "canonicalize_brand_name",
    "compute_kpi_summary",
    "filter_to_brand",
    "list_brands",
    "match_brand",
    "normalize_campaigns",
]
