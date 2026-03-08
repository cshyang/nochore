# Quickstart: Diagnostic Tree Implementation

**Feature**: 001-diagnostic-tree
**Date**: 2025-12-27

---

## Overview

This guide provides the implementation order and key decisions for building the diagnostic tree system.

---

## Implementation Order

### Phase 1: Data Foundation (P1 - Composition Analysis)

**Goal**: Fetch and store dimension breakdowns.

1. **Extend data_models.py**
   - Add `DimensionBreakdownRecord` dataclass
   - Location: `src/data_models.py`

2. **Extend Google Ads fetcher**
   - Add `fetch_device_breakdown()` method
   - Add `fetch_geo_breakdown()` method
   - Add `fetch_hourly_breakdown()` method
   - Location: `src/fetchers/google_ads.py`

3. **Extend Meta Ads fetcher**
   - Add `fetch_device_breakdown()` method
   - Add `fetch_placement_breakdown()` method
   - Location: `src/fetchers/meta_ads.py`

4. **Extend storage layer**
   - Add handling for `dimension_breakdown` data type
   - Location: `src/storage.py`

### Phase 2: Composition Analyzer (P1 - Composition Analysis)

**Goal**: Analyze dimension composition and detect shifts.

1. **Create composition analyzer**
   - `CompositionAnalyzer` class
   - Methods: `analyze_dimension()`, `detect_shifts()`, `calculate_efficiency()`
   - Location: `src/analyzers/composition.py`

2. **Add composition data models**
   - `CompositionBreakdown`, `CompositionSegment`, `CompositionShift`
   - Location: `src/data_models.py`

### Phase 3: Diagnostic Engine (P1 - Root Cause Investigation)

**Goal**: Build the investigation framework.

1. **Create diagnostic tree configuration**
   - YAML configuration file
   - Location: `config/diagnostic_tree.yaml`

2. **Create diagnostic module**
   ```
   src/diagnostics/
   ├── __init__.py
   ├── tree.py           # Tree loader and executor
   ├── checks.py         # Individual check implementations
   ├── evidence.py       # Evidence evaluation
   └── recommendations.py # Action generation
   ```

3. **Add diagnostic data models**
   - `DiagnosticCheck`, `Diagnosis`, `EvidenceResult`, `Recommendation`, `Investigation`
   - Location: `src/data_models.py`

### Phase 4: Report Integration (P2 - Actionable Recommendations)

**Goal**: Add diagnostic sections to reports.

1. **Extend report generator**
   - Add `_format_investigation_section()` method
   - Add `_format_composition_section()` method
   - Add `_format_recommendations_section()` method
   - Location: `src/report.py`

### Phase 5: Report Templates (P2 - Tiered Reports)

**Goal**: Support audience-specific reports.

1. **Create report templates module**
   ```
   src/report_templates/
   ├── __init__.py
   ├── base.py           # Abstract base template
   ├── client.py         # Client-facing template
   └── internal.py       # Internal diagnostic template
   ```

2. **Extend CLI**
   - Add `--audience` option
   - Add `--format` option
   - Location: `src/main.py`

### Phase 6: Search Term Trends (P2 - Search Term Quality)

**Goal**: Track search term quality over time.

1. **Extend search terms analyzer**
   - Add `track_term_trends()` method
   - Add `detect_emerging_terms()` method
   - Add `calculate_junk_ratio()` method
   - Location: `src/analyzers/search_terms.py`

---

## Key Implementation Patterns

### Analyzer Pattern (Follow Existing)

```python
class CompositionAnalyzer:
    """Analyzes metric composition across dimensions."""

    def __init__(self, df: pl.DataFrame, thresholds: Dict[str, float] = None):
        self.df = df
        self.thresholds = thresholds or {
            "shift_threshold": 0.15,  # 15 percentage points
        }

    def analyze_dimension(self, dimension: str) -> CompositionBreakdown:
        """Analyze composition for a single dimension."""
        # Group by dimension, calculate spend/conversion percentages
        ...

    def detect_shifts(
        self, current: CompositionBreakdown, previous: CompositionBreakdown
    ) -> List[CompositionShift]:
        """Detect significant composition shifts."""
        # Compare current vs previous, flag shifts > threshold
        ...
```

### Diagnostic Check Pattern

```python
class DiagnosticCheck(ABC):
    """Base class for diagnostic checks."""

    def __init__(self, config: CheckConfig):
        self.config = config

    @abstractmethod
    def evaluate(self, data: Dict[str, Any]) -> Diagnosis:
        """Evaluate this check against data."""
        pass

    def calculate_confidence(self, evidence_results: List[EvidenceResult]) -> float:
        """Calculate confidence score from evidence."""
        total_weight = sum(e.weight for e in evidence_results)
        weighted_score = sum(e.weight for e in evidence_results if e.passed)
        return weighted_score / total_weight if total_weight > 0 else 0.0
```

### Report Template Pattern

```python
class BaseReportTemplate(ABC):
    """Base class for report templates."""

    def generate(self, results: AnalysisResults) -> str:
        """Template method - defines report structure."""
        sections = [
            self.format_header(results),
            self.format_summary(results),
            self.format_body(results),
            self.format_footer(results),
        ]
        return "\n".join(sections)

    @abstractmethod
    def format_summary(self, results: AnalysisResults) -> str:
        pass

    @abstractmethod
    def format_body(self, results: AnalysisResults) -> str:
        pass
```

---

## Configuration Example

```yaml
# config/diagnostic_tree.yaml
version: "1.0"

metrics:
  cpl:
    name: "Cost Per Lead"
    formula: "spend / conversions_primary"
    change_threshold: 0.10
    diagnostic_checks:
      - competition
      - quality_score
      - search_term_quality
      - composition_shift

checks:
  competition:
    name: "Competition Changes"
    description: "Detect increased auction competition"
    evidence:
      - metric: impression_share_lost_rank
        condition: "increased > 5pts"
        weight: 0.4
      - metric: avg_cpc
        condition: "increased > 10%"
        weight: 0.3
      - metric: absolute_top_is
        condition: "decreased > 5pts"
        weight: 0.3
    recommendations:
      - action: review_bids
        effort: low
        template: "Review and adjust bids for campaigns with IS loss"
      - action: refresh_creative
        effort: medium
        template: "Test new ad copy to improve CTR and Ad Rank"

  composition_shift:
    name: "Traffic Composition Shift"
    description: "Detect changes in traffic mix affecting quality"
    dimensions:
      - device
      - geo
      - hour
    threshold: 0.15
    evidence:
      - metric: dimension_shift_magnitude
        condition: "> 15pts"
        weight: 1.0
    recommendations:
      - action: adjust_bid_modifiers
        effort: low
        template: "Adjust {dimension} bid modifiers: {details}"

thresholds:
  min_data_points: 7
  significance_level: 0.7
  anomaly_z_score: 2.0
```

---

## Testing Strategy

### Unit Tests

1. **test_composition.py**
   - Test dimension grouping and percentage calculations
   - Test shift detection with known data
   - Test efficiency ratio calculations

2. **test_diagnostic_engine.py**
   - Test tree loading from YAML
   - Test check execution with mock data
   - Test confidence score calculations

3. **test_checks.py**
   - Test individual check implementations
   - Test evidence evaluation logic
   - Test edge cases (missing data, zero values)

4. **test_recommendations.py**
   - Test recommendation generation from diagnoses
   - Test priority calculation
   - Test template rendering

### Integration Tests

1. **test_diagnostic_flow.py**
   - End-to-end test: data → analysis → diagnosis → report
   - Test with real stored data (if available)
   - Verify report output format

---

## Success Validation

After implementation, verify:

- [ ] `ads-report --client X --month YYYY-MM` generates report with diagnostic section
- [ ] Composition breakdowns show device/geo/hour splits
- [ ] When CPL changes >10%, investigation section appears
- [ ] Diagnoses have confidence levels and evidence
- [ ] Recommendations are prioritized and actionable
- [ ] `--audience client` generates narrative report
- [ ] `--audience internal` generates full diagnostic report
- [ ] Report generation time < 30 seconds added latency
