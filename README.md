# Ads Report Automation CLI

A command-line tool for automated advertising performance reports that pulls data from Meta and Google Ads APIs, stores it in partitioned Parquet files, and generates dual markdown outputs from one pipeline run: an internal diagnostic report and a compact client summary.

## 🚀 Features

- **Multi-platform data aggregation** (Meta Ads, Google Ads)
- **Configurable historical windows** (`--days`)
- **Partitioned Parquet storage** per client/data type (monthly partitions)
- **LLM-optimized markdown reports** in `reports/`
- **Search terms analysis** (negative keyword candidates, match-type distribution)
- **Impression share analysis** (budget vs rank loss, recommendations)
- **Quality score analysis** (changes, low-QS alerts, distribution)
- **Trends & anomaly detection** (campaign performance time series)

## 📋 Requirements

- Python 3.9+
- UV (recommended package manager)

## 🛠️ Installation

```bash
# Clone the repository
git clone <repository-url>
cd ads-report-automation

# Install dependencies with UV
uv sync

# Or with pip (if you prefer)
pip install -r requirements.txt
```

## ⚙️ Configuration

### 1. API Credentials

Create a `.env.local` file in the project root with your API credentials:

```bash
# Meta Ads API (required)
META_ACCESS_TOKEN=your_meta_access_token

# Google Ads API (required - all 4 credentials needed)
GOOGLE_ADS_DEVELOPER_TOKEN=your_developer_token
GOOGLE_ADS_CLIENT_ID=your_client_id
GOOGLE_ADS_CLIENT_SECRET=your_client_secret
GOOGLE_ADS_REFRESH_TOKEN=your_refresh_token
```

**Note**:
- For **Meta Ads**, you only need the `META_ACCESS_TOKEN` (API v22.0)
- For **Google Ads**, you need all 4 OAuth credentials (API v21)
- If credentials are missing, the tool will skip API fetching (you can still re-generate reports from existing stored data with `--no-fetch`)

**Getting Google Ads OAuth Credentials:**

Follow the detailed guide: [docs/GOOGLE_ADS_OAUTH_SETUP.md](docs/GOOGLE_ADS_OAUTH_SETUP.md)

### 2. Client Configuration

Edit `clients.yaml` to configure your ad accounts:

```yaml
clients:
  your_client:
    meta:
      system_user_id: "your_system_user_id"
      ad_accounts:
        - id: "act_123456789"
          name: "Account Name"
    google_ads:
      customer_ids:
        - "123-456-7890"
```

### Configuration Validation

The CLI automatically validates your configuration and logs any errors:

- ✅ Validates client structure
- ✅ Checks required fields
- ✅ Validates account ID formats
- ✅ Provides clear error messages

### Check Credentials

Verify your API credentials are configured correctly:

```bash
uv run ads-report --check-creds
```

## 📊 Usage

### Basic Usage

```bash
# Run reports for all clients
uv run ads-report

# Run for specific client
uv run ads-report --client homescape

# Specify custom window length
uv run ads-report --days 90

# Use stored data only (skip API fetch)
uv run ads-report --no-fetch
```

### Advanced Options

```bash
# Custom configuration file
uv run ads-report --config custom_clients.yaml

# Custom output directory
uv run ads-report --output-dir custom_reports

# Verbose logging
uv run ads-report --verbose

# View help
uv run ads-report --help
```

### Make Targets

```bash
make sync
make run CLIENT=nota MONTH=2026-01
make no-fetch CLIENT=nota MONTH=2026-01
make test
```

## 📈 Output

### Reports
- **Internal diagnostic report**: `reports/{client}_{YYYY-MM}.md`
- **Client summary report**: `reports/{client}_{YYYY-MM}_summary.md`

### Data Files
- **Partitioned Parquet**: `data/{client_id}/{data_type}/{YYYY-MM}.parquet`
- Data types include: `campaigns`, `conversion_actions`, `search_terms`, `impression_share`, `quality_scores`

### Logs
- **Log files**: `logs/ads_report.log`

## 📊 Fact Performance Schema

The unified `fact_performance_daily` table includes:

| Column | Type | Description |
|--------|------|-------------|
| client_id | string | Client identifier |
| platform | string | 'meta' or 'google_ads' |
| source_account_id | string | Original account/customer ID |
| date | date | Performance date |
| campaign_id | string | Campaign identifier |
| campaign_name | string | Campaign name |
| spend | float | Total spend |
| impressions | int | Ad impressions |
| clicks | int | Click count |
| conversions_primary | int | Primary conversions |
| conversion_value | float | Conversion value |

## 🔍 KPI Calculations

### Core Metrics
- **CPC**: Cost Per Click
- **CTR**: Click-Through Rate
- **Conversion Rate**: Conversions per click
- **ROAS**: Return On Ad Spend

### Comparisons
- **Last 30 days** vs **Previous 30 days**
- **Percentage changes** with trend indicators
- **Platform-level** breakdowns
- **Campaign-level** performance

### Anomaly Detection
- **High spend, zero conversions** (> $1,000 threshold)
- **Low CTR** (< 0.5% threshold)
- **High CPC** (> $10 threshold)

## 🔧 Development

### Project Structure
```
ads-report-automation/
├── src/
│   ├── main.py              # CLI entry point
│   ├── pipeline.py          # Fetch -> store -> analyze -> report orchestration
│   ├── storage.py           # Partitioned Parquet storage
│   ├── config/              # Client/reporting config and diagnostic config
│   ├── models/              # Core records, diagnostics, reporting view models
│   ├── fetchers/            # API data fetchers
│   ├── analyzers/           # Insight engines
│   ├── diagnostics/         # Diagnostic tree logic
│   └── reporting/           # Internal + client report generation
├── data/                    # Parquet data files
├── logs/                    # Application logs
├── reports/                 # Generated reports
├── clients.yaml             # Client config, theme rules, brand rules
├── config/diagnostic_tree.yaml
├── tests/
├── pyproject.toml
└── README.md
```

### Key Technologies
- **Polars**: Fast data processing
- **Rich**: CLI output
- **Click**: Command-line interface
- **PyYAML**: Configuration parsing

## 🔮 Future Enhancements

- [x] Real API integration (Meta Business SDK, Google Ads API)
- [x] Authentication handling for production APIs
- [ ] More sophisticated anomaly detection
- [ ] Additional platform support
- [ ] Web dashboard for reports
- [ ] Scheduled report generation
- [ ] Data quality checks and validation

## 📝 License

This project is open source and available under the MIT License.
