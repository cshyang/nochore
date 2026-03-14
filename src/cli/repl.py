"""Interactive REPL for the campaign CLI.

Drops into a prompt_toolkit-powered shell when ``campaign`` is run
with no subcommand.  Commands are the same as one-shot usage, minus
the ``campaign`` prefix.
"""

from __future__ import annotations

import shlex
import sys

import click
from prompt_toolkit import PromptSession
from prompt_toolkit.auto_suggest import AutoSuggestFromHistory
from prompt_toolkit.history import FileHistory
from pathlib import Path

HISTORY_FILE = Path.home() / ".campaign_history"

BANNER = """\
\033[1mCampaign CLI\033[0m — interactive mode
Type any command (e.g. \033[36mcheck nota\033[0m, \033[36mstatus\033[0m, \033[36minvestigate --metric cpl\033[0m)
Type \033[36mhelp\033[0m to list commands, \033[36mexit\033[0m to quit.
"""


def _build_prompt(active_client: str | None) -> str:
    """Build the REPL prompt string showing active client context."""
    if active_client:
        return f"\033[36mcampaign\033[0m [\033[33m{active_client}\033[0m] > "
    return "\033[36mcampaign\033[0m > "


def start_repl(cli_group: click.Group, ctx: click.Context) -> None:
    """Launch the interactive REPL loop."""
    from .context import read_context

    click.echo(BANNER, err=True)

    session: PromptSession = PromptSession(
        history=FileHistory(str(HISTORY_FILE)),
        auto_suggest=AutoSuggestFromHistory(),
    )

    while True:
        active = read_context()
        prompt = _build_prompt(active)

        try:
            line = session.prompt(prompt)
        except (EOFError, KeyboardInterrupt):
            click.echo("\nBye.", err=True)
            break

        line = line.strip()
        if not line:
            continue
        if line in ("exit", "quit", "q"):
            click.echo("Bye.", err=True)
            break
        if line == "help":
            line = "--help"

        # Strip leading "campaign" if user types the full command
        if line.startswith("campaign "):
            line = line[len("campaign "):]

        try:
            args = shlex.split(line)
        except ValueError as exc:
            click.echo(f"Parse error: {exc}", err=True)
            continue

        cmd_name = args[0]
        cmd = cli_group.get_command(ctx, cmd_name)
        if cmd is None:
            click.echo(f"Unknown command: {cmd_name}. Type 'help' for available commands.", err=True)
            continue

        try:
            with cmd.make_context(cmd_name, args[1:], parent=ctx) as sub_ctx:
                cmd.invoke(sub_ctx)
        except SystemExit:
            pass
        except click.UsageError as exc:
            click.echo(f"Error: {exc.format_message()}", err=True)
        except click.Abort:
            click.echo("Aborted.", err=True)
        except Exception as exc:
            click.echo(f"Error: {exc}", err=True)
