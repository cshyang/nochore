"""Top-level Click group for the campaign CLI."""

import click

from .commands.analyze import analyze
from .commands.config import config
from .commands.context import context
from .commands.data import data
from .commands.google_ads import google_ads
from .commands.memory import memory
from .commands.meta import meta
from .commands.optimize import optimize
from .commands.report import report
from .commands.tools import tools


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
    default="config",
    show_default=True,
    help="Path to config directory or legacy clients.yaml file.",
)
@click.pass_context
def cli(ctx: click.Context, output_format: str, quiet: bool, verbose: bool, config_path: str) -> None:
    """Campaign CLI -- analytics pipeline for ad campaign management."""
    from src.output import OutputFormat

    ctx.ensure_object(dict)
    ctx.obj["format"] = OutputFormat(output_format)
    ctx.obj["quiet"] = quiet
    ctx.obj["verbose"] = verbose
    ctx.obj["config_path"] = config_path

    if verbose:
        import logging
        logging.basicConfig(level=logging.DEBUG)


# Register commands
cli.add_command(context)
cli.add_command(data)
cli.add_command(analyze)
cli.add_command(report)
cli.add_command(optimize)
cli.add_command(memory)
cli.add_command(google_ads)
cli.add_command(meta)
cli.add_command(config)
cli.add_command(tools)
