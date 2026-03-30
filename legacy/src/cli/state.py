"""CLI context state helpers."""

from __future__ import annotations

import json
from pathlib import Path

import click

CONTEXT_FILE = Path(".campaign-context")


def write_context(client_id: str) -> None:
    """Persist the active client identifier."""
    CONTEXT_FILE.write_text(json.dumps({"client_id": client_id}), encoding="utf-8")


def read_context() -> str | None:
    """Return the active client identifier, if present."""
    try:
        data = json.loads(CONTEXT_FILE.read_text(encoding="utf-8"))
        return data.get("client_id")
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return None


def resolve_client_id(client_id: str | None) -> str:
    """Return the explicit client identifier or the active context."""
    if client_id:
        return client_id
    ctx_id = read_context()
    if ctx_id:
        return ctx_id
    raise click.UsageError(
        "No client_id provided and no active context. "
        "Run 'campaign context use <client_id>' first or pass a client_id argument."
    )
