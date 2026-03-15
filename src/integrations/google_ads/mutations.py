"""Google Ads mutation helpers for the live canary."""

from __future__ import annotations

from typing import Any, Dict

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException


class GoogleAdsMutationError(RuntimeError):
    """Raised when a Google Ads mutation cannot be prepared or executed."""


class GoogleAdsMutator:
    """Small live mutation adapter for campaign negatives and budgets."""

    def __init__(self, client: GoogleAdsClient, source_alias: str, customer_id: str):
        self.client = client
        self.source_alias = source_alias
        self.customer_id = customer_id.replace("-", "")
        self.ga_service = client.get_service("GoogleAdsService")
        self.campaign_service = client.get_service("CampaignService")
        self.campaign_criterion_service = client.get_service("CampaignCriterionService")
        self.campaign_budget_service = client.get_service("CampaignBudgetService")

    def resolve_campaign(self, campaign_ref: str) -> Dict[str, Any]:
        """Resolve a campaign by id or exact name."""
        escaped_ref = str(campaign_ref).replace("'", "''")
        predicate = (
            f"campaign.id = {int(campaign_ref)}"
            if str(campaign_ref).isdigit()
            else f"campaign.name = '{escaped_ref}'"
        )
        query = f"""
            SELECT
                campaign.id,
                campaign.name,
                campaign.campaign_budget,
                campaign_budget.amount_micros,
                customer.currency_code
            FROM campaign
            WHERE {predicate}
              AND campaign.status != 'REMOVED'
            LIMIT 2
        """

        rows = list(self.ga_service.search(customer_id=self.customer_id, query=query))
        if not rows:
            raise GoogleAdsMutationError(f"Campaign '{campaign_ref}' was not found in Google Ads.")
        if len(rows) > 1:
            raise GoogleAdsMutationError(
                f"Campaign reference '{campaign_ref}' matched multiple Google Ads campaigns; use the campaign id instead."
            )

        row = rows[0]
        return {
            "campaign_id": str(row.campaign.id),
            "campaign_name": row.campaign.name,
            "budget_resource_name": row.campaign.campaign_budget,
            "current_daily_budget": float(row.campaign_budget.amount_micros or 0) / 1_000_000,
            "currency": row.customer.currency_code,
        }

    def add_negative_keyword(self, campaign_ref: str, search_term: str) -> Dict[str, Any]:
        """Create a campaign-level exact negative keyword."""
        campaign = self.resolve_campaign(campaign_ref)
        operation = self.client.get_type("CampaignCriterionOperation")
        criterion = operation.create
        criterion.campaign = self.campaign_service.campaign_path(
            self.customer_id,
            campaign["campaign_id"],
        )
        criterion.negative = True
        criterion.keyword.text = search_term
        criterion.keyword.match_type = self.client.enums.KeywordMatchTypeEnum.EXACT

        try:
            response = self.campaign_criterion_service.mutate_campaign_criteria(
                customer_id=self.customer_id,
                operations=[operation],
            )
        except GoogleAdsException as exc:
            raise GoogleAdsMutationError(f"Google Ads negative-keyword mutation failed: {exc}") from exc

        resource_name = response.results[0].resource_name if response.results else ""
        return {
            "source_alias": self.source_alias,
            "campaign_id": campaign["campaign_id"],
            "campaign_name": campaign["campaign_name"],
            "currency": campaign["currency"],
            "pre_mutation_state": {
                "search_term": search_term,
                "match_type": "EXACT",
            },
            "mutation_result": {
                "resource_name": resource_name,
                "criterion_id": resource_name.split("~")[-1] if "~" in resource_name else "",
            },
            "rollback": {
                "resource_name": resource_name,
                "criterion_id": resource_name.split("~")[-1] if "~" in resource_name else "",
            },
        }

    def adjust_campaign_budget(self, campaign_ref: str, daily_budget: float) -> Dict[str, Any]:
        """Update a campaign budget after resolving its current state."""
        campaign = self.resolve_campaign(campaign_ref)
        operation = self.client.get_type("CampaignBudgetOperation")
        budget = operation.update
        budget.resource_name = campaign["budget_resource_name"]
        budget.amount_micros = int(round(daily_budget * 1_000_000))
        operation.update_mask.paths.append("amount_micros")

        try:
            response = self.campaign_budget_service.mutate_campaign_budgets(
                customer_id=self.customer_id,
                operations=[operation],
            )
        except GoogleAdsException as exc:
            raise GoogleAdsMutationError(f"Google Ads budget mutation failed: {exc}") from exc

        resource_name = response.results[0].resource_name if response.results else campaign["budget_resource_name"]
        return {
            "source_alias": self.source_alias,
            "campaign_id": campaign["campaign_id"],
            "campaign_name": campaign["campaign_name"],
            "currency": campaign["currency"],
            "pre_mutation_state": {
                "budget_resource_name": campaign["budget_resource_name"],
                "previous_daily_budget": campaign["current_daily_budget"],
            },
            "mutation_result": {
                "resource_name": resource_name,
                "new_daily_budget": daily_budget,
            },
            "rollback": {
                "budget_resource_name": campaign["budget_resource_name"],
                "previous_daily_budget": campaign["current_daily_budget"],
                "new_daily_budget": daily_budget,
            },
        }
