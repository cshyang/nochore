# Homescape Google Ads Live Canary — Phase 1

## Goal

Enable live Google Ads mutations for Homescape only, manual-first, with confirmation and audit trail. Validates that production writes are safe and auditable before expanding to other clients.

## Scope

**Canary target:** client `last-minute`, brand `Homescape`, source alias `homescape_ads`, platform `google_ads`.

**Live actions enabled:**
- `campaign google-ads add-negative --live`
- `campaign google-ads adjust-budget --live`

**Everything else remains dry-run only.** No `optimize run --live` in this phase.

---

## 1. Analyzer Changes

### NegativeKeywordRec — add `campaign_id` + `source_alias`

```python
@dataclass
class NegativeKeywordRec:
    search_term: str
    campaign: str          # display name for humans
    campaign_id: str       # numeric ID for execution
    source_alias: str      # routes to correct account
    ad_group: str
    currency: str
    spend: float
    clicks: int
    leads: float
    reason: str
    note: str
```

Both `campaign_id` and `source_alias` are already columns in the search terms DataFrame. The `SearchTermsAnalyzer` passes them through when constructing records.

### BudgetRec — add `campaign_id`, `source_alias`, `suggested_delta_pct`; drop `recommended_daily`

```python
@dataclass
class BudgetRec:
    campaign: str          # display name
    campaign_id: str       # for execution
    source_alias: str      # routes to correct account
    current_daily: float   # 0 when unknown; live executor reads real value from API
    suggested_delta_pct: float  # replaces recommended_daily; pre-capped at 15%
    expected_is_gain: float
```

`ImpressionShareAnalyzer.get_budget_recommendations()`:
- Passes through `campaign_id` and `source_alias` from the DataFrame row
- Computes `suggested_delta_pct = min(increase_ratio * 100, 15.0)` from the existing `increase_ratio` calculation
- Removes `recommended_daily` computation (was always 0)

---

## 2. Planner Fix

`src/engine/optimizer/service.py`:

- Populate `source_alias=item.source_alias` on all actions (was `None`)
- Use `target_id=item.campaign_id` (was `item.campaign` — display name)
- Keep `item.campaign` (display name) in `payload` for human readability
- Rename budget action type: `"adjust_google_ads_budget"` (was `"increase_campaign_budget"`)
- Add `suggested_delta_pct` and `expected_is_gain` to budget payload

---

## 3. Canary Policy

Hardcoded Python constant in `src/engine/policy/service.py`:

```python
CANARY_POLICY = {
    "client_id": "last-minute",
    "brand": "Homescape",
    "source_alias": "homescape_ads",
    "platform": "google_ads",
    "allowed_actions": {"add_negative_keyword", "adjust_google_ads_budget"},
    "negative_match_type": "EXACT",
    "budget_max_delta_pct": 15,
    "budget_cooldown_days": 7,
}
```

**Evaluation flow for `dry_run=False`:**
1. Check action type in `CANARY_POLICY["allowed_actions"]`
2. Check `client_id`, `brand`, `source_alias` match canary
3. For negatives: verify match type is EXACT
4. For budgets: verify `abs(delta_pct) <= budget_max_delta_pct`, check memory for cooldown (no live budget edit on same campaign within `budget_cooldown_days`)
5. Pass → `decision="approved_live"`. Fail → `decision="blocked"` with specific reason.

Non-canary requests return `decision="blocked"` with reason "Live execution is only enabled for the Homescape canary."

---

## 4. Google Ads Mutator

**New file:** `src/integrations/google_ads/mutator.py`

### `add_campaign_negative_keyword(ga_client, customer_id, campaign_id, keyword_text, match_type="EXACT")`

- Creates a `CampaignCriterion` with negative keyword via `GoogleAdsService.mutate()`
- Returns: `{"criterion_resource_name": "...", "keyword_text": "...", "match_type": "EXACT"}`
- On API error: raises with Google Ads error message

### `update_campaign_budget(ga_client, customer_id, campaign_id, delta_pct)`

- Step 1: Read current campaign budget from API (`campaign_budget.amount_micros`)
- Step 2: Compute `new_budget = current * (1 + delta_pct / 100)`
- Step 3: Validate `abs(delta_pct) <= 15` (defense-in-depth)
- Step 4: Update via `CampaignBudgetService.mutate()`
- Returns: `{"budget_resource_name": "...", "previous_daily_micros": ..., "new_daily_micros": ..., "previous_daily": ..., "new_daily": ..., "delta_pct": ...}`
- On API error: raises with Google Ads error message

No retry logic in this phase. Failure surfaces to CLI, no memory record written.

---

## 5. CLI Changes

### Flag semantics

- Remove `--dry-run` as the opt-in flag
- Add `--live` as opt-in flag (default behavior is dry-run)
- Both commands: `add-negative` keeps its name, `increase-budget` renames to `adjust-budget`
- `adjust-budget`: replace `--daily-budget <amount>` with `--delta-pct <percent>`

### Confirmation prompt (for `--live` only)

```
[LIVE] Add exact negative keyword "renovation ideas" to campaign "3D - Interior Design" (homescape_ads)
Proceed? [y/N]
```

Abort on anything except explicit `y` or `yes`.

### Execution flow (`add-negative --live`)

1. Build `ActionPlan`
2. Call `evaluate_action_plan(action, dry_run=False)` — policy checks canary constraints
3. If blocked → show reason, exit
4. Show confirmation prompt → abort if not `y`
5. Resolve `customer_id` from `source_alias` via `business_config.sources`
6. Call `mutator.add_campaign_negative_keyword()`
7. Write `ActionRecord` with `status="executed_live"` and mutation result in payload
8. Output result

Same pattern for `adjust-budget --live`, with additional step of reading current budget from API before applying delta.

Without `--live`: validates, returns policy decision, no writes, no memory.

---

## 6. Memory & Execution Records

On successful live execution, write to existing `MemoryStore`:

```python
ActionRecord(
    record_id="record-live-{uuid}",
    client_id="last-minute",
    brand="Homescape",
    experiment_id="manual-live-{uuid}",
    action_id="manual-{action_type}-{uuid}",
    action_type="add_negative_keyword",
    platform="google_ads",
    source_alias="homescape_ads",
    target_kind="campaign",
    target_id="12345678",
    status="executed_live",
    created_at="2026-03-15T...",
    payload={
        "campaign_name": "3D - Interior Design",
        "search_term": "renovation ideas",
        "match_type": "EXACT",
        "mutation_result": {
            "criterion_resource_name": "customers/123/campaignCriteria/456~789",
        },
    },
)
```

Budget edit payloads also store `previous_daily`, `new_daily`, `delta_pct` in `mutation_result`.

**Cooldown enforcement:** Policy reads most recent `ActionRecord` for same `campaign_id` + `action_type="adjust_google_ads_budget"` + `status="executed_live"`. If `created_at` within 7 days, block with reason.

**Dry-run manual commands remain stateless.**

---

## 7. Files Summary

### Modify

| File | Change |
|------|--------|
| `src/models/analysis.py` | Add `campaign_id`, `source_alias` to `NegativeKeywordRec`; add `campaign_id`, `source_alias`, `suggested_delta_pct` to `BudgetRec`; remove `recommended_daily` |
| `src/analyzers/search_terms.py` | Pass through `campaign_id`, `source_alias` when building `NegativeKeywordRec` |
| `src/analyzers/impression_share.py` | Pass through `campaign_id`, `source_alias`; compute `suggested_delta_pct`; remove `recommended_daily` |
| `src/engine/optimizer/service.py` | Populate `source_alias` and `campaign_id` from analysis; rename budget action type |
| `src/engine/policy/service.py` | Add `CANARY_POLICY`; add live execution branch with canary checks + cooldown |
| `src/cli/commands/google_ads.py` | Rename `increase-budget` → `adjust-budget`; `--delta-pct` replaces `--daily-budget`; `--live` replaces `--dry-run`; add confirmation prompt; wire mutator + memory on success |

### Create

| File | Purpose |
|------|---------|
| `src/integrations/__init__.py` | Package init |
| `src/integrations/google_ads/__init__.py` | Package init |
| `src/integrations/google_ads/mutator.py` | Google Ads API write operations |

---

## 8. Test Plan

- **Policy tests:** canary allows Homescape live; blocks other clients/brands/sources; blocks non-canary action types; budget cooldown enforced
- **Analyzer tests:** `NegativeKeywordRec` and `BudgetRec` include `campaign_id` and `source_alias`; `suggested_delta_pct` never exceeds 15%
- **Planner tests:** all actions have non-null `source_alias` and numeric `target_id`
- **CLI tests:** `--live` prompts confirmation and aborts on `N`; without `--live` remains dry-run; non-canary live attempts blocked with reason
- **Mutator tests:** negative keyword payload is correct; budget update reads current value and applies capped delta; API errors surface cleanly
- **Memory tests:** successful live commands write `ActionRecord` with `status="executed_live"` and mutation result; dry-run commands write nothing

---

## Deferred to Phase 2

- YAML policy files under `config/policies/`
- `campaign optimize run --live` (automated live execution)
- Outcome computation and review windows
- Lesson generation from measured outcomes
- Rollback commands (`remove-negative`, `revert-budget`)
- Meta live execution
