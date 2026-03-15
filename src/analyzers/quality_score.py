"""Quality score analyzer for keyword optimization."""
import logging
from typing import Dict, List

import polars as pl

from ..models import QSChange, QualityScoreSummary

logger = logging.getLogger(__name__)


class QualityScoreAnalyzer:
    """Analyzes quality scores for optimization opportunities."""

    def __init__(self, quality_score_df: pl.DataFrame):
        self.df = quality_score_df
        if not self.df.is_empty():
            if "currency" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("UNKNOWN").alias("currency"))
            if "source_account_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_account_id"))

    def get_qs_changes(self, days: int = 30) -> List[QSChange]:
        """Track keywords where QS improved or declined.

        Returns ALL three component statuses per keyword, not just the first
        problematic one.
        """
        if self.df.is_empty():
            return []

        max_date = self.df["date"].max()
        min_date = max_date - pl.duration(days=days)

        period_df = self.df.filter(
            (pl.col("date") >= min_date)
            & (pl.col("quality_score").is_not_null())
        )

        if period_df.is_empty():
            return []

        # Get first and last QS for each keyword (scoped by source account)
        first_qs = period_df.sort("date").group_by(["source_account_id", "keyword_id"]).first()
        last_qs = period_df.sort("date").group_by(["source_account_id", "keyword_id"]).last()

        changes_df = first_qs.join(
            last_qs,
            on=["source_account_id", "keyword_id"],
            suffix="_last",
        )

        # Filter to actual changes
        changes_df = changes_df.filter(
            pl.col("quality_score") != pl.col("quality_score_last")
        )

        changes = []
        for row in changes_df.iter_rows(named=True):
            prev_qs = row["quality_score"]
            curr_qs = row["quality_score_last"]

            changes.append(QSChange(
                keyword=row["keyword_text"],
                campaign=row["campaign_name"],
                previous_qs=prev_qs,
                current_qs=curr_qs,
                change_direction="improved" if curr_qs > prev_qs else "declined",
                landing_page_exp=row.get("landing_page_exp_last", ""),
                ad_relevance=row.get("ad_relevance_last", ""),
                expected_ctr=row.get("expected_ctr_last", ""),
            ))

        logger.info(f"Found {len(changes)} quality score changes")
        return changes

    def summarize_quality_scores(self) -> List[QualityScoreSummary]:
        """Return ALL keywords with current QS, all three components, spend,
        and QS change from previous period.

        No threshold filtering -- code computes, LLM judges.
        """
        if self.df.is_empty():
            return []

        base_df = self.df.sort("date")

        # Latest + first QS per keyword to compute change
        agg_df = base_df.group_by(
            ["source_account_id", "currency", "keyword_id", "keyword_text", "campaign_name"]
        ).agg(
            pl.col("cost").sum().alias("total_cost"),
            pl.col("quality_score").first().alias("first_qs"),
            pl.col("quality_score").last().alias("latest_qs"),
            pl.col("landing_page_exp").last().alias("landing_page"),
            pl.col("ad_relevance").last().alias("ad_rel"),
            pl.col("expected_ctr").last().alias("exp_ctr"),
        )

        # Filter out rows with no QS data at all
        agg_df = agg_df.filter(pl.col("latest_qs").is_not_null())

        # Sort by spend descending
        agg_df = agg_df.sort("total_cost", descending=True)

        summaries = []
        for row in agg_df.iter_rows(named=True):
            first_qs = row["first_qs"]
            latest_qs = row["latest_qs"]
            qs_change = (latest_qs - first_qs) if first_qs is not None else None

            summaries.append(QualityScoreSummary(
                keyword=row["keyword_text"],
                campaign=row["campaign_name"],
                currency=row.get("currency") or "USD",
                quality_score=latest_qs,
                spend=row["total_cost"],
                landing_page=row["landing_page"],
                ad_relevance=row["ad_rel"],
                expected_ctr=row["exp_ctr"],
                qs_change=qs_change,
            ))

        logger.info(f"Summarized {len(summaries)} keyword quality scores")
        return summaries

    # Backward-compat wrapper: callers that still reference get_low_qs_alerts()
    # get the full unfiltered list.
    def get_low_qs_alerts(self) -> List[QualityScoreSummary]:
        """Deprecated -- prefer summarize_quality_scores()."""
        return self.summarize_quality_scores()

    def get_distribution(self) -> Dict[str, int]:
        """Get distribution of keywords across QS buckets."""
        if self.df.is_empty():
            return {"8-10": 0, "5-7": 0, "1-4": 0}

        # Get latest QS per keyword (scoped by source account)
        latest_df = self.df.sort("date").group_by(["source_account_id", "keyword_id"]).last()
        latest_df = latest_df.filter(pl.col("quality_score").is_not_null())

        high = len(latest_df.filter(pl.col("quality_score") >= 8))
        medium = len(latest_df.filter(
            (pl.col("quality_score") >= 5) & (pl.col("quality_score") < 8)
        ))
        low = len(latest_df.filter(pl.col("quality_score") < 5))

        return {
            "8-10": high,
            "5-7": medium,
            "1-4": low,
        }
