"""Web quality analyzer using GA4 landing page data."""

import logging
from typing import Any, Dict, List, Optional

import polars as pl

from ..models.analysis import (
    LandingPageInsight,
    PaidVsEngagementInsight,
    WebQualityResults,
)

logger = logging.getLogger(__name__)

PAID_CHANNELS = {"Paid Search", "Paid Social", "Paid Shopping", "Paid Video", "Display"}


class WebQualityAnalyzer:
    """Analyzes post-click quality from GA4 landing page data."""

    def __init__(
        self,
        ga4_df: pl.DataFrame,
        min_sessions: int = 10,
        low_engagement_threshold: float = 0.40,
    ):
        self.df = ga4_df
        self.min_sessions = min_sessions
        self.low_engagement_threshold = low_engagement_threshold

    def analyze(self) -> Optional[WebQualityResults]:
        """Run full web quality analysis. Returns None if no data."""
        if self.df.is_empty():
            return None

        top_pages = self._get_top_landing_pages()
        low_engagement = self._get_low_engagement_pages()
        low_key_events = self._get_low_key_event_pages()
        paid_gaps = self._get_paid_engagement_gaps()
        summary = self._compute_summary()

        return WebQualityResults(
            top_landing_pages=top_pages,
            low_engagement_pages=low_engagement,
            low_key_event_pages=low_key_events,
            paid_engagement_gaps=paid_gaps,
            summary=summary,
        )

    def _aggregate_by_page(self) -> pl.DataFrame:
        """Aggregate GA4 data by landing page across all dates/channels."""
        return (
            self.df.group_by("landing_page")
            .agg(
                pl.col("sessions").sum().alias("total_sessions"),
                pl.col("engaged_sessions").sum().alias("total_engaged"),
                pl.col("key_events").sum().alias("total_key_events"),
                pl.col("bounce_rate").mean().alias("avg_bounce_rate"),
            )
            .with_columns(
                (pl.col("total_engaged") / pl.col("total_sessions")).alias(
                    "engagement_rate"
                ),
                (pl.col("total_key_events") / pl.col("total_sessions")).alias(
                    "key_event_rate"
                ),
            )
            .filter(pl.col("total_sessions") >= self.min_sessions)
        )

    def _get_top_landing_pages(self, limit: int = 15) -> List[LandingPageInsight]:
        """Top landing pages by session volume."""
        agg = self._aggregate_by_page().sort("total_sessions", descending=True).head(limit)
        return [self._row_to_insight(row) for row in agg.iter_rows(named=True)]

    def _get_low_engagement_pages(self) -> List[LandingPageInsight]:
        """Pages with engagement rate below threshold."""
        agg = self._aggregate_by_page()
        low = agg.filter(pl.col("engagement_rate") < self.low_engagement_threshold)
        return [
            self._row_to_insight(row, signal="low_engagement")
            for row in low.sort("total_sessions", descending=True).iter_rows(named=True)
        ]

    def _get_low_key_event_pages(self) -> List[LandingPageInsight]:
        """Pages with high sessions but zero or very low key events."""
        agg = self._aggregate_by_page()
        low = agg.filter(pl.col("key_event_rate") < 0.01)
        return [
            self._row_to_insight(row, signal="low_key_events")
            for row in low.sort("total_sessions", descending=True).iter_rows(named=True)
        ]

    def _get_paid_engagement_gaps(self) -> List[PaidVsEngagementInsight]:
        """Pages where paid traffic engagement is notably worse than organic."""
        if "channel_group" not in self.df.columns:
            return []

        paid = self.df.filter(pl.col("channel_group").is_in(list(PAID_CHANNELS)))
        organic = self.df.filter(pl.col("channel_group") == "Organic Search")

        if paid.is_empty():
            return []

        paid_agg = (
            paid.group_by("landing_page")
            .agg(
                pl.col("sessions").sum().alias("paid_sessions"),
                pl.col("engaged_sessions").sum().alias("paid_engaged"),
                pl.col("bounce_rate")
                .mean()
                .alias("paid_bounce_rate"),
            )
            .with_columns(
                (pl.col("paid_engaged") / pl.col("paid_sessions")).alias(
                    "paid_engagement_rate"
                ),
            )
            .filter(pl.col("paid_sessions") >= self.min_sessions)
        )

        if organic.is_empty():
            # No organic baseline — flag paid pages with low engagement
            return [
                PaidVsEngagementInsight(
                    landing_page=row["landing_page"],
                    paid_sessions=row["paid_sessions"],
                    paid_engagement_rate=row["paid_engagement_rate"],
                    paid_bounce_rate=row["paid_bounce_rate"],
                    organic_engagement_rate=None,
                    gap=0.0,
                )
                for row in paid_agg.filter(
                    pl.col("paid_engagement_rate") < self.low_engagement_threshold
                )
                .sort("paid_sessions", descending=True)
                .iter_rows(named=True)
            ]

        organic_agg = (
            organic.group_by("landing_page")
            .agg(
                pl.col("sessions").sum().alias("organic_sessions"),
                pl.col("engaged_sessions").sum().alias("organic_engaged"),
            )
            .with_columns(
                (pl.col("organic_engaged") / pl.col("organic_sessions")).alias(
                    "organic_engagement_rate"
                ),
            )
        )

        joined = paid_agg.join(organic_agg, on="landing_page", how="left")

        insights = []
        for row in joined.iter_rows(named=True):
            organic_rate = row.get("organic_engagement_rate")
            paid_rate = row["paid_engagement_rate"]
            gap = (organic_rate - paid_rate) if organic_rate else 0.0
            if gap > 0.15 or (
                organic_rate is None
                and paid_rate < self.low_engagement_threshold
            ):
                insights.append(
                    PaidVsEngagementInsight(
                        landing_page=row["landing_page"],
                        paid_sessions=row["paid_sessions"],
                        paid_engagement_rate=paid_rate,
                        paid_bounce_rate=row["paid_bounce_rate"],
                        organic_engagement_rate=organic_rate,
                        gap=gap,
                    )
                )
        insights.sort(key=lambda x: x.paid_sessions, reverse=True)
        return insights

    def _compute_summary(self) -> Dict[str, Any]:
        """Aggregate summary stats for the GA4 data."""
        total_sessions = int(self.df["sessions"].sum())
        total_engaged = int(self.df["engaged_sessions"].sum())
        total_key_events = float(self.df["key_events"].sum())
        return {
            "total_sessions": total_sessions,
            "total_engaged_sessions": total_engaged,
            "total_key_events": round(total_key_events, 4),
            "overall_engagement_rate": (
                round(total_engaged / total_sessions, 4)
                if total_sessions > 0
                else 0.0
            ),
            "overall_key_event_rate": (
                round(total_key_events / total_sessions, 4)
                if total_sessions > 0
                else 0.0
            ),
        }

    def _row_to_insight(
        self, row: dict, signal: str = "healthy"
    ) -> LandingPageInsight:
        """Convert an aggregated row to a LandingPageInsight."""
        # Get top channels for this page
        page_channels = (
            self.df.filter(pl.col("landing_page") == row["landing_page"])
            .group_by("channel_group")
            .agg(pl.col("sessions").sum())
            .sort("sessions", descending=True)
        )
        top_channels = page_channels["channel_group"].head(3).to_list()

        return LandingPageInsight(
            landing_page=row["landing_page"],
            sessions=row["total_sessions"],
            engagement_rate=round(row["engagement_rate"], 4),
            bounce_rate=round(row["avg_bounce_rate"], 4),
            key_events=round(float(row["total_key_events"]), 4),
            key_event_rate=round(row["key_event_rate"], 4),
            top_channels=top_channels,
            signal=signal,
        )
