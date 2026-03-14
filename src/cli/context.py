"""Context management commands: ``use`` and ``status``.

``use`` writes the active client to a ``.campaign-context`` file so that
subsequent commands can omit the ``client_id`` argument.

``status`` displays the current context and data-freshness overview.
"""

from __future__ import annotations

import json
from pathlib import Path

import click

CONTEXT_FILE = Path(".campaign-context")


def _write_context(client_id: str) -> None:
    """Persist *client_id* as the active context."""
    CONTEXT_FILE.write_text(json.dumps({"client_id": client_id}), encoding="utf-8")


def read_context() -> str | None:
    """Read the active client from the context file, if it exists."""
    if not CONTEXT_FILE.exists():
        return None
    try:
        data = json.loads(CONTEXT_FILE.read_text(encoding="utf-8"))
        return data.get("client_id")
    except (json.JSONDecodeError, KeyError):
        return None


def resolve_client_id(client_id: str | None) -> str:
    """Return *client_id* if given, otherwise fall back to context file.

    Raises :class:`click.UsageError` when neither source is available.
    """
    if client_id:
        return client_id
    ctx_id = read_context()
    if ctx_id:
        return ctx_id
    raise click.UsageError(
        "No client_id provided and no active context. "
        "Run 'campaign use <client_id>' first or pass a client_id argument."
    )


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

@click.command()
@click.argument("client_id")
@click.pass_context
def use(ctx: click.Context, client_id: str) -> None:
    """Set the active client context.

    Writes CLIENT_ID to .campaign-context so subsequent commands can
    omit the client_id argument.
    """
    from src.output import OutputFormat, output_data

    fmt = OutputFormat(ctx.obj["format"])

    # Validate the client exists in config
    from src.config import ConfigManager

    config_path = ctx.obj["config_path"]
    cm = ConfigManager(config_path)
    cm.load_config()
    clients = cm.get_clients()

    if clients and client_id not in clients:
        raise click.UsageError(
            f"Client '{client_id}' not found in {config_path}. "
            f"Available: {', '.join(clients)}"
        )

    _write_context(client_id)

    result = {"active_client": client_id, "context_file": str(CONTEXT_FILE)}
    output_data(result, fmt, title="Active Context")

    if not ctx.obj["quiet"]:
        click.echo(f"Context set to '{client_id}'.", err=True)


@click.command()
@click.pass_context
def status(ctx: click.Context) -> None:
    """Show current context and data freshness."""
    from src.output import OutputFormat, output_data

    fmt = OutputFormat(ctx.obj["format"])
    active = read_context()

    info: dict = {
        "active_client": active or "(none)",
        "context_file": str(CONTEXT_FILE),
        "context_file_exists": CONTEXT_FILE.exists(),
    }

    # If there is an active client, show data freshness
    if active:
        from src.storage import StorageManager

        storage = StorageManager()
        data_types = storage.list_data_types(active)
        info["data_types"] = data_types if data_types else []

        import datetime

        freshness: dict = {}
        data_dir = Path("data") / active
        if data_dir.exists():
            for dt_dir in sorted(data_dir.iterdir()):
                if dt_dir.is_dir():
                    parquets = sorted(dt_dir.glob("*.parquet"))
                    if parquets:
                        latest = parquets[-1]
                        mtime = datetime.datetime.fromtimestamp(latest.stat().st_mtime)
                        freshness[dt_dir.name] = mtime.isoformat(timespec="seconds")
        info["data_freshness"] = freshness

    output_data(info, fmt, title="Campaign Status")
