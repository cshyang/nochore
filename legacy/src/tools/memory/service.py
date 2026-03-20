"""Structured event-log memory store."""

from __future__ import annotations

import json
from dataclasses import asdict, is_dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional


class MemoryStore:
    """Append-only JSONL memory store per client."""

    FILES = {
        "experiments": "experiments.jsonl",
        "actions": "actions.jsonl",
        "outcomes": "outcomes.jsonl",
        "lessons": "lessons.jsonl",
    }

    def __init__(self, base_dir: str = "data"):
        self.base_dir = Path(base_dir)

    def _memory_dir(self, client_id: str) -> Path:
        path = self.base_dir / client_id / "memory"
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _file_path(self, client_id: str, kind: str) -> Path:
        if kind not in self.FILES:
            raise ValueError(f"Unknown memory kind: {kind}")
        return self._memory_dir(client_id) / self.FILES[kind]

    def append(self, client_id: str, kind: str, record: Any) -> Path:
        """Append a record to the JSONL log."""
        payload = asdict(record) if is_dataclass(record) else dict(record)
        path = self._file_path(client_id, kind)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, default=str) + "\n")
        return path

    def read(
        self,
        client_id: str,
        kind: str,
        *,
        brand: str | None = None,
    ) -> List[Dict[str, Any]]:
        """Read records for a client and kind."""
        path = self._file_path(client_id, kind)
        if not path.exists():
            return []

        rows: List[Dict[str, Any]] = []
        for line in path.read_text(encoding="utf-8").splitlines():
            if not line.strip():
                continue
            row = json.loads(line)
            if brand and row.get("brand") != brand:
                continue
            rows.append(row)
        return rows

    def list_records(
        self,
        client_id: str,
        *,
        brand: str | None = None,
        kinds: Optional[Iterable[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Return all memory rows across kinds for a client."""
        selected = list(kinds or self.FILES.keys())
        rows: List[Dict[str, Any]] = []
        for kind in selected:
            for row in self.read(client_id, kind, brand=brand):
                row = dict(row)
                row["kind"] = kind
                rows.append(row)
        return rows

    def get_record(self, record_id: str) -> Optional[Dict[str, Any]]:
        """Find a record globally by record_id."""
        for client_dir in self.base_dir.iterdir():
            if not client_dir.is_dir():
                continue
            memory_dir = client_dir / "memory"
            if not memory_dir.exists():
                continue
            for kind, filename in self.FILES.items():
                path = memory_dir / filename
                if not path.exists():
                    continue
                for row in self.read(client_dir.name, kind):
                    if row.get("record_id") == record_id:
                        row = dict(row)
                        row["kind"] = kind
                        return row
        return None

    def search(
        self,
        client_id: str,
        query: str,
        *,
        brand: str | None = None,
    ) -> List[Dict[str, Any]]:
        """Search memory rows by naive case-insensitive text match."""
        needle = query.casefold()
        matches: List[Dict[str, Any]] = []
        for row in self.list_records(client_id, brand=brand):
            haystack = json.dumps(row, default=str).casefold()
            if needle in haystack:
                matches.append(row)
        return matches

    def summarize(self, client_id: str, *, brand: str | None = None) -> Path:
        """Generate a markdown summary from structured memory."""
        experiments = self.read(client_id, "experiments", brand=brand)
        actions = self.read(client_id, "actions", brand=brand)
        outcomes = self.read(client_id, "outcomes", brand=brand)
        lessons = self.read(client_id, "lessons", brand=brand)

        path = self._memory_dir(client_id) / "summary.md"
        lines = [f"# Optimization Memory — {client_id}", ""]
        if brand:
            lines.extend([f"**Brand:** {brand}", ""])

        lines.extend(["## Experiments", ""])
        if experiments:
            for row in experiments[-20:]:
                lines.append(f"- `{row.get('experiment_id')}` {row.get('title', 'Untitled')} [{row.get('status', 'unknown')}]")
        else:
            lines.append("- No experiments recorded.")

        lines.extend(["", "## Actions", ""])
        if actions:
            for row in actions[-20:]:
                lines.append(f"- `{row.get('action_id')}` {row.get('action_type', 'unknown')} [{row.get('status', 'unknown')}]")
        else:
            lines.append("- No actions recorded.")

        lines.extend(["", "## Outcomes", ""])
        if outcomes:
            for row in outcomes[-20:]:
                lines.append(f"- `{row.get('outcome_id')}` {row.get('status', 'unknown')}")
        else:
            lines.append("- No outcomes recorded.")

        lines.extend(["", "## Lessons", ""])
        if lessons:
            for row in lessons[-20:]:
                lines.append(f"- `{row.get('lesson_id')}` {row.get('title', 'Untitled')} [{row.get('status', 'unknown')}]")
        else:
            lines.append("- No lessons recorded.")

        path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        return path
