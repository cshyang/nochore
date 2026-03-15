"""Google Ads dry-run mutation tools."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_brand
from src.engine.policy import evaluate_action_plan
from src.models import ActionPlan
from src.output import output_data


def _require_google_source(business_config, alias: str) -> None:
    source = business_config.sources.get(alias)
    if source is None or source[0] != "google_ads":
        raise click.UsageError(f"Source alias '{alias}' is not a configured Google Ads source.")


@click.group("google-ads")
def google_ads() -> None:
    """Google Ads dry-run mutation primitives."""


@google_ads.command("add-negative")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Scope to a configured brand.")
@click.option("--source", "source_alias", required=True, help="Google Ads source alias.")
@click.option("--campaign", required=True, help="Campaign name or id.")
@click.option("--search-term", required=True, help="Search term to block.")
@click.option("--dry-run", is_flag=True, help="Validate without live execution.")
@click.pass_context
def add_negative(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    source_alias: str,
    campaign: str,
    search_term: str,
    dry_run: bool,
) -> None:
    """Validate a Google Ads negative-keyword action."""
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
        payload={"campaign": campaign, "search_term": search_term},
    )
    decision = evaluate_action_plan(action, dry_run=dry_run)
    output_data(
        {"action": action, "decision": decision, "dry_run": dry_run},
        ctx.obj["format"],
        title="Google Ads Action",
    )


@google_ads.command("increase-budget")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Scope to a configured brand.")
@click.option("--source", "source_alias", required=True, help="Google Ads source alias.")
@click.option("--campaign", required=True, help="Campaign name or id.")
@click.option("--daily-budget", type=float, required=True, help="New daily budget.")
@click.option("--dry-run", is_flag=True, help="Validate without live execution.")
@click.pass_context
def increase_budget(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    source_alias: str,
    campaign: str,
    daily_budget: float,
    dry_run: bool,
) -> None:
    """Validate a Google Ads budget change."""
    runtime = load_runtime(ctx, client_id)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    _require_google_source(runtime["business_config"], source_alias)
    action = ActionPlan(
        action_id="manual-google-budget",
        hypothesis_id="manual",
        action_type="increase_campaign_budget",
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
    decision = evaluate_action_plan(action, dry_run=dry_run)
    output_data(
        {"action": action, "decision": decision, "dry_run": dry_run},
        ctx.obj["format"],
        title="Google Ads Action",
    )
