"""``tools`` command -- agent capability discovery.

Outputs a machine-readable manifest of all campaign CLI capabilities
so that AI agents can discover what tools are available.
"""

import click

TOOL_MANIFEST = [
    {
        "name": "check",
        "description": "Quick health dashboard -- fetches data, runs all analyzers, shows alerts",
        "params": ["client_id", "--month", "--days"],
        "when_to_use": "When you want an overview of how a client is doing",
    },
    {
        "name": "investigate",
        "description": "Deep diagnostic investigation into why a specific metric changed",
        "params": ["client_id", "--metric (cpl|cvr|volume)", "--month", "--days"],
        "when_to_use": "When CPL, CVR, or volume has changed and you need to understand why",
    },
    {
        "name": "brief",
        "description": "Generate a client-ready summary report",
        "params": ["client_id", "--month", "--days"],
        "when_to_use": "When preparing for a client call or need a shareable summary",
    },
    {
        "name": "fetch",
        "description": "Pull data from ad platforms (Google Ads, Meta) and store locally",
        "params": ["client_id", "--platform (google|meta|all)", "--month", "--days"],
        "when_to_use": "When you need fresh data before analysis",
    },
    {
        "name": "analyze",
        "description": "Run analyzers on stored data and return structured results",
        "params": ["client_id", "--only (search-terms,trends,...)", "--month", "--days"],
        "when_to_use": "When you need specific analyzer output, not a full health check",
    },
    {
        "name": "report",
        "description": "Generate markdown reports from analysis results",
        "params": ["client_id", "--type (internal|summary|all)", "--month", "--days"],
        "when_to_use": "When you need to save a report to disk",
    },
]


@click.command()
@click.pass_context
def tools(ctx: click.Context) -> None:
    """List available campaign CLI capabilities as JSON for agent discovery."""
    from src.output import OutputFormat, output_data

    fmt = OutputFormat(ctx.obj["format"])
    output_data(TOOL_MANIFEST, fmt, title="Available Tools", columns=["name", "description", "when_to_use"])
