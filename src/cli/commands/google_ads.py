"""Google Ads mutation tools with a live canary path."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_brand
from src.engine.policy import evaluate_action_plan
from src.integrations.google_ads import GoogleAdsMutationError, GoogleAdsMutator
from src.models import ActionPlan
from src.output import output_data
from src.tools.analysis import init_google_ads_client
from src.tools.experiments import record_manual_live_execution
from src.tools.memory import MemoryStore


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
