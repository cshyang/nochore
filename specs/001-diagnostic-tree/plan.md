# Implementation Plan: Diagnostic Tree System

**Branch**: `001-diagnostic-tree` | **Date**: 2025-12-27 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-diagnostic-tree/spec.md`

## Summary

Build a diagnostic/decision tree system that automatically investigates WHY metrics change, decomposes metrics by dimensions (device, geo, time), and prescribes actionable recommendations. This transforms reports from "what happened" into "why it happened" with evidence-backed diagnoses and prioritized action items.

## Technical Context

**Language/Version**: Python 3.9+ (matches existing codebase)
**Primary Dependencies**: Polars (dataframes), Click (CLI), Rich (output), PyYAML (config)
**Storage**: Parquet files (existing partitioned storage in `data/`)
**Testing**: pytest (standard Python testing)
**Target Platform**: CLI tool (macOS/Linux)
**Project Type**: Single project (extends existing `src/` structure)
**Performance Goals**: Report generation adds ≤30 seconds for diagnostic analysis
**Constraints**: Must work with existing data fetchers and storage layer
**Scale/Scope**: 2-10 clients, monthly/custom period reports

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

The constitution template is not yet configured for this project. Proceeding with sensible defaults:

| Principle | Status | Notes |
|-----------|--------|-------|
| Extend existing patterns | ✅ Pass | Uses existing analyzer pattern from `src/analyzers/` |
| No breaking changes | ✅ Pass | Adds new modules, doesn't modify existing APIs |
| Configuration-driven | ✅ Pass | Diagnostic tree defined in YAML, not hardcoded |
| Testable | ✅ Pass | Each analyzer independently testable |

## Project Structure

### Documentation (this feature)

```text
specs/001-diagnostic-tree/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (config schemas)
└── tasks.md             # Phase 2 output (/speckit.tasks)
```

### Source Code (repository root)

```text
src/
├── analyzers/
│   ├── __init__.py
│   ├── search_terms.py         # Existing
│   ├── impression_share.py     # Existing
│   ├── quality_score.py        # Existing
│   ├── trends.py               # Existing
│   ├── composition.py          # NEW: Dimension breakdown analyzer
│   └── diagnostic_engine.py    # NEW: Root cause investigation engine
├── diagnostics/                 # NEW: Diagnostic tree module
│   ├── __init__.py
│   ├── tree.py                 # Tree definition and execution
│   ├── checks.py               # Individual diagnostic checks
│   ├── evidence.py             # Evidence collection and scoring
│   └── recommendations.py      # Action generation from diagnoses
├── fetchers/
│   ├── google_ads.py           # EXTEND: Add device/geo/hour dimensions
│   └── meta_ads.py             # EXTEND: Add device/placement dimensions
├── report.py                   # EXTEND: Add diagnostic sections
├── report_templates/           # NEW: Audience-specific templates
│   ├── __init__.py
│   ├── base.py                 # Base template class
│   ├── client.py               # Client-facing narrative template
│   └── internal.py             # Internal diagnostic template
├── data_models.py              # EXTEND: Add diagnostic data models
├── storage.py                  # Existing (no changes)
├── config.py                   # EXTEND: Add diagnostic config loading
└── main.py                     # EXTEND: Add --audience flag

config/
└── diagnostic_tree.yaml        # NEW: Diagnostic tree configuration

tests/
├── unit/
│   ├── test_composition.py     # NEW
│   ├── test_diagnostic_engine.py # NEW
│   ├── test_checks.py          # NEW
│   └── test_recommendations.py # NEW
└── integration/
    └── test_diagnostic_flow.py # NEW
```

**Structure Decision**: Extends existing single-project structure. New diagnostic logic in dedicated `src/diagnostics/` module. Composition analysis added to existing `src/analyzers/`. Report templates factored into `src/report_templates/`.

## Complexity Tracking

No constitution violations requiring justification.

---

## Phase 0: Research

### Research Tasks

1. **Dimension Data Availability**
   - What device/geo/hour breakdowns are available from Google Ads API?
   - What device/placement breakdowns are available from Meta Ads API?
   - What additional API queries are needed?

2. **Impact Estimation Approaches**
   - How to attribute metric changes to specific causes?
   - What heuristics work for CPL/CVR decomposition?
   - How to handle multi-factor attribution?

3. **Diagnostic Tree Configuration**
   - What format for defining diagnostic checks (YAML schema)?
   - How to express evidence queries and thresholds?
   - How to make the tree extensible?

4. **Report Template Patterns**
   - Best practices for audience-specific report generation?
   - How to share data but vary presentation?

### Research Outputs

See [research.md](./research.md) for detailed findings.

---

## Phase 1: Design

### Data Model

See [data-model.md](./data-model.md) for entity definitions.

### Contracts

See [contracts/](./contracts/) for configuration schemas.

### Quickstart

See [quickstart.md](./quickstart.md) for implementation guide.

---

## Phase 2: Tasks

Generated by `/speckit.tasks` command after Phase 1 approval.
