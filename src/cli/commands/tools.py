"""Top-level tools manifest command."""

from __future__ import annotations

import click

TOOL_MANIFEST = {
    "global_options": {
        "--format": "table|json|csv (must come before subcommand)",
        "--quiet": "Suppress non-essential output",
        "--verbose": "Enable debug logging",
        "--config": "Path to config directory (default: config)",
    },
    "groups": [
        {
            "name": "context",
            "description": "Active client context commands",
            "subcommands": ["use", "status"],
        },
        {
            "name": "data",
            "description": "Source sync and cache inspection",
            "subcommands": ["sync", "freshness", "sources"],
        },
        {
            "name": "analyze",
            "description": "Analysis workflows and brand discovery",
            "subcommands": ["run", "check", "investigate", "brands"],
        },
        {
            "name": "report",
            "description": "Report generation workflows",
            "subcommands": ["brief", "generate"],
        },
        {
            "name": "optimize",
            "description": "Optimization planning and lifecycle workflows",
            "subcommands": ["plan", "run", "review", "learn"],
        },
        {
            "name": "memory",
            "description": "Structured optimization memory tools",
            "subcommands": ["list", "show", "search", "summarize"],
        },
        {
            "name": "google-ads",
            "description": "Google Ads mutation primitives with a live Homescape canary path",
            "subcommands": ["add-negative", "adjust-budget"],
        },
        {
            "name": "meta",
            "description": "Meta dry-run mutation primitives",
            "subcommands": ["create-variant", "adjust-budget"],
        },
        {
            "name": "config",
            "description": "Configuration and credential inspection",
            "subcommands": ["list", "check-creds"],
        },
    ],
    "memory": {
        "source_of_truth": "data/<client_id>/memory/*.jsonl",
        "derived_summary": "data/<client_id>/memory/summary.md",
    },
}


@click.command()
@click.pass_context
def tools(ctx: click.Context) -> None:
    """List available campaign CLI capabilities as JSON for agent discovery."""
    from src.output import output_data

    output_data(TOOL_MANIFEST, ctx.obj["format"], title="Available Tools")
