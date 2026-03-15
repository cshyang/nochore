# Ads Report Automation CLI

An agent-native CLI for syncing advertising and web analytics data, running brand-scoped analysis, generating reports, and building structured optimization memory.

## Installation

```bash
git clone <repository-url>
cd ads-report-automation
uv sync
```

The installed command is `campaign`.

## Credentials

Create `.env.local` in the project root:

```bash
# Meta Ads API
META_ACCESS_TOKEN=your_meta_access_token

# Google Ads API
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_ADS_CLIENT_ID=your_client_id
GOOGLE_ADS_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token

# Optional: GA4/Search Console service account
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/google-service-account.json
```

Check configured credentials with:

```bash
uv run campaign config check-creds
```

## Client Config Schema

Client config uses three top-level sections:
- `context`: business context for humans and agents
- `sources`: fetchable source registry keyed by alias
- `business`: brands, themes, and lead-normalization rules

Example:

```yaml
context:
  business: "Refined Contemporary Restaurant Cafe"
  notes:
    - "Google Maps presence is important for foot traffic"

sources:
  google_ads:
    nota_ads:
      customer_id: "556-178-5391"
  meta:
    nota_meta:
      account_id: "act_356408676260419"
      name: "Nota Cafe"
  ga4:
    nota_site:
      property_id: "400716907"

business:
  brands:
    - name: "Nota Cafe"
      sources:
        - "nota_ads"
        - "nota_meta"
        - "nota_site"
      filters:
        nota_site:
          landing_page_regex: "/"
          key_events:
            - "form_submission"
            - "whatsapp_link_click"

  theme_rules:
    - source: "nota_meta"
      theme: "Seasonal - CNY"
      campaign_name_regex: "(?i)cny|seasonal"
    - source: "nota_ads"
      theme: "Performance Max - Google Map"
      campaign_name_regex: "(?i)performance max|pmax|map"

  lead_rules:
    google_ads:
      exclude_conversion_actions:
        - "Page View"
```

Defaults live in `config/defaults.yaml`. Client files live in `config/clients/<client>.yaml`.

## Usage

Context:

```bash
uv run campaign context use nota
uv run campaign context status
```

Data sync and cache inspection:

```bash
uv run campaign data sync nota --month 2026-01
uv run campaign data sources nota
uv run campaign data freshness nota
```

Analysis workflows:

```bash
uv run campaign analyze run nota --month 2026-01
uv run campaign analyze check nota --brand "Nota Cafe" --month 2026-01 --refresh
uv run campaign analyze investigate nota --brand "Nota Cafe" --metric cpl --month 2026-01
uv run campaign analyze brands nota
```

Reporting:

```bash
uv run campaign report brief nota --month 2026-01 --refresh
uv run campaign report generate nota --brand "Nota Cafe" --type all --month 2026-01
```

Optimization and memory:

```bash
uv run campaign optimize plan nota --brand "Nota Cafe" --month 2026-01
uv run campaign optimize run nota --brand "Nota Cafe" --month 2026-01 --dry-run
uv run campaign optimize review EXP-12345678
uv run campaign memory list nota
uv run campaign memory summarize nota --brand "Nota Cafe"
```

Low-level dry-run mutation tools:

```bash
uv run campaign google-ads add-negative nota --source nota_ads --campaign "Search" --search-term "junk query" --dry-run
uv run campaign meta create-variant nota --source nota_meta --adset-id 123 --name "Variant A" --message "Test copy" --dry-run
```

Discovery helpers:

```bash
uv run campaign config list
uv run campaign config check-creds
uv run campaign tools --format json
```

## Output

- Reports: `reports/{client}_{YYYY-MM}.md` and `reports/{client}_{YYYY-MM}_summary.md`
- Brand-scoped reports: `reports/{client}_{brand}_{YYYY-MM}.md`
- Stored data: `data/{client_id}/{data_type}/{YYYY-MM}.parquet`
- Structured memory: `data/{client_id}/memory/*.jsonl`
- Derived memory summary: `data/{client_id}/memory/summary.md`

Persisted source records include `source_alias` alongside raw IDs. Optimization memory is append-only JSONL; markdown summaries are generated from those records.

## Project Structure

```text
ads-report-automation/
├── config/
│   ├── defaults.yaml
│   └── clients/
├── src/
│   ├── cli/
│   │   ├── commands/
│   │   └── workflows/
│   ├── tools/
│   ├── engine/
│   ├── integrations/
│   ├── config/
│   ├── analyzers/
│   ├── reporting/
│   ├── models/
│   └── storage/
├── data/
├── reports/
└── tests/
```
