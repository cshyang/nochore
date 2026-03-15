"""Impression share analyzer for optimization opportunities."""
import logging
from typing import Any, Dict, List
import polars as pl

from ..models import LostISInsight, BudgetRec

logger = logging.getLogger(__name__)


def _to_pct(value: object) -> float:
    """Normalise an impression-share value to a 0-100 percentage."""
    if value is None:
        return 0.0
    pct = float(value)
    return pct * 100 if pct <= 1.0 else pct


class ImpressionShareAnalyzer:
    """Analyzes impression share for optimization opportunities."""

    def __init__(self, impression_share_df: pl.DataFrame):
        self.df = impression_share_df
        if not self.df.is_empty():
            if "source_alias" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_alias"))
            if "source_account_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_account_id"))
            if "campaign_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("campaign_id"))

    def _latest_per_campaign(self) -> pl.DataFrame:
        """Get most recent snapshot per campaign (scoped by source account)."""
        return (
            self.df.sort("date", descending=True)
            .group_by(["source_alias", "source_account_id", "campaign_id", "campaign_name"])
            .first()
        )

    def summarize_impression_share(self) -> List[Dict[str, Any]]:
        """Return ALL campaigns with impression share metrics -- no filtering.

        The LLM downstream decides which campaigns need attention.
        Results are sorted by total IS lost descending.
        """
        if self.df.is_empty():
            return []

        latest_df = self._latest_per_campaign()
        campaigns = []

        for row in latest_df.iter_rows(named=True):
            current_is = row.get("impression_share")
            if current_is is None:
                continue

            impression_share_pct = _to_pct(current_is)
            budget_lost_pct = _to_pct(row.get("search_budget_lost_is"))
            rank_lost_pct = _to_pct(row.get("search_rank_lost_is"))
            total_lost_pct = budget_lost_pct + rank_lost_pct

            campaigns.append({
                "campaign_name": row["campaign_name"],
                "campaign_id": row["campaign_id"],
                "impression_share_pct": impression_share_pct,
                "budget_lost_pct": budget_lost_pct,
                "rank_lost_pct": rank_lost_pct,
                "total_lost_pct": total_lost_pct,
                "source_alias": row["source_alias"],
                "source_account_id": row["source_account_id"],
                "currency": row.get("currency", ""),
            })

        campaigns.sort(key=lambda c: c["total_lost_pct"], reverse=True)
        logger.info(f"Summarized impression share for {len(campaigns)} campaigns")
        return campaigns

    def get_lost_opportunities(self) -> List[LostISInsight]:
        """Return ALL campaigns with lost IS -- no threshold filtering.

        Backward-compatible: still returns LostISInsight objects.
        """
        if self.df.is_empty():
            return []

        latest_df = self._latest_per_campaign()
        insights = []

        for row in latest_df.iter_rows(named=True):
            current_is = row.get("impression_share")
            if current_is is None:
                continue

            current_is_pct = _to_pct(current_is)
            budget_lost_pct = _to_pct(row.get("search_budget_lost_is"))
            rank_lost_pct = _to_pct(row.get("search_rank_lost_is"))

            insights.append(LostISInsight(
                campaign=row["campaign_name"],
                current_is=current_is_pct,
                lost_to_budget=budget_lost_pct,
                lost_to_rank=rank_lost_pct,
                action="",
            ))

        insights.sort(key=lambda x: x.lost_to_budget + x.lost_to_rank, reverse=True)
        logger.info(f"Identified {len(insights)} impression share opportunities")
        return insights

    def get_budget_recommendations(self, current_budgets: dict = None) -> List[BudgetRec]:
        """Deprecated: returns empty list. Use summarize_impression_share() instead."""
        return []
