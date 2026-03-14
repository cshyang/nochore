"""Top-level Click group for the campaign CLI.

Provides global flags (--format, --quiet, --verbose, --config) and
registers all subcommands and subgroups.
"""

import click

from .context import use, status
from .plumbing import fetch, analyze, report
from .porcelain import check, investigate, brief
from .config_cmd import config
from .tools_cmd import tools


@click.group()
@click.option(
    "--format",
    "output_format",
    type=click.Choice(["table", "json", "csv"], case_sensitive=False),
    default="table",
    show_default=True,
    help="Output format.",
)
@click.option("--quiet", "-q", is_flag=True, help="Suppress non-essential output.")
@click.option("--verbose", "-v", is_flag=True, help="Enable verbose logging.")
@click.option(
    "--config",
    "config_path",
    default="clients.yaml",
    show_default=True,
    help="Path to client configuration file.",
)
@click.pass_context
def cli(ctx: click.Context, output_format: str, quiet: bool, verbose: bool, config_path: str) -> None:
    """Campaign CLI -- analytics pipeline for ad campaign management."""
    ctx.ensure_object(dict)
    ctx.obj["format"] = output_format
    ctx.obj["quiet"] = quiet
    ctx.obj["verbose"] = verbose
    ctx.obj["config_path"] = config_path

    if verbose:
        import logging
        logging.basicConfig(level=logging.DEBUG)


# Register commands
cli.add_command(use)
cli.add_command(status)
cli.add_command(check)
cli.add_command(investigate)
cli.add_command(brief)
cli.add_command(fetch)
cli.add_command(analyze)
cli.add_command(report)
cli.add_command(config)
cli.add_command(tools)
