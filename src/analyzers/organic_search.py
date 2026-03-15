"""Organic search analyzer using Search Console data."""

import logging
from typing import Any, Dict, List, Optional

import polars as pl

from ..models.analysis import (
    CTROpportunity,
    DemandTrend,
    OrganicPageInsight,
    OrganicQueryInsight,
    OrganicSearchResults,
)

logger = logging.getLogger(__name__)


class OrganicSearchAnalyzer:
    """Analyzes organic search demand and opportunities from Search Console data.

    Returns all data with metrics intact. Threshold-based judgement
    is left to the LLM consumer.
    """

    def __init__(
        self,
        sc_df: pl.DataFrame,
        brand_terms: Optional[List[str]] = None,
    ):
        self.df = sc_df
        self.brand_terms = [t.casefold() for t in (brand_terms or [])]

    def analyze(self) -> Optional[OrganicSearchResults]:
        """Run full organic search analysis."""
        if self.df.is_empty():
            return None

        top_queries = self._get_top_queries()
        top_pages = self._get_top_pages()
        ctr_opps = self._get_ctr_opportunities()
        demand_trends = self._get_demand_trends()
        branded = self._compute_branded_split()
        summary = self._compute_summary()

        return OrganicSearchResults(
            top_queries=top_queries,
            top_pages=top_pages,
            ctr_opportunities=ctr_opps,
            demand_trends=demand_trends,
            branded_vs_nonbranded=branded,
            summary=summary,
        )

    def _is_branded(self, query: str) -> bool:
        q = query.casefold()
        return any(term in q for term in self.brand_terms)

    def _get_top_queries(self, limit: int = 100) -> List[OrganicQueryInsight]:
        """All queries sorted by click volume, capped for payload size."""
        agg = (
            self.df.group_by("query")
            .agg(
                pl.col("clicks").sum().alias("total_clicks"),
                pl.col("impressions").sum().alias("total_impressions"),
                pl.col("position").mean().alias("avg_position"),
            )
            .with_columns(
                (pl.col("total_clicks") / pl.col("total_impressions")).alias("ctr"),
            )
            .sort("total_clicks", descending=True)
            .head(limit)
        )

        return [
            OrganicQueryInsight(
                query=row["query"],
                clicks=row["total_clicks"],
                impressions=row["total_impressions"],
                ctr=round(row["ctr"], 4),
                position=round(row["avg_position"], 1),
                is_branded=self._is_branded(row["query"]),
            )
            for row in agg.iter_rows(named=True)
        ]

    def _get_top_pages(self, limit: int = 15) -> List[OrganicPageInsight]:
        """Top pages by click volume."""
        agg = (
            self.df.group_by("page")
            .agg(
                pl.col("clicks").sum().alias("total_clicks"),
                pl.col("impressions").sum().alias("total_impressions"),
                pl.col("position").mean().alias("avg_position"),
            )
            .with_columns(
                (pl.col("total_clicks") / pl.col("total_impressions")).alias("ctr"),
            )
            .sort("total_clicks", descending=True)
            .head(limit)
        )

        return [
            OrganicPageInsight(
                page=row["page"],
                clicks=row["total_clicks"],
                impressions=row["total_impressions"],
                ctr=round(row["ctr"], 4),
                avg_position=round(row["avg_position"], 1),
            )
            for row in agg.iter_rows(named=True)
        ]

    def _get_ctr_opportunities(self, limit: int = 50) -> List[CTROpportunity]:
        """All queries with their benchmark CTR gap, sorted by estimated click gain."""
        agg = (
            self.df.group_by("query")
            .agg(
                pl.col("clicks").sum().alias("total_clicks"),
                pl.col("impressions").sum().alias("total_impressions"),
                pl.col("position").mean().alias("avg_position"),
            )
            .with_columns(
                (pl.col("total_clicks") / pl.col("total_impressions")).alias("ctr"),
            )
        )

        results = []
        for row in agg.iter_rows(named=True):
            benchmark_ctr = self._position_benchmark_ctr(row["avg_position"])
            estimated_gain = int(
                row["total_impressions"] * max(0, benchmark_ctr - row["ctr"])
            )
            results.append(
                CTROpportunity(
                    query=row["query"],
                    impressions=row["total_impressions"],
                    clicks=row["total_clicks"],
                    ctr=round(row["ctr"], 4),
                    position=round(row["avg_position"], 1),
                    estimated_click_gain=estimated_gain,
                )
            )
        results.sort(key=lambda x: x.estimated_click_gain, reverse=True)
        return results[:limit]

    def _get_demand_trends(self) -> List[DemandTrend]:
        """Compare first half vs second half of the date range for trend detection.

        Returns all trends with raw change percentages and direction labels.
        Rising and falling are capped at 30 each; stable queries are included.
        """
        if self.df.is_empty():
            return []

        dates = self.df["date"].unique().sort()
        if len(dates) < 14:
            return []

        mid = dates[len(dates) // 2]
        first_half = self.df.filter(pl.col("date") < mid)
        second_half = self.df.filter(pl.col("date") >= mid)

        first_agg = first_half.group_by("query").agg(
            pl.col("impressions").sum().alias("prev_impressions"),
        )
        second_agg = second_half.group_by("query").agg(
            pl.col("impressions").sum().alias("curr_impressions"),
        )

        joined = second_agg.join(first_agg, on="query", how="left").fill_null(0)
        joined = joined.with_columns(
            pl.when(pl.col("prev_impressions") > 0)
            .then(
                (pl.col("curr_impressions") - pl.col("prev_impressions"))
                / pl.col("prev_impressions")
                * 100
            )
            .otherwise(100.0)
            .alias("change_pct")
        )

        trends = []
        for row in joined.sort("change_pct", descending=True).iter_rows(named=True):
            change = row["change_pct"]
            if change > 0:
                direction = "rising"
            elif change < 0:
                direction = "falling"
            else:
                direction = "stable"
            trends.append(
                DemandTrend(
                    query=row["query"],
                    direction=direction,
                    current_impressions=row["curr_impressions"],
                    previous_impressions=row["prev_impressions"],
                    change_pct=round(change, 1),
                )
            )

        rising = [t for t in trends if t.direction == "rising"][:30]
        falling = sorted(
            [t for t in trends if t.direction == "falling"],
            key=lambda t: t.change_pct,
        )[:30]
        stable = [t for t in trends if t.direction == "stable"]
        return rising + falling + stable

    def _compute_branded_split(self) -> Dict[str, Any]:
        """Split clicks/impressions into branded vs non-branded."""
        if not self.brand_terms:
            return {
                "branded_clicks": 0,
                "nonbranded_clicks": 0,
                "note": "no brand terms configured",
            }

        all_queries = self.df.group_by("query").agg(
            pl.col("clicks").sum().alias("clicks"),
            pl.col("impressions").sum().alias("impressions"),
        )

        branded_clicks = 0
        branded_impressions = 0
        nonbranded_clicks = 0
        nonbranded_impressions = 0

        for row in all_queries.iter_rows(named=True):
            if self._is_branded(row["query"]):
                branded_clicks += row["clicks"]
                branded_impressions += row["impressions"]
            else:
                nonbranded_clicks += row["clicks"]
                nonbranded_impressions += row["impressions"]

        total_clicks = branded_clicks + nonbranded_clicks
        return {
            "branded_clicks": branded_clicks,
            "branded_impressions": branded_impressions,
            "nonbranded_clicks": nonbranded_clicks,
            "nonbranded_impressions": nonbranded_impressions,
            "branded_click_share": (
                round(branded_clicks / total_clicks, 4) if total_clicks > 0 else 0.0
            ),
        }

    def _compute_summary(self) -> Dict[str, Any]:
        """Aggregate summary stats."""
        total_clicks = int(self.df["clicks"].sum())
        total_impressions = int(self.df["impressions"].sum())
        unique_queries = self.df["query"].n_unique()
        unique_pages = self.df["page"].n_unique()
        return {
            "total_clicks": total_clicks,
            "total_impressions": total_impressions,
            "overall_ctr": (
                round(total_clicks / total_impressions, 4)
                if total_impressions > 0
                else 0.0
            ),
            "unique_queries": unique_queries,
            "unique_pages": unique_pages,
        }

    @staticmethod
    def _position_benchmark_ctr(position: float) -> float:
        """Rough CTR benchmarks by position range."""
        if position <= 1:
            return 0.30
        elif position <= 3:
            return 0.10
        elif position <= 5:
            return 0.05
        elif position <= 10:
            return 0.02
        else:
            return 0.01
