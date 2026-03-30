"""Meta dry-run mutation tools."""

from __future__ import annotations

import click

from src.cli.workflows.common import load_runtime, resolve_brand
from src.engine.policy import evaluate_action_plan
from src.models import ActionPlan
from src.output import output_data


def _require_meta_source(business_config, alias: str) -> None:
    source = business_config.sources.get(alias)
    if source is None or source[0] != "meta":
        raise click.UsageError(f"Source alias '{alias}' is not a configured Meta source.")


@click.group()
def meta() -> None:
    """Meta dry-run mutation primitives."""


@meta.command("create-variant")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Scope to a configured brand.")
@click.option("--source", "source_alias", required=True, help="Meta source alias.")
@click.option("--adset-id", required=True, help="Target ad set identifier.")
@click.option("--name", "variant_name", required=True, help="New variant name.")
@click.option("--message", required=True, help="Primary message/body text.")
@click.option("--dry-run", is_flag=True, help="Validate without live execution.")
@click.pass_context
def create_variant(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    source_alias: str,
    adset_id: str,
    variant_name: str,
    message: str,
    dry_run: bool,
) -> None:
    """Validate a Meta creative-variant action."""
    runtime = load_runtime(ctx, client_id)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    _require_meta_source(runtime["business_config"], source_alias)
    action = ActionPlan(
        action_id="manual-meta-variant",
        hypothesis_id="manual",
        action_type="create_meta_ad_variant",
        platform="meta",
        client_id=runtime["client_id"],
        brand=selected_brand,
        source_alias=source_alias,
        target_kind="adset",
        target_id=adset_id,
        confidence="manual",
        risk_level="medium",
        idempotency_key=f"{runtime['client_id']}:{source_alias}:{adset_id}:{variant_name}",
        payload={"adset_id": adset_id, "variant_name": variant_name, "message": message},
    )
    decision = evaluate_action_plan(action, dry_run=dry_run)
    output_data(
        {"action": action, "decision": decision, "dry_run": dry_run},
        ctx.obj["format"],
        title="Meta Action",
    )


@meta.command("adjust-budget")
@click.argument("client_id", required=False)
@click.option("--brand", default=None, help="Scope to a configured brand.")
@click.option("--source", "source_alias", required=True, help="Meta source alias.")
@click.option("--campaign", required=True, help="Campaign or ad set identifier.")
@click.option("--daily-budget", type=float, required=True, help="New daily budget.")
@click.option("--dry-run", is_flag=True, help="Validate without live execution.")
@click.pass_context
def adjust_budget(
    ctx: click.Context,
    client_id: str | None,
    brand: str | None,
    source_alias: str,
    campaign: str,
    daily_budget: float,
    dry_run: bool,
) -> None:
    """Validate a Meta budget change."""
    runtime = load_runtime(ctx, client_id)
    selected_brand = resolve_brand(runtime["business_config"], brand)
    _require_meta_source(runtime["business_config"], source_alias)
    action = ActionPlan(
        action_id="manual-meta-budget",
        hypothesis_id="manual",
        action_type="adjust_meta_budget",
        platform="meta",
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
        title="Meta Action",
    )
