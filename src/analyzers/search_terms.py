"""Search terms analyzer for search term insights."""
import logging
from typing import Any, Dict, List
import polars as pl

from ..models import NegativeKeywordRec, TopSearchTerm, MatchTypeBreakdown

logger = logging.getLogger(__name__)

_SEARCH_TERM_GROUP_KEYS = [
    "source_alias",
    "source_account_id",
    "currency",
    "search_term",
    "campaign_name",
    "ad_group_name",
    "campaign_id",
    "ad_group_id",
]

# Cap on rows returned by summarize_search_terms to keep prompt size manageable.
_SUMMARY_VOLUME_LIMIT = 200


class SearchTermsAnalyzer:
    """Analyzes search terms for actionable insights."""

    def __init__(self, search_terms_df: pl.DataFrame):
        self.df = search_terms_df
        if not self.df.is_empty():
            if "currency" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("UNKNOWN").alias("currency"))
            if "source_account_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_account_id"))

    def summarize_search_terms(self) -> Dict[str, Any]:
        """Return all search terms with computed metrics -- no filtering.

        The LLM downstream decides which terms are wasteful, promising, etc.
        Results are sorted by spend descending and capped at _SUMMARY_VOLUME_LIMIT.
        """
        if self.df.is_empty():
            return {
                "terms": [],
                "total_terms": 0,
                "converting_terms": 0,
                "zero_conversion_terms": 0,
                "total_spend": 0.0,
                "zero_conversion_spend": 0.0,
            }

        if "source_alias" not in self.df.columns:
            self.df = self.df.with_columns(pl.lit("unknown").alias("source_alias"))

        agg_df = self.df.group_by(_SEARCH_TERM_GROUP_KEYS).agg(
            pl.col("cost").sum().alias("total_cost"),
            pl.col("clicks").sum().alias("total_clicks"),
            pl.col("conversions").sum().alias("total_conversions"),
            pl.col("impressions").sum().alias("total_impressions"),
        )

        agg_df = agg_df.with_columns(
            (pl.col("total_clicks") / pl.col("total_impressions") * 100).alias("ctr"),
            pl.when(pl.col("total_conversions") > 0)
            .then(pl.col("total_cost") / pl.col("total_conversions"))
            .otherwise(pl.lit(None))
            .alias("cpl"),
        )

        agg_df = agg_df.sort("total_cost", descending=True).head(_SUMMARY_VOLUME_LIMIT)

        total_terms = agg_df.height
        converting_mask = agg_df["total_conversions"] > 0
        converting_terms = converting_mask.sum()
        zero_conversion_terms = total_terms - converting_terms
        total_spend = float(agg_df["total_cost"].sum())
        zero_conversion_spend = float(
            agg_df.filter(~converting_mask)["total_cost"].sum()
        )

        terms = []
        for row in agg_df.iter_rows(named=True):
            terms.append({
                "search_term": row["search_term"],
                "campaign_name": row["campaign_name"],
                "ad_group_name": row["ad_group_name"],
                "campaign_id": row["campaign_id"],
                "ad_group_id": row["ad_group_id"],
                "source_alias": row["source_alias"],
                "source_account_id": row["source_account_id"],
                "currency": row["currency"],
                "cost": row["total_cost"],
                "clicks": row["total_clicks"],
                "impressions": row["total_impressions"],
                "conversions": row["total_conversions"],
                "ctr": row["ctr"],
                "cpl": row["cpl"],
            })

        return {
            "terms": terms,
            "total_terms": total_terms,
            "converting_terms": int(converting_terms),
            "zero_conversion_terms": int(zero_conversion_terms),
            "total_spend": total_spend,
            "zero_conversion_spend": zero_conversion_spend,
        }

    def get_negative_keyword_candidates(self) -> List[NegativeKeywordRec]:
        """Backward-compatible wrapper -- returns all zero-conversion terms.

        Deprecated: prefer summarize_search_terms() and let the LLM judge.
        """
        summary = self.summarize_search_terms()
        candidates = []
        for term in summary["terms"]:
            if term["conversions"] > 0:
                continue
            candidates.append(NegativeKeywordRec(
                search_term=term["search_term"],
                campaign=term["campaign_name"],
                ad_group=term["ad_group_name"],
                currency=term["currency"],
                spend=term["cost"],
                clicks=term["clicks"],
                leads=term["conversions"],
                reason="zero_conversions",
                note="Zero-conversion term (LLM should evaluate)",
                source_alias=term["source_alias"],
                source_account_id=term["source_account_id"],
                campaign_id=term["campaign_id"],
                ad_group_id=term["ad_group_id"],
                match_type="EXACT",
            ))
        logger.info(f"Identified {len(candidates)} negative keyword candidates")
        return candidates

    def get_top_performers(self, limit: int) -> List[TopSearchTerm]:
        """Identify high-performing search terms for lead generation."""
        if self.df.is_empty():
            return []
        
        group_keys = ["source_account_id", "currency", "search_term", "campaign_name"]
        agg_df = self.df.group_by(group_keys).agg(
            pl.col("cost").sum().alias("total_cost"),
            pl.col("conversions").sum().alias("total_leads"),
            pl.col("clicks").sum().alias("total_clicks"),
        )
        
        # Filter to terms with conversions
        agg_df = agg_df.filter(pl.col("total_leads") > 0)
        
        # Calculate conversion rate
        agg_df = agg_df.with_columns(
            (pl.col("total_leads") / pl.col("total_clicks") * 100).alias("conv_rate"),
            (pl.col("total_cost") / pl.col("total_leads")).alias("cpl"),
        )
        
        # Prefer lower CPL with some volume
        agg_df = agg_df.sort(["cpl", "total_leads"], descending=[False, True]).head(limit)
        
        top_performers = []
        for row in agg_df.iter_rows(named=True):
            clicks = float(row["total_clicks"] or 0)
            leads = float(row["total_leads"] or 0)
            spend = float(row["total_cost"] or 0)
            cvr = (leads / clicks * 100) if clicks > 0 else None
            cpl = (spend / leads) if leads > 0 else None
            top_performers.append(TopSearchTerm(
                search_term=row["search_term"],
                campaign=row["campaign_name"],
                currency=row["currency"],
                spend=spend,
                clicks=int(clicks),
                leads=leads,
                cpl=cpl,
                cvr=cvr,
                note="High-intent term (review for keyword expansion)"
            ))
        
        return top_performers
    
    def get_match_type_distribution(self) -> List[MatchTypeBreakdown]:
        """Analyze spend/conversion distribution by match type."""
        if self.df.is_empty():
            return []

        # Aggregate by match type
        agg_df = self.df.group_by("match_type").agg([
            pl.col("cost").sum().alias("total_cost"),
            pl.col("conversions").sum().alias("total_leads")
        ])

        total_cost = agg_df["total_cost"].sum()
        total_leads = agg_df["total_leads"].sum()

        breakdown = []
        for row in agg_df.iter_rows(named=True):
            spend_pct = (row["total_cost"] / total_cost * 100) if total_cost > 0 else 0
            conv_pct = (row["total_leads"] / total_leads * 100) if total_leads > 0 else 0
            efficiency = conv_pct / spend_pct if spend_pct > 0 else 0

            breakdown.append(MatchTypeBreakdown(
                match_type=row["match_type"],
                spend_pct=spend_pct,
                conversion_pct=conv_pct,
                efficiency_ratio=efficiency
            ))

        return breakdown

    def track_term_trends(
        self,
        previous_df: pl.DataFrame,
    ) -> List[Dict[str, Any]]:
        """Track search term performance trends between periods."""
        if self.df.is_empty():
            return []

        trends = []

        # Aggregate current period
        current_agg = self._aggregate_terms(self.df)

        # Aggregate previous period
        if not previous_df.is_empty():
            previous_agg = self._aggregate_terms(previous_df)
        else:
            previous_agg = {}

        # Compare terms
        for term, current_data in current_agg.items():
            previous_data = previous_agg.get(term, {})

            # Calculate trend
            current_conv = current_data.get("conversions", 0)
            previous_conv = previous_data.get("conversions", 0)

            if previous_conv > 0:
                conv_change = ((current_conv - previous_conv) / previous_conv) * 100
                if conv_change > 20:
                    trend = "growing"
                elif conv_change < -20:
                    trend = "declining"
                else:
                    trend = "stable"
            elif current_conv > 0:
                trend = "emerging"
            else:
                trend = "stable"

            trends.append({
                "search_term": term,
                "campaign": current_data.get("campaign", ""),
                "currency": current_data.get("currency", "USD"),
                "current_spend": current_data.get("spend", 0),
                "current_conversions": current_conv,
                "previous_conversions": previous_conv,
                "trend": trend,
                "is_emerging": term not in previous_agg and current_conv > 0,
            })

        # Sort by current spend descending
        trends.sort(key=lambda t: t["current_spend"], reverse=True)

        return trends

    def _aggregate_terms(self, df: pl.DataFrame) -> Dict[str, Dict[str, Any]]:
        """Aggregate search term data."""
        if df.is_empty():
            return {}

        group_keys = ["search_term"]
        agg_df = df.group_by(group_keys).agg([
            pl.col("cost").sum().alias("spend"),
            pl.col("conversions").sum().alias("conversions"),
            pl.col("clicks").sum().alias("clicks"),
            pl.col("campaign_name").first().alias("campaign"),
            pl.col("currency").first().alias("currency"),
        ])

        result = {}
        for row in agg_df.iter_rows(named=True):
            result[row["search_term"]] = {
                "spend": row["spend"],
                "conversions": row["conversions"],
                "clicks": row["clicks"],
                "campaign": row["campaign"],
                "currency": row["currency"],
            }

        return result

    def detect_emerging_terms(
        self,
        previous_df: pl.DataFrame,
        min_conversions: int = 1,
    ) -> List[Dict[str, Any]]:
        """Find new search terms that appeared this period with conversions."""
        if self.df.is_empty():
            return []

        current_terms = set(self.df["search_term"].unique().to_list())

        if not previous_df.is_empty():
            previous_terms = set(previous_df["search_term"].unique().to_list())
        else:
            previous_terms = set()

        # New terms
        new_terms = current_terms - previous_terms

        # Filter to converting terms
        if "conversions" in self.df.columns:
            converting_df = self.df.filter(
                (pl.col("search_term").is_in(list(new_terms))) &
                (pl.col("conversions") >= min_conversions)
            )
        else:
            converting_df = pl.DataFrame()

        emerging = []
        if not converting_df.is_empty():
            agg_df = converting_df.group_by("search_term").agg([
                pl.col("cost").sum().alias("spend"),
                pl.col("conversions").sum().alias("conversions"),
                pl.col("clicks").sum().alias("clicks"),
                pl.col("campaign_name").first().alias("campaign"),
                pl.col("currency").first().alias("currency"),
            ]).sort("conversions", descending=True)

            for row in agg_df.iter_rows(named=True):
                spend = row["spend"]
                conversions = row["conversions"]
                emerging.append({
                    "search_term": row["search_term"],
                    "campaign": row["campaign"],
                    "currency": row["currency"],
                    "spend": spend,
                    "conversions": conversions,
                    "clicks": row["clicks"],
                    "cpl": spend / conversions if conversions > 0 else None,
                })

        return emerging

    def calculate_junk_ratio(self) -> Dict[str, Any]:
        """Calculate ratio of spend on zero-conversion search terms."""
        if self.df.is_empty():
            return {"junk_ratio": 0.0, "junk_spend": 0.0, "total_spend": 0.0}

        total_spend = self.df["cost"].fill_null(0).sum()

        if "conversions" in self.df.columns:
            zero_conv_df = self.df.filter(pl.col("conversions") == 0)
            junk_spend = zero_conv_df["cost"].fill_null(0).sum()
        else:
            junk_spend = 0

        junk_ratio = (junk_spend / total_spend * 100) if total_spend > 0 else 0

        return {
            "junk_ratio": junk_ratio,
            "junk_spend": junk_spend,
            "total_spend": total_spend,
        }

    def compare_junk_ratio(
        self,
        previous_df: pl.DataFrame,
    ) -> Dict[str, Any]:
        """Compare junk ratio between periods."""
        current_junk = self.calculate_junk_ratio()

        if not previous_df.is_empty():
            prev_analyzer = SearchTermsAnalyzer(previous_df)
            previous_junk = prev_analyzer.calculate_junk_ratio()
        else:
            previous_junk = {"junk_ratio": 0.0, "junk_spend": 0.0, "total_spend": 0.0}

        change = current_junk["junk_ratio"] - previous_junk["junk_ratio"]
        status = "improved" if change < -2 else "worsened" if change > 2 else "stable"

        return {
            "current_junk_ratio": current_junk["junk_ratio"],
            "previous_junk_ratio": previous_junk["junk_ratio"],
            "change": change,
            "status": status,
            "current_junk_spend": current_junk["junk_spend"],
            "previous_junk_spend": previous_junk["junk_spend"],
        }
