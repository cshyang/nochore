"""Impression share analyzer for optimization opportunities."""
import logging
from typing import List
import polars as pl

from ..data_models import LostISInsight, BudgetRec

logger = logging.getLogger(__name__)

class ImpressionShareAnalyzer:
    """Analyzes impression share for optimization opportunities."""
    
    def __init__(self, impression_share_df: pl.DataFrame, low_is_threshold: float = 50.0):
        self.df = impression_share_df
        if not self.df.is_empty():
            if "source_account_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_account_id"))
            if "campaign_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("campaign_id"))
        self.low_is_threshold = low_is_threshold
    
    def get_lost_opportunities(self) -> List[LostISInsight]:
        """Identify campaigns with significant lost impression share."""
        if self.df.is_empty():
            return []
        
        def to_pct(value: object) -> float:
            if value is None:
                return 0.0
            pct = float(value)
            return pct * 100 if pct <= 1.0 else pct

        # Get most recent data per campaign (scoped by source account)
        latest_df = (
            self.df.sort("date", descending=True)
            .group_by(["source_account_id", "campaign_id", "campaign_name"])
            .first()
        )
        
        insights = []

        for row in latest_df.iter_rows(named=True):
            current_is = row.get("impression_share")
            if current_is is None:
                continue

            current_is_pct = to_pct(current_is)
            if current_is_pct >= self.low_is_threshold:
                continue

            budget_lost_pct = to_pct(row.get("search_budget_lost_is"))
            rank_lost_pct = to_pct(row.get("search_rank_lost_is"))

            # Describe primary driver (no promises)
            if budget_lost_pct > rank_lost_pct:
                action = f"Primary loss driver: budget ({budget_lost_pct:.1f}%)"
            elif rank_lost_pct > budget_lost_pct:
                action = f"Primary loss driver: rank ({rank_lost_pct:.1f}%)"
            else:
                action = "Primary loss driver: mixed"
            
            insights.append(LostISInsight(
                campaign=row["campaign_name"],
                current_is=current_is_pct,
                lost_to_budget=budget_lost_pct,
                lost_to_rank=rank_lost_pct,
                action=action
            ))
        
        # Sort by total lost IS
        insights.sort(key=lambda x: x.lost_to_budget + x.lost_to_rank, reverse=True)
        
        logger.info(f"Identified {len(insights)} impression share opportunities")
        return insights
    
    def get_budget_recommendations(self, current_budgets: dict = None) -> List[BudgetRec]:
        """Estimate budget increases needed."""
        if self.df.is_empty():
            return []
        
        def to_pct(value: object) -> float:
            if value is None:
                return 0.0
            pct = float(value)
            return pct * 100 if pct <= 1.0 else pct

        latest_df = (
            self.df.sort("date", descending=True)
            .group_by(["source_account_id", "campaign_id", "campaign_name"])
            .first()
        )
        
        recommendations = []
        for row in latest_df.iter_rows(named=True):
            budget_lost_pct = to_pct(row.get("search_budget_lost_is"))
            if budget_lost_pct <= 10:
                continue

            campaign = row["campaign_name"]
            current_daily = current_budgets.get(campaign, 0) if current_budgets else 0

            current_is_pct = to_pct(row.get("impression_share")) or 50.0
            increase_ratio = budget_lost_pct / current_is_pct if current_is_pct > 0 else 0.5
            recommended_daily = current_daily * (1 + increase_ratio) if current_daily > 0 else 0

            recommendations.append(
                BudgetRec(
                    campaign=campaign,
                    current_daily=current_daily,
                    recommended_daily=recommended_daily,
                    expected_is_gain=budget_lost_pct * 0.7,  # heuristic
                )
            )
        
        return recommendations
