# Feature Specification: Diagnostic Tree System

**Feature Branch**: `001-diagnostic-tree`
**Created**: 2025-12-27
**Status**: Draft
**Input**: User description: "Build a diagnostic/decision tree system for automated metric investigation that decomposes metrics, investigates root causes when metrics change, and prescribes actions based on marketing expertise"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Automatic Root Cause Investigation (Priority: P1)

As a marketer reviewing a monthly report, I want the system to automatically investigate and explain WHY a key metric changed, so I don't have to manually dig through data to understand what happened.

When CPL increases by 23%, instead of just seeing the number, I see a structured investigation showing that the increase is due to: (1) Quality Score degradation on 3 keywords, (2) search term quality declined with 24% spend on junk queries, and (3) increased competition. Each cause is backed by evidence from the data.

**Why this priority**: This is the core value proposition. Without automatic root cause investigation, the system is just another reporting tool. This transforms reports from "what happened" into "why it happened."

**Independent Test**: Can be fully tested by generating a report for a period where a key metric changed significantly. The investigation section should identify plausible causes with supporting evidence.

**Acceptance Scenarios**:

1. **Given** a metric (CPL, CVR, or lead volume) changed by more than 10% from the previous period, **When** the report is generated, **Then** the system runs an automatic investigation and presents findings with evidence and confidence levels.

2. **Given** the investigation identifies multiple contributing factors, **When** presenting results, **Then** each factor shows its estimated impact on the metric change and the evidence supporting it.

3. **Given** no significant metric changes occurred (all within 10%), **When** the report is generated, **Then** the investigation section shows "No significant changes requiring investigation" rather than running unnecessary diagnostics.

---

### User Story 2 - Metric Composition Analysis (Priority: P1)

As a marketer, I want to see how my metrics break down by dimensions (device, geo, time of day, search terms) so I can identify hidden quality issues even when top-line numbers look stable.

Even if I have the same 100 conversions as last month, I want to know if the composition shifted—for example, 70% now come from mobile (was 50%), and mobile leads historically close at half the rate of desktop leads.

**Why this priority**: This catches "silent failures" where top-line metrics mask underlying quality degradation. A conversion is not always equal to another conversion.

**Independent Test**: Can be fully tested by generating composition breakdowns for a client with stable conversion volume but shifting mix across dimensions.

**Acceptance Scenarios**:

1. **Given** campaign performance data exists, **When** the report is generated, **Then** the system shows conversion and spend breakdown by device type (mobile, desktop, tablet) with efficiency metrics for each.

2. **Given** geo-level data is available, **When** the report is generated, **Then** the system shows top locations by spend and conversions, with CPL for each and flags for locations with no client service coverage.

3. **Given** hourly performance data exists, **When** the report is generated, **Then** the system identifies time blocks with poor efficiency (spend percentage exceeds conversion percentage) and quantifies the opportunity cost.

4. **Given** a composition shift of more than 15 percentage points occurred in any dimension, **When** the report is generated, **Then** the system highlights this shift with an estimated quality impact.

---

### User Story 3 - Actionable Recommendations (Priority: P2)

As a marketer, I want the system to prescribe specific actions based on its diagnosis, with expected impact and confidence levels, so I know exactly what to do next.

Instead of just saying "Quality Score declined," I want recommendations like "Update landing page headlines to match ad copy for these 3 keywords—estimated CPL reduction: $2.50."

**Why this priority**: Insights without actions create work. By prescribing specific actions, the system becomes a decision-support tool rather than just an analysis tool.

**Independent Test**: Can be fully tested by verifying that each diagnosis type produces at least one actionable recommendation with expected impact.

**Acceptance Scenarios**:

1. **Given** a diagnosis is made (e.g., "search term quality declined"), **When** the report is generated, **Then** specific actions are recommended (e.g., "Add these 34 negative keywords") with expected impact (e.g., "-$3.00 CPL").

2. **Given** multiple actions are recommended, **When** presenting them, **Then** actions are prioritized by expected impact and effort level (Low/Medium/High).

3. **Given** a recommendation requires data the system doesn't have, **When** presenting it, **Then** the recommendation is marked with lower confidence and notes what additional data would improve accuracy.

---

### User Story 4 - Tiered Reports for Different Audiences (Priority: P2)

As a marketing agency, I want to generate different report versions for different audiences—an executive summary for clients and a detailed diagnostic report for internal optimizers—from the same underlying data.

The client report should be narrative-focused with 3-5 key takeaways, while the internal report should include all diagnostic details, action queues, and optimization hypotheses.

**Why this priority**: Different stakeholders need different levels of detail. One report doesn't fit all audiences. This reduces the manual work of creating separate reports.

**Independent Test**: Can be fully tested by generating both report types for the same client/period and verifying appropriate content and tone for each.

**Acceptance Scenarios**:

1. **Given** a report is requested with audience type "client", **When** the report is generated, **Then** it uses narrative language, focuses on outcomes and next steps, and omits internal optimization details.

2. **Given** a report is requested with audience type "internal", **When** the report is generated, **Then** it includes full diagnostic trees, all evidence checks, action queues with confidence scores, and test hypotheses.

3. **Given** the same underlying data, **When** generating both report types, **Then** the facts and metrics are consistent; only the presentation and level of detail differs.

---

### User Story 5 - Search Term Quality Tracking (Priority: P2)

As a marketer managing Google Ads, I want to see how my search term quality evolves over time—specifically tracking the ratio of high-intent vs. low-intent queries and identifying when broad match is capturing irrelevant traffic.

**Why this priority**: Search term drift is one of the most common sources of wasted spend. Early detection prevents budget erosion.

**Independent Test**: Can be fully tested by analyzing search term data across multiple periods and identifying drift patterns.

**Acceptance Scenarios**:

1. **Given** search term data for current and previous periods, **When** the report is generated, **Then** the system shows top converting terms with trend indicators (growing, stable, declining).

2. **Given** new search terms appeared this period that weren't present before, **When** the report is generated, **Then** these are flagged with their conversion rate and spend to identify emerging opportunities or threats.

3. **Given** the ratio of "junk" queries (high spend, zero conversions) increased, **When** the report is generated, **Then** this is quantified with specific terms listed for negative keyword consideration.

---

### Edge Cases

- What happens when there is insufficient historical data (less than 2 periods) for comparison?
  - System generates current period breakdown only and notes that trend analysis requires additional data.

- How does the system handle missing dimensions (e.g., geo data not available for Meta)?
  - Composition analysis shows only available dimensions; missing dimensions are omitted rather than showing empty sections.

- What happens when a metric changed but all diagnostic checks come back negative?
  - System reports "Investigation inconclusive—no common causes detected" and suggests manual review, listing what was checked.

- How does the system handle currency differences across accounts?
  - Currency-aware aggregation groups metrics by currency; cross-currency comparisons are avoided or clearly flagged.

- What happens when client service coverage data is not available?
  - Geo analysis proceeds without coverage flags; a note indicates that coverage validation was skipped.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST decompose key metrics (CPL, CVR, CPC, conversion volume) by dimensions including device type, geographic location, time of day, and traffic source.

- **FR-002**: System MUST detect when a key metric changes by more than a configurable threshold (default 10%) and trigger automatic investigation.

- **FR-003**: System MUST check a defined set of diagnostic hypotheses when investigating metric changes, including: competition changes, quality score changes, search term quality changes, audience/targeting changes, and composition mix shifts.

- **FR-004**: System MUST present evidence for each diagnostic check, showing the specific data points that support or refute each hypothesis.

- **FR-005**: System MUST assign confidence levels (High/Medium/Low) to each diagnosis based on the strength of supporting evidence.

- **FR-006**: System MUST estimate the impact of each identified cause on the overall metric change (e.g., "contributes approximately $3.00 to the CPL increase").

- **FR-007**: System MUST generate actionable recommendations for each confirmed diagnosis, including expected impact and effort level.

- **FR-008**: System MUST prioritize recommendations by expected impact, presenting highest-impact actions first.

- **FR-009**: System MUST support generating reports for two audience types: "client" (executive summary, narrative focus) and "internal" (full diagnostic detail).

- **FR-010**: System MUST identify composition shifts across dimensions and calculate estimated quality impact when shifts exceed 15 percentage points.

- **FR-011**: System MUST track search term performance trends, identifying growing, stable, and declining terms.

- **FR-012**: System MUST flag geographic regions where spend occurs but client has no service coverage (when coverage data is provided).

- **FR-013**: System MUST identify time-of-day inefficiencies by comparing spend percentage to conversion percentage across time blocks.

- **FR-014**: System MUST handle missing or incomplete dimension data gracefully, analyzing available dimensions without errors.

- **FR-015**: System MUST maintain currency awareness, never mixing currencies in calculations or comparisons.

### Key Entities

- **Metric**: A measurable value (CPL, CVR, CPC, conversions, spend) with current and previous period values, enabling change detection.

- **Dimension**: A breakdown category (device, geo, hour, search term, match type, placement) used for composition analysis.

- **Diagnostic Check**: A hypothesis about why a metric changed, with associated evidence queries and threshold conditions.

- **Diagnosis**: A confirmed finding from a diagnostic check, including confidence level, estimated impact, and supporting evidence.

- **Recommendation**: An actionable suggestion derived from a diagnosis, with expected impact, effort level, and priority.

- **Report Template**: A formatting configuration that determines content inclusion and presentation style based on audience type.

- **Composition Breakdown**: A metric split across a dimension, showing distribution and efficiency for each segment.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: When a key metric changes by more than 10%, the system identifies at least one plausible root cause with supporting evidence in 90% of cases.

- **SC-002**: Marketers can understand why a metric changed within 2 minutes of reading the investigation section, without needing to query additional data.

- **SC-003**: At least 70% of generated recommendations are actionable (specific enough to implement without further research).

- **SC-004**: Composition analysis correctly identifies dimension shifts of 15+ percentage points with 95% accuracy.

- **SC-005**: Client-facing reports contain no internal optimization jargon and can be understood by non-technical stakeholders.

- **SC-006**: Report generation time increases by no more than 30 seconds compared to current reports (diagnostic analysis should be efficient).

- **SC-007**: The system correctly attributes estimated impact to identified causes, with total attributed impact within 30% of actual metric change in 80% of investigations.

## Assumptions

- Historical data for at least 2 periods (current and previous) is available for meaningful comparisons.
- Device, geo, and hourly breakdowns are available from Google Ads; Meta may have different dimension availability.
- Quality Score data is available for Google Ads accounts.
- Client service coverage data, if used, will be provided in the client configuration.
- The diagnostic tree configuration (thresholds, checks, evidence queries) will be defined in a configuration file, not hardcoded.
- Impact estimation uses historical data patterns and reasonable heuristics; it is directionally accurate but not precise.
