"""Output formatting for CLI commands.

Supports table (human), json (agent), and csv output modes.
"""

import json
import sys
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Union

from rich.console import Console
from rich.table import Table

console = Console(stderr=True)  # Rich output to stderr, data to stdout


class OutputFormat(str, Enum):
    TABLE = "table"
    JSON = "json"
    CSV = "csv"


def _serialize(obj: Any) -> Any:
    """Make objects JSON-serializable."""
    if is_dataclass(obj) and not isinstance(obj, type):
        return asdict(obj)
    if isinstance(obj, (date, datetime)):
        return obj.isoformat()
    if isinstance(obj, Enum):
        return obj.value
    if isinstance(obj, set):
        return list(obj)
    return obj


def output_json(data: Any) -> None:
    """Print data as JSON to stdout."""
    print(json.dumps(data, default=_serialize, indent=2))


def output_table(title: str, rows: List[Dict[str, Any]], columns: Optional[List[str]] = None) -> None:
    """Print data as a Rich table to stderr (visible to humans)."""
    if not rows:
        console.print(f"[dim]No data for: {title}[/dim]")
        return

    table = Table(title=title)
    cols = columns or list(rows[0].keys())
    for col in cols:
        table.add_column(col)
    for row in rows:
        table.add_row(*[str(row.get(c, "")) for c in cols])
    console.print(table)


def output_data(data: Any, fmt: OutputFormat, title: str = "", columns: Optional[List[str]] = None) -> None:
    """Route output to the appropriate formatter."""
    if fmt == OutputFormat.JSON:
        if is_dataclass(data) and not isinstance(data, type):
            output_json(asdict(data))
        elif isinstance(data, list) and data and is_dataclass(data[0]):
            output_json([asdict(item) for item in data])
        else:
            output_json(data)
    elif fmt == OutputFormat.TABLE:
        if is_dataclass(data) and not isinstance(data, type):
            rows = [asdict(data)]
        elif isinstance(data, list) and data and is_dataclass(data[0]):
            rows = [asdict(item) for item in data]
        elif isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
        else:
            console.print(str(data))
            return
        output_table(title, rows, columns)
    elif fmt == OutputFormat.CSV:
        import csv
        import io
        if is_dataclass(data) and not isinstance(data, type):
            rows = [asdict(data)]
        elif isinstance(data, list) and data and is_dataclass(data[0]):
            rows = [asdict(item) for item in data]
        elif isinstance(data, list):
            rows = data
        elif isinstance(data, dict):
            rows = [data]
        else:
            print(str(data))
            return
        if rows:
            writer = csv.DictWriter(sys.stdout, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
