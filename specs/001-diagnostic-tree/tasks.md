# Tasks: Diagnostic Tree System

**Input**: Design documents from `/specs/001-diagnostic-tree/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Not explicitly requested in spec. Test tasks NOT included. Add manually if TDD is desired.

**Organization**: Tasks grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, etc.)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, configuration, and shared data models

- [X] T001 Create config directory and diagnostic_tree.yaml in config/diagnostic_tree.yaml
- [X] T002 [P] Create src/diagnostics/ module directory structure with __init__.py
- [X] T003 [P] Create src/report_templates/ module directory structure with __init__.py
- [X] T004 Add DimensionBreakdownRecord dataclass to src/data_models.py
- [X] T005 Add composition analysis models (CompositionBreakdown, CompositionSegment, CompositionShift) to src/data_models.py
- [X] T006 Add diagnostic models (DiagnosticCheck, EvidenceRule, Diagnosis, EvidenceResult, Recommendation, Investigation) to src/data_models.py
- [X] T007 Add configuration models (DiagnosticTreeConfig, MetricConfig, CheckConfig, ThresholdConfig) to src/data_models.py
- [X] T008 Add AnalysisResults aggregate dataclass to src/data_models.py

**Checkpoint**: All shared data models and directory structure ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before user stories

**⚠️ CRITICAL**: User story implementation depends on this phase

- [X] T009 Extend storage.py to handle dimension_breakdown data type in src/storage.py
- [X] T010 Add fetch_device_breakdown() method to GoogleAdsFetcher in src/fetchers/google_ads.py
- [X] T011 Add fetch_geo_breakdown() method to GoogleAdsFetcher in src/fetchers/google_ads.py
- [X] T012 Add fetch_hourly_breakdown() method to GoogleAdsFetcher in src/fetchers/google_ads.py
- [X] T013 [P] Add fetch_device_breakdown() method to MetaAdsFetcher in src/fetchers/meta_ads.py
- [X] T014 [P] Add fetch_placement_breakdown() method to MetaAdsFetcher in src/fetchers/meta_ads.py
- [X] T015 Implement DiagnosticTreeConfig loader from YAML in src/config.py
- [X] T016 Create diagnostic tree YAML configuration with metrics/checks/thresholds in config/diagnostic_tree.yaml

**Checkpoint**: Foundation ready - dimension data can be fetched/stored, config can be loaded

---

## Phase 3: User Story 1 - Automatic Root Cause Investigation (Priority: P1) 🎯 MVP

**Goal**: When a key metric changes >10%, automatically investigate and explain WHY with evidence-backed diagnoses

**Independent Test**: Generate a report for a period where CPL changed significantly. Verify investigation section shows causes with evidence and confidence levels.

### Implementation for User Story 1

- [X] T017 [P] [US1] Create tree.py with DiagnosticTree class for loading and executing checks in src/diagnostics/tree.py
- [X] T018 [P] [US1] Create evidence.py with EvidenceEvaluator class for evaluating evidence rules in src/diagnostics/evidence.py
- [X] T019 [US1] Create checks.py with base DiagnosticCheck class and implement CompetitionCheck in src/diagnostics/checks.py
- [X] T020 [US1] Add QualityScoreCheck implementation to src/diagnostics/checks.py
- [X] T021 [US1] Add SearchTermQualityCheck implementation to src/diagnostics/checks.py
- [X] T022 [US1] Add CompositionShiftCheck implementation to src/diagnostics/checks.py
- [X] T023 [US1] Create diagnostic_engine.py with DiagnosticEngine class that orchestrates investigations in src/analyzers/diagnostic_engine.py
- [X] T024 [US1] Implement metric change detection logic (>10% threshold trigger) in src/analyzers/diagnostic_engine.py
- [X] T025 [US1] Implement confidence scoring based on weighted evidence in src/diagnostics/evidence.py
- [X] T026 [US1] Implement impact estimation for each diagnosis in src/analyzers/diagnostic_engine.py
- [X] T027 [US1] Add _format_investigation_section() method to report generator in src/report.py
- [ ] T028 [US1] Integrate DiagnosticEngine into main pipeline in src/main.py

**Checkpoint**: Reports now include automatic root cause investigation when metrics change >10%

---

## Phase 4: User Story 2 - Metric Composition Analysis (Priority: P1)

**Goal**: Show metric breakdowns by device/geo/hour with efficiency metrics and shift detection

**Independent Test**: Generate composition breakdowns for a client. Verify device/geo/hour splits show with CPL and efficiency ratios.

### Implementation for User Story 2

- [X] T029 [P] [US2] Create composition.py with CompositionAnalyzer class in src/analyzers/composition.py
- [X] T030 [US2] Implement analyze_dimension() method for device breakdown in src/analyzers/composition.py
- [X] T031 [US2] Implement analyze_dimension() method for geo breakdown in src/analyzers/composition.py
- [X] T032 [US2] Implement analyze_dimension() method for hourly breakdown in src/analyzers/composition.py
- [X] T033 [US2] Implement detect_shifts() method to find >15pt composition changes in src/analyzers/composition.py
- [X] T034 [US2] Implement calculate_efficiency() method for efficiency ratios in src/analyzers/composition.py
- [X] T035 [US2] Implement estimate_quality_impact() for composition shifts in src/analyzers/composition.py
- [X] T036 [US2] Add _format_composition_section() method to report generator in src/report.py
- [X] T037 [US2] Handle missing dimension data gracefully (omit section if no data) in src/analyzers/composition.py
- [ ] T038 [US2] Integrate CompositionAnalyzer into main pipeline in src/main.py

**Checkpoint**: Reports now include device/geo/hour composition analysis with shift detection

---

## Phase 5: User Story 3 - Actionable Recommendations (Priority: P2)

**Goal**: Generate specific, prioritized actions from diagnoses with expected impact and effort levels

**Independent Test**: Verify each diagnosis type produces recommendations with impact estimates and effort levels.

### Implementation for User Story 3

- [X] T039 [P] [US3] Create recommendations.py with RecommendationGenerator class in src/diagnostics/recommendations.py
- [X] T040 [US3] Implement generate_from_diagnosis() method that creates Recommendation from Diagnosis in src/diagnostics/recommendations.py
- [X] T041 [US3] Implement prioritize_recommendations() to sort by expected impact in src/diagnostics/recommendations.py
- [X] T042 [US3] Implement template rendering with placeholders ({campaign}, {keywords}, etc.) in src/diagnostics/recommendations.py
- [X] T043 [US3] Add effort estimation logic (low/medium/high) based on action type in src/diagnostics/recommendations.py
- [X] T044 [US3] Add confidence flagging for recommendations requiring missing data in src/diagnostics/recommendations.py
- [X] T045 [US3] Add _format_recommendations_section() method to report generator in src/report.py
- [X] T046 [US3] Integrate RecommendationGenerator into DiagnosticEngine in src/analyzers/diagnostic_engine.py

**Checkpoint**: Reports now include prioritized, actionable recommendations with impact estimates

---

## Phase 6: User Story 4 - Tiered Reports for Different Audiences (Priority: P2)

**Goal**: Generate client-facing narrative reports vs. internal diagnostic reports from same data

**Independent Test**: Generate both report types for same client/period. Verify client report has narrative, internal has full diagnostics.

### Implementation for User Story 4

- [X] T047 [P] [US4] Create base.py with BaseReportTemplate abstract class in src/report_templates/base.py
- [X] T048 [P] [US4] Create internal.py with InternalTemplate (full diagnostic detail) in src/report_templates/internal.py
- [X] T049 [P] [US4] Create client.py with ClientTemplate (narrative summary) in src/report_templates/client.py
- [X] T050 [US4] Implement format_summary() in ClientTemplate with 3-5 bullet narrative in src/report_templates/client.py
- [X] T051 [US4] Implement format_body() in ClientTemplate omitting internal jargon in src/report_templates/client.py
- [X] T052 [US4] Implement format_summary() in InternalTemplate with full KPI tables in src/report_templates/internal.py
- [X] T053 [US4] Implement format_body() in InternalTemplate with diagnostic trees and action queues in src/report_templates/internal.py
- [ ] T054 [US4] Add --audience option (client|internal) to CLI in src/main.py
- [ ] T055 [US4] Add --format option (markdown|json) to CLI in src/main.py
- [ ] T056 [US4] Update output filename pattern based on audience in src/main.py
- [ ] T057 [US4] Refactor MarkdownReportGenerator to use template system in src/report.py

**Checkpoint**: CLI supports --audience and --format flags, reports adapt to audience

---

## Phase 7: User Story 5 - Search Term Quality Tracking (Priority: P2)

**Goal**: Track search term quality evolution, identify growing/declining terms, quantify junk ratio

**Independent Test**: Analyze search terms across periods. Verify trend indicators and emerging term flags appear.

### Implementation for User Story 5

- [X] T058 [P] [US5] Add track_term_trends() method to SearchTermsAnalyzer in src/analyzers/search_terms.py
- [X] T059 [US5] Implement trend classification (growing/stable/declining) based on period comparison in src/analyzers/search_terms.py
- [X] T060 [US5] Add detect_emerging_terms() method to find new terms this period in src/analyzers/search_terms.py
- [X] T061 [US5] Add calculate_junk_ratio() method to quantify wasted spend on zero-conversion terms in src/analyzers/search_terms.py
- [X] T062 [US5] Add junk ratio change detection (increased vs. previous period) in src/analyzers/search_terms.py
- [X] T063 [US5] Add _format_search_term_trends_section() to report generator in src/report.py
- [ ] T064 [US5] Integrate search term trend analysis into main pipeline in src/main.py

**Checkpoint**: Reports now include search term quality evolution with trends and junk ratio

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [X] T065 [P] Add graceful handling for insufficient historical data (<2 periods) in src/analyzers/diagnostic_engine.py
- [X] T066 [P] Add "Investigation inconclusive" messaging when all checks negative in src/analyzers/diagnostic_engine.py
- [X] T067 [P] Ensure currency awareness - never mix currencies in calculations in src/analyzers/composition.py
- [ ] T068 [P] Add client service coverage flagging for geo analysis (when coverage data provided) in src/analyzers/composition.py
- [X] T069 Validate diagnostic_tree.yaml against schema on load in src/config.py
- [ ] T070 Add performance monitoring - ensure diagnostic analysis adds <30s latency in src/main.py
- [ ] T071 Run quickstart.md validation checklist

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - start immediately
- **Foundational (Phase 2)**: Depends on Setup - BLOCKS all user stories
- **User Stories (Phase 3-7)**: All depend on Foundational completion
  - US1 and US2 are both P1 - can run in parallel after Foundational
  - US3, US4, US5 are P2 - depend on US1 completion (recommendations need diagnoses)
- **Polish (Phase 8)**: Depends on all user stories complete

### User Story Dependencies

```
                    ┌─────────────┐
                    │   Setup     │
                    │  (Phase 1)  │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │ Foundational│
                    │  (Phase 2)  │
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          │                │                │
   ┌──────▼──────┐  ┌──────▼──────┐         │
   │    US1      │  │    US2      │         │
   │ Root Cause  │  │ Composition │         │
   │   (P1) 🎯   │  │    (P1)     │         │
   └──────┬──────┘  └──────┬──────┘         │
          │                │                │
          └───────┬────────┘                │
                  │                         │
   ┌──────────────┼──────────────┬──────────┘
   │              │              │
┌──▼───┐    ┌─────▼─────┐   ┌────▼────┐
│ US3  │    │    US4    │   │   US5   │
│Recs  │    │  Reports  │   │ Search  │
│(P2)  │    │   (P2)    │   │  (P2)   │
└──────┘    └───────────┘   └─────────┘
```

- **US1 (Root Cause)**: Independent after Foundational
- **US2 (Composition)**: Independent after Foundational - parallel with US1
- **US3 (Recommendations)**: Depends on US1 (needs Diagnosis to generate Recommendations)
- **US4 (Tiered Reports)**: Can start after US1 (needs Investigation data for templates)
- **US5 (Search Terms)**: Independent after Foundational - parallel with US1/US2

### Within Each User Story

- Models before services/analyzers
- Core logic before report formatting
- Analyzer before main.py integration

### Parallel Opportunities

**Phase 1 (Setup)**:
```bash
# Parallel: T002, T003 (directory creation)
```

**Phase 2 (Foundational)**:
```bash
# Parallel: T013, T014 (Meta fetcher methods)
```

**Phase 3 (US1)**:
```bash
# Parallel: T017, T018 (tree.py and evidence.py)
```

**Phase 4 (US2)**:
```bash
# T029 can start immediately
```

**Phase 5-7 (US3, US4, US5)**:
```bash
# US4 T047, T048, T049 can run in parallel (different template files)
```

---

## Parallel Example: User Story 1

```bash
# Launch diagnostic module foundations in parallel:
Task: "T017 [P] [US1] Create tree.py with DiagnosticTree class in src/diagnostics/tree.py"
Task: "T018 [P] [US1] Create evidence.py with EvidenceEvaluator class in src/diagnostics/evidence.py"

# Then sequential: checks depend on tree structure
Task: "T019 [US1] Create checks.py with base DiagnosticCheck class in src/diagnostics/checks.py"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T008)
2. Complete Phase 2: Foundational (T009-T016)
3. Complete Phase 3: User Story 1 - Root Cause Investigation (T017-T028)
4. **STOP and VALIDATE**: Generate report, verify investigation section works
5. Deploy/demo: Reports now explain WHY metrics changed

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. Add US1 (Root Cause) → Test → Deploy (MVP!) 🎯
3. Add US2 (Composition) → Test → Deploy (now shows dimension breakdowns)
4. Add US3 (Recommendations) → Test → Deploy (now has action items)
5. Add US4 (Tiered Reports) → Test → Deploy (client vs. internal reports)
6. Add US5 (Search Terms) → Test → Deploy (search term quality tracking)

### Suggested MVP Scope

**MVP = Phase 1 + Phase 2 + Phase 3 (User Story 1)**

This delivers the core value proposition: automatic root cause investigation when metrics change.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story
- Each user story is independently testable after completion
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- US1 is the MVP - everything else builds on top
