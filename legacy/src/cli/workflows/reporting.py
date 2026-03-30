"""Reporting workflow payload builders."""

from __future__ import annotations

from typing import Any, Dict, Optional

from .common import scope_payload


def build_report_payload(
    client_id: str,
    brand: str | None,
    period: str,
    internal_report: Optional[str],
    client_summary: Optional[str],
) -> Dict[str, Any]:
    """Standard report/brief response payload."""
    return {
        **scope_payload(client_id, brand),
        "period": period,
        "internal_report": internal_report,
        "client_summary": client_summary,
        "status": "complete",
    }
