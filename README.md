# Ads Report Automation CLI

A CLI for fetching advertising and web analytics data, storing it in partitioned Parquet files, and generating both an internal diagnostic report and a client-facing summary.

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

Client config now uses three top-level sections:
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

Fetch configured sources:

```bash
uv run campaign fetch nota
uv run campaign fetch nota --month 2026-01
```

Analyze cached data:

```bash
uv run campaign analyze nota --month 2026-01
uv run campaign analyze nota --brand "Nota Cafe" --format json
```

High-level workflows:

```bash
uv run campaign check nota --month 2026-01
uv run campaign investigate nota --brand "Nota Cafe" --metric cpl --month 2026-01
uv run campaign brief nota --month 2026-01
uv run campaign report nota --brand "Nota Cafe" --month 2026-01
```

Discovery helpers:

```bash
uv run campaign config list
uv run campaign brands list nota
uv run campaign tools --format json
```

## Output

- Reports: `reports/{client}_{YYYY-MM}.md` and `reports/{client}_{YYYY-MM}_summary.md`
- Brand-scoped reports: `reports/{client}_{brand}_{YYYY-MM}.md`
- Stored data: `data/{client_id}/{data_type}/{YYYY-MM}.parquet`

Persisted records now include `source_alias` alongside raw IDs. After a config-schema cutover, rerun `campaign fetch` so stored data matches the current source registry.

## Project Structure

```text
ads-report-automation/
├── config/
│   ├── defaults.yaml
│   └── clients/
├── src/
│   ├── cli/
│   ├── config/
│   ├── fetchers/
│   ├── analyzers/
│   ├── reporting/
│   ├── models/
│   ├── pipeline.py
│   └── storage.py
├── data/
├── reports/
└── tests/
```
