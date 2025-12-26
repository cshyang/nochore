"""Search terms analyzer for negative keyword identification."""
import logging
from typing import List
import polars as pl

from ..data_models import NegativeKeywordRec, TopSearchTerm, MatchTypeBreakdown

logger = logging.getLogger(__name__)

class SearchTermsAnalyzer:
    """Analyzes search terms for actionable insights."""
    
    def __init__(self, search_terms_df: pl.DataFrame, 
                 neg_kw_spend_threshold: float = 50.0,
                 neg_kw_ctr_threshold: float = 0.5):
        self.df = search_terms_df
        if not self.df.is_empty():
            if "currency" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("UNKNOWN").alias("currency"))
            if "source_account_id" not in self.df.columns:
                self.df = self.df.with_columns(pl.lit("unknown").alias("source_account_id"))
        self.neg_kw_spend_threshold = neg_kw_spend_threshold
        self.neg_kw_ctr_threshold = neg_kw_ctr_threshold
    
    def get_negative_keyword_candidates(self) -> List[NegativeKeywordRec]:
        """Identify search terms suitable for negative keywords."""
        if self.df.is_empty():
            return []
        
        group_keys = ["source_account_id", "currency", "search_term", "campaign_name", "ad_group_name"]

        agg_df = self.df.group_by(group_keys).agg(
            pl.col("cost").sum().alias("total_cost"),
            pl.col("clicks").sum().alias("total_clicks"),
            pl.col("conversions").sum().alias("total_leads"),
            pl.col("impressions").sum().alias("total_impressions"),
        )
        
        # Calculate CTR
        agg_df = agg_df.with_columns(
            (pl.col("total_clicks") / pl.col("total_impressions") * 100).alias("ctr")
        )
        
        candidates = []
        
        # High priority: High spend, zero conversions
        high_priority = agg_df.filter(
            (pl.col("total_cost") > self.neg_kw_spend_threshold) & 
            (pl.col("total_leads") == 0)
        )
        
        for row in high_priority.iter_rows(named=True):
            candidates.append(NegativeKeywordRec(
                search_term=row["search_term"],
                campaign=row["campaign_name"],
                ad_group=row["ad_group_name"],
                currency=row["currency"],
                spend=row["total_cost"],
                clicks=row["total_clicks"],
                leads=row["total_leads"],
                reason="high_spend_no_conv",
                note="Review as potential negative keyword (exact match)"
            ))
        
        # Medium priority: Low CTR
        med_priority = agg_df.filter(
            (pl.col("ctr") < self.neg_kw_ctr_threshold) & 
            (pl.col("total_impressions") > 100) &
            (pl.col("total_leads") == 0)
        )
        
        for row in med_priority.iter_rows(named=True):
            if not any(c.search_term == row["search_term"] and c.currency == row["currency"] for c in candidates):
                candidates.append(NegativeKeywordRec(
                    search_term=row["search_term"],
                    campaign=row["campaign_name"],
                    ad_group=row["ad_group_name"],
                    currency=row["currency"],
                    spend=row["total_cost"],
                    clicks=row["total_clicks"],
                    leads=row["total_leads"],
                    reason="low_ctr",
                    note="Review for relevance / intent"
                ))
        
        logger.info(f"Identified {len(candidates)} negative keyword candidates")
        return candidates
    
    def get_top_performers(self, limit: int = 10) -> List[TopSearchTerm]:
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
