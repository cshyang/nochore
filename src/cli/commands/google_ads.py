"""Google Ads mutation tools with a live canary path."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_brand
from src.engine.policy import evaluate_action_plan, evaluate_canary_scope_only
from src.integrations.google_ads import GoogleAdsMutationError, GoogleAdsMutator
from src.models import ActionPlan
from src.output import output_data
from src.tools.analysis import init_google_ads_client
from src.tools.experiments import record_manual_live_execution
from src.tools.memory import MemoryStore

# Match type aliases for CLI convenience
_MATCH_TYPE_ALIASES = {"exact": "EXACT", "phrase": "PHRASE", "broad": "BROAD"}


def _require_google_source(business_config, alias: str) -> None:
    source = business_config.sources.get(alias)
    if source is None or source[0] != "google_ads":
        raise click.UsageError(f"Source alias '{alias}' is not a configured Google Ads source.")


@click.group("google-ads")
def google_ads() -> None:
    """Google Ads mutation primitives with a live Homescape canary."""


def _confirm_live(summary: str) -> None:
    click.echo(summary, err=True)
    click.echo("Proceed? [y/N] ", nl=False, err=True)
    response = click.get_text_stream("stdin").readline().strip().casefold()
    if response not in {"y", "yes"}:
        raise click.ClickException("Live execution aborted.")


def _recent_live_actions(memory_store: MemoryStore, action: ActionPlan) -> list[dict]:
    return [
        row
        for row in memory_store.read(action.client_id, "actions", brand=action.brand)
        if row.get("platform") == action.platform
    ]


def _init_mutator(runtime, source_alias: str) -> GoogleAdsMutator:
    ga_client = init_google_ads_client(runtime["credentials"])
    if ga_client is None:
        raise click.ClickException("Google Ads credentials are not available for live execution.")
    source = runtime["business_config"].sources.google_ads[source_alias]
    return GoogleAdsMutator(ga_client, source_alias, source.customer_id)


@google_ads.command("add-negative")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Scope to a configured brand.")
@click.option("--source", "source_alias", required=True, help="Google Ads source alias.")
@click.option("--campaign", required=True, help="Campaign name or id.")
@click.option("--search-term", required=True, help="Search term to block.")
@click.option("--dry-run", is_flag=True, help="Validate without live execution.")
@click.option("--live", is_flag=True, help="Execute the live Homescape canary mutation.")
@click.pass_context
def add_negative(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    source_alias: str,
    campaign: str,
    search_term: str,
    dry_run: bool,
    live: bool,
) -> None:
    """Validate a Google Ads negative-keyword action."""
    if dry_run and live:
        raise click.UsageError("Use either --dry-run or --live, not both.")

    runtime = load_runtime(ctx, client_id)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    _require_google_source(runtime["business_config"], source_alias)
    action = ActionPlan(
        action_id="manual-google-negative",
        hypothesis_id="manual",
        action_type="add_negative_keyword",
        platform="google_ads",
        client_id=runtime["client_id"],
        brand=selected_brand,
        source_alias=source_alias,
        target_kind="campaign",
        target_id=campaign,
        confidence="manual",
        risk_level="low",
        idempotency_key=f"{runtime['client_id']}:{source_alias}:{campaign}:{search_term}",
        payload={
            "campaign": campaign,
            "search_term": search_term,
            "match_type": "EXACT",
        },
    )
    memory_store = MemoryStore()

    if not live:
        decision = evaluate_action_plan(action, dry_run=True)
        output_data(
            {"action": action, "decision": decision, "dry_run": True},
            ctx.obj["format"],
            title="Google Ads Action",
        )
        return

    # Early scope check — blocks non-canary clients before any API calls
    scope_block = evaluate_canary_scope_only(action)
    if scope_block:
        output_data(
            {"action": action, "decision": scope_block, "live": True},
            ctx.obj["format"],
            title="Google Ads Action",
        )
        return

    mutator = _init_mutator(runtime, source_alias)
    try:
        campaign_details = mutator.resolve_campaign(campaign)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    action.target_id = campaign_details["campaign_id"]
    action.idempotency_key = (
        f"{runtime['client_id']}:{source_alias}:{campaign_details['campaign_id']}:{search_term}"
    )
    action.payload.update(
        {
            "campaign_id": campaign_details["campaign_id"],
            "campaign_name": campaign_details["campaign_name"],
        }
    )
    # Full policy check — payload validation with resolved campaign details
    decision = evaluate_action_plan(
        action,
        dry_run=False,
        recent_actions=_recent_live_actions(memory_store, action),
    )
    if decision.decision != "approved":
        output_data(
            {"action": action, "decision": decision, "live": True},
            ctx.obj["format"],
            title="Google Ads Action",
        )
        return

    _confirm_live(
        "Actions to execute:\n"
        f"  [1] Add negative keyword \"{search_term}\" (exact) "
        f"to campaign \"{campaign_details['campaign_name']}\" ({campaign_details['campaign_id']}) "
        f"({source_alias})"
    )
    try:
        execution_result = mutator.add_negative_keyword(campaign_details["campaign_id"], search_term)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    recorded = record_manual_live_execution(
        memory_store,
        action,
        summary=f"Manual live negative keyword for {campaign_details['campaign_name']}",
        execution_result=execution_result,
    )
    output_data(
        {
            "action": action,
            "decision": decision,
            "live": True,
            "execution": execution_result,
            "recorded": recorded,
        },
        ctx.obj["format"],
        title="Google Ads Action",
    )


@google_ads.command("adjust-budget")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Scope to a configured brand.")
@click.option("--source", "source_alias", required=True, help="Google Ads source alias.")
@click.option("--campaign", required=True, help="Campaign name or id.")
@click.option("--daily-budget", type=float, required=True, help="New daily budget.")
@click.option("--dry-run", is_flag=True, help="Validate without live execution.")
@click.option("--live", is_flag=True, help="Execute the live Homescape canary mutation.")
@click.pass_context
def adjust_budget(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    source_alias: str,
    campaign: str,
    daily_budget: float,
    dry_run: bool,
    live: bool,
) -> None:
    """Validate a Google Ads budget change."""
    if dry_run and live:
        raise click.UsageError("Use either --dry-run or --live, not both.")

    runtime = load_runtime(ctx, client_id)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    _require_google_source(runtime["business_config"], source_alias)
    action = ActionPlan(
        action_id="manual-google-budget",
        hypothesis_id="manual",
        action_type="adjust_google_ads_budget",
        platform="google_ads",
        client_id=runtime["client_id"],
        brand=selected_brand,
        source_alias=source_alias,
        target_kind="campaign",
        target_id=campaign,
        confidence="manual",
        risk_level="medium",
        idempotency_key=f"{runtime['client_id']}:{source_alias}:{campaign}:budget:{daily_budget}",
        payload={"campaign": campaign, "daily_budget": daily_budget},
    )
    memory_store = MemoryStore()

    if not live:
        decision = evaluate_action_plan(action, dry_run=True)
        output_data(
            {"action": action, "decision": decision, "dry_run": True},
            ctx.obj["format"],
            title="Google Ads Action",
        )
        return

    # Early scope check — blocks non-canary clients before any API calls
    scope_block = evaluate_canary_scope_only(action)
    if scope_block:
        output_data(
            {"action": action, "decision": scope_block, "live": True},
            ctx.obj["format"],
            title="Google Ads Action",
        )
        return

    mutator = _init_mutator(runtime, source_alias)
    try:
        campaign_details = mutator.resolve_campaign(campaign)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    action.target_id = campaign_details["campaign_id"]
    action.idempotency_key = (
        f"{runtime['client_id']}:{source_alias}:{campaign_details['campaign_id']}:budget:{daily_budget}"
    )
    action.payload.update(
        {
            "campaign_id": campaign_details["campaign_id"],
            "campaign_name": campaign_details["campaign_name"],
        }
    )
    # Full policy check — budget delta + cooldown with resolved campaign details
    decision = evaluate_action_plan(
        action,
        dry_run=False,
        recent_actions=_recent_live_actions(memory_store, action),
        current_daily_budget=campaign_details["current_daily_budget"],
    )
    if decision.decision != "approved":
        output_data(
            {"action": action, "decision": decision, "live": True},
            ctx.obj["format"],
            title="Google Ads Action",
        )
        return

    current_budget = campaign_details["current_daily_budget"]
    delta_pct = (
        ((daily_budget - current_budget) / current_budget) * 100 if current_budget else 0.0
    )
    direction = "increase" if daily_budget >= current_budget else "decrease"
    _confirm_live(
        "Actions to execute:\n"
        f"  [1] {direction.capitalize()} budget on campaign \"{campaign_details['campaign_name']}\" "
        f"({campaign_details['campaign_id']}) ({source_alias}): "
        f"{campaign_details['currency']} {current_budget:.2f}/day → {campaign_details['currency']} {daily_budget:.2f}/day "
        f"({delta_pct:+.1f}%)"
    )
    try:
        execution_result = mutator.adjust_campaign_budget(campaign_details["campaign_id"], daily_budget)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    recorded = record_manual_live_execution(
        memory_store,
        action,
        summary=f"Manual live budget adjustment for {campaign_details['campaign_name']}",
        execution_result=execution_result,
    )
    output_data(
        {
            "action": action,
            "decision": decision,
            "live": True,
            "execution": execution_result,
            "recorded": recorded,
        },
        ctx.obj["format"],
        title="Google Ads Action",
    )


@google_ads.command("create-negative-list")
@click.argument("client_id", required=False)
@click.option("--source", "source_alias", required=True, help="Google Ads source alias.")
@click.option("--name", "list_name", required=True, help="Name for the shared negative list.")
@click.option(
    "--keyword", "keywords", multiple=True, required=True,
    help="Keyword to add (repeat for multiple). Format: 'text' or 'text:phrase' (default: phrase).",
)
@click.option(
    "--campaigns", "campaign_scope", default="all",
    help="Comma-separated campaign names/ids, or 'all' for every active campaign.",
)
@click.pass_context
def create_negative_list(
    ctx: click.Context,
    client_id: str | None,
    source_alias: str,
    list_name: str,
    keywords: tuple[str, ...],
    campaign_scope: str,
) -> None:
    """Create a shared negative keyword list and attach to campaigns."""
    runtime = load_runtime(ctx, client_id)
    _require_google_source(runtime["business_config"], source_alias)
    mutator = _init_mutator(runtime, source_alias)

    # Parse keywords — format "text" or "text:match_type"
    parsed_keywords = []
    for kw in keywords:
        if ":" in kw:
            text, mt = kw.rsplit(":", 1)
            mt = _MATCH_TYPE_ALIASES.get(mt.lower(), mt.upper())
        else:
            text, mt = kw, "PHRASE"
        parsed_keywords.append((text, mt))

    # Build confirmation summary
    lines = [f"Create shared negative list: \"{list_name}\"", ""]
    lines.append("Keywords:")
    for text, mt in parsed_keywords:
        lines.append(f"  [{mt}] \"{text}\"")

    # Resolve campaigns to attach
    if campaign_scope.lower() == "all":
        try:
            campaigns = mutator.list_active_campaigns()
        except GoogleAdsMutationError as exc:
            raise click.ClickException(str(exc)) from exc
        campaign_ids = [c["campaign_id"] for c in campaigns]
        lines.append("")
        lines.append(f"Attach to ALL {len(campaigns)} active campaigns:")
        for c in campaigns:
            lines.append(f"  - {c['campaign_name']} ({c['campaign_id']})")
    else:
        campaign_refs = [s.strip() for s in campaign_scope.split(",")]
        campaigns = []
        campaign_ids = []
        for ref in campaign_refs:
            try:
                details = mutator.resolve_campaign(ref)
                campaigns.append(details)
                campaign_ids.append(details["campaign_id"])
            except GoogleAdsMutationError as exc:
                raise click.ClickException(str(exc)) from exc
        lines.append("")
        lines.append(f"Attach to {len(campaigns)} campaigns:")
        for c in campaigns:
            lines.append(f"  - {c['campaign_name']} ({c['campaign_id']})")

    _confirm_live("\n".join(lines))

    # 1. Create shared set
    try:
        shared_set_rn = mutator.create_shared_negative_list(list_name)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(f"Created shared list: {shared_set_rn}", err=True)

    # 2. Add keywords
    try:
        criterion_rns = mutator.add_keywords_to_shared_set(shared_set_rn, parsed_keywords)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(f"Added {len(criterion_rns)} keywords", err=True)

    # 3. Attach to campaigns
    try:
        attach_rns = mutator.attach_shared_set_to_campaigns(shared_set_rn, campaign_ids)
    except GoogleAdsMutationError as exc:
        raise click.ClickException(str(exc)) from exc
    click.echo(f"Attached to {len(attach_rns)} campaigns", err=True)

    # 4. Record to memory
    result_payload = {
        "list_name": list_name,
        "shared_set_resource": shared_set_rn,
        "keywords": [{"text": t, "match_type": m} for t, m in parsed_keywords],
        "campaigns_attached": [
            {"campaign_id": c["campaign_id"], "campaign_name": c.get("campaign_name", "")}
            for c in campaigns
        ],
    }
    selected_brand = resolve_brand(runtime["business_config"], None)
    action = ActionPlan(
        action_id=f"manual-shared-negatives-{list_name}",
        hypothesis_id="manual",
        action_type="create_shared_negative_list",
        platform="google_ads",
        client_id=runtime["client_id"],
        brand=selected_brand,
        source_alias=source_alias,
        target_kind="account",
        target_id=shared_set_rn,
        confidence="manual",
        risk_level="low",
        idempotency_key=f"{runtime['client_id']}:{source_alias}:shared_neg:{list_name}",
        payload=result_payload,
    )
    memory_store = MemoryStore()
    recorded = record_manual_live_execution(
        memory_store,
        action,
        summary=f"Created shared negative list '{list_name}' with {len(parsed_keywords)} keywords, attached to {len(attach_rns)} campaigns",
        execution_result={
            "pre_mutation_state": {"list_existed": False},
            "mutation_result": result_payload,
            "rollback": {"shared_set_resource": shared_set_rn},
        },
    )
    click.echo("Recorded to memory", err=True)

    output_data(
        {**result_payload, "recorded": recorded},
        ctx.obj["format"],
        title="Shared Negative List",
    )
