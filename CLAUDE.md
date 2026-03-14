# Campaign CLI

Campaign analytics tool for managing Google Ads and Meta advertising across multiple clients.

## Quick Reference

```bash
campaign                          # interactive REPL
campaign status                   # current context + data freshness
campaign use <client_id>          # set active client
campaign check [client_id]        # health dashboard (fetch + analyze)
campaign investigate --metric cpl # diagnostic deep dive
campaign brief [client_id]        # generate client report
campaign --format json <cmd>      # machine-readable output for agents
campaign tools                    # list all capabilities
```

## Project Structure

- `src/cli/` — Click CLI (porcelain + plumbing pattern)
- `src/analyzers/` — 6 analyzers (search terms, impression share, quality score, trends, composition, diagnostic engine)
- `src/fetchers/` — Meta Ads + Google Ads API integrations
- `src/reporting/` — Markdown report generation
- `src/pipeline.py` — fetch_client(), analyze_client(), generate_reports()
- `config/` — Per-client YAML configs with shared defaults merging
- `data/<client_id>/` — Partitioned Parquet storage + knowledge.md

## Key Patterns

- **Porcelain commands** (check, investigate, brief) chain plumbing operations (fetch, analyze, report)
- **`--format json`** on every command for agent consumption; Rich tables for humans
- **`--brand` flag** on porcelain commands to scope analysis to a specific brand
- **Knowledge file** at `data/<client_id>/knowledge.md` — read before analysis, write after
- **Config merging** — `config/defaults.yaml` merged with `config/clients/<id>.yaml` (lists append, dicts deep-merge)
- **Python 3.9+** — use `from __future__ import annotations` for union type hints

## Tech Stack

Python 3.9+, Click (CLI), Polars (dataframes), Rich (output), PyYAML (config), Parquet (storage), prompt_toolkit (REPL)
