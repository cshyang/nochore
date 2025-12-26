"""Quality score analyzer for keyword optimization."""
import logging
from typing import List, Dict
import polars as pl

from ..data_models import QSChange, LowQSAlert

logger = logging.getLogger(__name__)

class QualityScoreAnalyzer:
    """Analyzes quality scores for optimization opportunities."""
    
    def __init__(self, quality_score_df: pl.DataFrame, 
                 low_qs_threshold: int = 5,
                 spend_threshold: float = 100.0):
        self.df = quality_score_df
        if not self.df.is_empty():
            if "currency" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("UNKNOWN").alias("currency"))
            if "source_account_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_account_id"))
        self.low_qs_threshold = low_qs_threshold
        self.spend_threshold = spend_threshold
    
    def get_qs_changes(self, days: int = 30) -> List[QSChange]:
        """Track keywords where QS improved or declined."""
        if self.df.is_empty():
            return []
        
        # Get date range
        max_date = self.df["date"].max()
        min_date = max_date - pl.duration(days=days)
        
        # Filter to date range
        period_df = self.df.filter(
            (pl.col("date") >= min_date) & 
            (pl.col("quality_score").is_not_null())
        )
        
        if period_df.is_empty():
            return []
        
        # Get first and last QS for each keyword (scoped by source account)
        first_qs = period_df.sort("date").group_by(["source_account_id", "keyword_id"]).first()
        last_qs = period_df.sort("date").group_by(["source_account_id", "keyword_id"]).last()
        
        # Join to compare
        changes_df = first_qs.join(
            last_qs,
            on=["source_account_id", "keyword_id"],
            suffix="_last"
        )
        
        # Filter to actual changes
        changes_df = changes_df.filter(
            pl.col("quality_score") != pl.col("quality_score_last")
        )
        
        changes = []
        for row in changes_df.iter_rows(named=True):
            prev_qs = row["quality_score"]
            curr_qs = row["quality_score_last"]
            
            # Determine component issue
            component_issue = None
            if curr_qs < prev_qs:
                # Check which component may have changed
                if row["landing_page_exp_last"] == "BELOW_AVERAGE":
                    component_issue = "Landing Page"
                elif row["ad_relevance_last"] == "BELOW_AVERAGE":
                    component_issue = "Ad Relevance"
                elif row["expected_ctr_last"] == "BELOW_AVERAGE":
                    component_issue = "Expected CTR"
            
            changes.append(QSChange(
                keyword=row["keyword_text"],
                campaign=row["campaign_name"],
                previous_qs=prev_qs,
                current_qs=curr_qs,
                change_direction="improved" if curr_qs > prev_qs else "declined",
                component_issue=component_issue
            ))
        
        logger.info(f"Found {len(changes)} quality score changes")
        return changes
    
    def get_low_qs_alerts(self) -> List[LowQSAlert]:
        """Alert on keywords with low QS and significant spend."""
        if self.df.is_empty():
            return []
        
        base_df = self.df.sort("date")

        # Aggregate spend per keyword (scoped by source account + currency)
        agg_df = base_df.group_by(["source_account_id", "currency", "keyword_id", "keyword_text", "campaign_name"]).agg(
            pl.col("cost").sum().alias("total_cost"),
            pl.col("quality_score").last().alias("latest_qs"),
            pl.col("landing_page_exp").last().alias("landing_page"),
            pl.col("ad_relevance").last().alias("ad_rel"),
            pl.col("expected_ctr").last().alias("exp_ctr"),
        )
        
        # Filter to low QS with significant spend
        low_qs_df = agg_df.filter(
            (pl.col("latest_qs").is_not_null()) &
            (pl.col("latest_qs") <= self.low_qs_threshold) &
            (pl.col("total_cost") > self.spend_threshold)
        )
        
        # Sort by spend descending
        low_qs_df = low_qs_df.sort("total_cost", descending=True)
        
        alerts = []
        for row in low_qs_df.iter_rows(named=True):
            alerts.append(LowQSAlert(
                keyword=row["keyword_text"],
                campaign=row["campaign_name"],
                currency=row.get("currency") or "USD",
                quality_score=row["latest_qs"],
                spend=row["total_cost"],
                landing_page=row["landing_page"],
                ad_relevance=row["ad_rel"],
                expected_ctr=row["exp_ctr"],
            ))
        
        logger.info(f"Generated {len(alerts)} low QS alerts")
        return alerts
    
    def get_distribution(self) -> Dict[str, int]:
        """Get distribution of keywords across QS buckets."""
        if self.df.is_empty():
            return {"8-10": 0, "5-7": 0, "1-4": 0}
        
        # Get latest QS per keyword (scoped by source account)
        latest_df = self.df.sort("date").group_by(["source_account_id", "keyword_id"]).last()
        latest_df = latest_df.filter(pl.col("quality_score").is_not_null())
        
        high = len(latest_df.filter(pl.col("quality_score") >= 8))
        medium = len(latest_df.filter((pl.col("quality_score") >= 5) & (pl.col("quality_score") < 8)))
        low = len(latest_df.filter(pl.col("quality_score") < 5))
        
        return {
            "8-10": high,
            "5-7": medium,
            "1-4": low
        }
