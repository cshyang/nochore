# CLI Interface Contract

**Feature**: 001-diagnostic-tree
**Date**: 2025-12-27

---

## Extended CLI Commands

The diagnostic tree feature extends the existing `ads-report` CLI with new options.

### Current CLI (unchanged)

```bash
ads-report [OPTIONS]

Options:
  --client TEXT       Target specific client
  --month TEXT        Target month (YYYY-MM format)
  --days INTEGER      Custom day range
  --no-fetch          Skip API calls, use stored data
  --check-creds       Validate credentials
  --verbose           Debug logging
```

### New Options

```bash
ads-report [OPTIONS]

# Existing options...

# NEW: Audience selection
--audience [internal|client]   Report audience type (default: internal)

# NEW: Diagnostic control
--diagnose / --no-diagnose     Run diagnostic investigation (default: --diagnose)
--dimensions TEXT              Dimensions to analyze (comma-separated: device,geo,hour)
                               Default: device,geo,hour

# NEW: Output control
--format [markdown|json]       Output format (default: markdown)
```

---

## Usage Examples

### Generate internal diagnostic report (default)

```bash
ads-report --client last-minute --month 2025-12
```

Output: `monthly_summaries/last-minute_2025-12.md` with full diagnostic details.

### Generate client-facing report

```bash
ads-report --client last-minute --month 2025-12 --audience client
```

Output: `monthly_summaries/last-minute_2025-12_client.md` with narrative summary.

### Skip diagnostic investigation

```bash
ads-report --client last-minute --month 2025-12 --no-diagnose
```

Output: Standard report without root cause investigation section.

### Analyze specific dimensions only

```bash
ads-report --client last-minute --month 2025-12 --dimensions device,geo
```

Output: Full report with only device and geo composition analysis (no hourly).

### JSON output for programmatic use

```bash
ads-report --client last-minute --month 2025-12 --format json
```

Output: `monthly_summaries/last-minute_2025-12.json` with structured data.

---

## Output File Naming

| Audience | Format | Filename Pattern |
|----------|--------|------------------|
| internal | markdown | `{client}_{period}.md` |
| client | markdown | `{client}_{period}_client.md` |
| internal | json | `{client}_{period}.json` |
| client | json | `{client}_{period}_client.json` |

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Configuration error (missing client, invalid config) |
| 3 | Data error (no data for period, API failure) |
| 4 | Credential error (invalid or missing API credentials) |

---

## Environment Variables

| Variable | Purpose | Default |
|----------|---------|---------|
| `ADS_REPORT_CONFIG_DIR` | Path to config directory | `./config` |
| `ADS_REPORT_DATA_DIR` | Path to data directory | `./data` |
| `ADS_REPORT_OUTPUT_DIR` | Path to output directory | `./monthly_summaries` |
| `ADS_REPORT_LOG_LEVEL` | Logging level | `INFO` |
