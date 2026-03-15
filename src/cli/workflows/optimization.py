"""Optimization workflow payload builders."""

from __future__ import annotations

from typing import Any, Dict

from .common import scope_payload


def build_optimize_status(
    client_id: str,
    brand: str | None,
    status: str,
    message: str | None = None,
) -> Dict[str, Any]:
    """Common optimize status payload."""
    payload = {
        **scope_payload(client_id, brand),
        "status": status,
    }
    if message:
        payload["message"] = message
    return payload
