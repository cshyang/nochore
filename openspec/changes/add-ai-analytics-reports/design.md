# Design: Add AI-Ready Analytics Reports

## Technical Decisions

### 1. Storage Strategy: Partitioned Parquet

**Decision:** Use monthly-partitioned Parquet files per client and data type.

**Rationale:**
- Efficient columnar storage for analytics queries
- Natural monthly partitioning matches reporting cadence
- Polars integration for fast reads/writes
- No external database dependency

**Structure:**
```
data/{client_id}/
├── search_terms/2025-01.parquet
├── impression_share/2025-01.parquet
├── quality_scores/2025-01.parquet
└── campaigns/2025-01.parquet
```

**Trade-offs:**
- (+) Simple, portable, fast
- (+) Easy backup and versioning
- (-) No concurrent writes (acceptable for batch processing)
- (-) Manual deduplication needed

### 2. Deduplication Strategy

**Decision:** Dedupe by composite key (date + entity_id) on append.

**Rationale:**
- Re-running reports should not create duplicates
- Allow partial day updates (latest wins)

**Implementation:**
```python
def append(records: List[Record], data_type: str):
    existing = read_current_month()
    combined = existing + records
    deduped = combined.unique(subset=['date', get_id_column(data_type)])
    write(deduped)
```

### 3. Currency Handling

**Decision:** Store costs in original currency, convert at report time.

**Rationale:**
- Preserves data accuracy
- User already has multi-currency support
- Exchange rates change; raw data shouldn't

**Implementation:**
- All `cost` fields stored with `currency` field
- Report generator handles display formatting

### 4. Google Ads API Optimization

**Decision:** Use segmented queries with streaming pagination.

**Rationale:**
- Search terms can return 10K+ rows
- API has 15K operations/day quota
- Streaming prevents memory issues

**Implementation:**
```python
def fetch_search_terms(customer_id, start_date, end_date):
    query = """
        SELECT ... FROM search_term_view
        WHERE segments.date BETWEEN '{start}' AND '{end}'
        AND metrics.impressions > 0
    """
    # Stream results with GoogleAdsClient
    for batch in stream_results(query):
        yield batch
```

### 5. Analyzer Independence

**Decision:** Each analyzer operates independently on stored data.

**Rationale:**
- Testable in isolation
- Can re-run analysis without re-fetching
- Parallelizable if needed

**Interface:**
```python
class BaseAnalyzer:
    def __init__(self, storage: StorageManager, client_id: str):
        self.storage = storage
        self.client_id = client_id

    def analyze(self, start_date: date, end_date: date) -> AnalysisResult:
        raise NotImplementedError
```

### 6. Markdown Report Structure

**Decision:** Use consistent, parseable markdown with semantic sections.

**Rationale:**
- LLMs excel at structured markdown
- Tables are machine-readable
- Headers provide navigation

**Conventions:**
- H1 = Report title
- H2 = Major sections (Search Terms, Impression Share, etc.)
- H3 = Subsections (Negative Keywords, Top Performers, etc.)
- Tables = Structured data with clear headers
- Bold = Key metrics and recommendations
- Lists = Actionable items

### 7. Insight Generation Thresholds

**Decision:** Use configurable thresholds with sensible defaults.

| Insight | Metric | Default Threshold |
|---------|--------|-------------------|
| Negative keyword | Spend w/ 0 conv | > $50 |
| Negative keyword | CTR | < 0.5% |
| Low impression share | IS received | < 50% |
| Low QS alert | Quality Score | <= 5 |
| QS significant spend | Cost | > $100/month |
| Anomaly detection | Z-score | > 2.0 |

**Implementation:**
```python
@dataclass
class AnalyzerConfig:
    neg_kw_spend_threshold: float = 50.0
    neg_kw_ctr_threshold: float = 0.5
    low_is_threshold: float = 50.0
    low_qs_threshold: int = 5
    # ...
```

## Alternatives Considered

### Storage: SQLite vs Parquet
- SQLite would allow SQL queries but adds dependency
- Parquet is simpler for append-only batch processing
- **Chose Parquet** for simplicity

### Report Format: JSON vs Markdown
- JSON is more machine-parseable
- Markdown is readable by both humans and LLMs
- **Chose Markdown** per user requirement

### Analysis: Real-time vs Batch
- Real-time would require persistent service
- Batch fits CLI tool model
- **Chose Batch** for simplicity
