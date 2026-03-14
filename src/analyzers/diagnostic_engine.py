"""Diagnostic engine for root cause investigation."""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional

import polars as pl

from ..models import (
    Investigation,
    Diagnosis,
    Recommendation,
    DiagnosticCheckConfig,
    CompositionShift,
)
from ..diagnostics.tree import DiagnosticTree
from ..diagnostics.checks import get_all_checks, DiagnosticCheck
from ..diagnostics.evidence import EvidenceEvaluator
from ..diagnostics.recommendations import RecommendationGenerator

logger = logging.getLogger(__name__)


class DiagnosticEngine:
    """Orchestrates root cause investigation for metric changes."""

    def __init__(self, config_path: str = "config/diagnostic_tree.yaml"):
        self.tree = DiagnosticTree(config_path)
        self.evaluator = EvidenceEvaluator()
        self.recommendation_generator = RecommendationGenerator()
        self._check_instances: Dict[str, DiagnosticCheck] = {}

    def initialize(self) -> bool:
        """Initialize the diagnostic engine by loading configuration."""
        if not self.tree.load():
            logger.error("Failed to load diagnostic tree configuration")
            return False

        # Initialize all check instances
        self.evaluator = EvidenceEvaluator(self.tree.thresholds)
        self._check_instances = get_all_checks(self.evaluator)

        logger.info("Diagnostic engine initialized successfully")
        return True

    def investigate_metric(
        self,
        metric_id: str,
        current_value: float,
        previous_value: float,
        data: Dict[str, Any],
        period_current: str = "",
        period_previous: str = "",
    ) -> Investigation:
        """Investigate a metric change and generate diagnoses."""
        # Calculate change
        if previous_value == 0:
            change_pct = 0.0 if current_value == 0 else 1.0
        else:
            change_pct = (current_value - previous_value) / previous_value

        change_absolute = current_value - previous_value

        # Get metric configuration
        threshold = self.tree.get_change_threshold(metric_id)
        metric_name = self._get_metric_name(metric_id)

        # Check if investigation is triggered
        triggered = abs(change_pct) >= threshold

        # Create base investigation
        investigation = Investigation(
            metric=metric_id,
            metric_name=metric_name,
            previous_value=previous_value,
            current_value=current_value,
            change_pct=change_pct * 100,  # Convert to percentage
            change_absolute=change_absolute,
            triggered=triggered,
            threshold=threshold * 100,  # Convert to percentage
            period_current=period_current,
            period_previous=period_previous,
            timestamp=datetime.now(),
        )

        if not triggered:
            logger.info(
                f"Metric {metric_id} change ({change_pct*100:.1f}%) below threshold "
                f"({threshold*100:.1f}%) - no investigation triggered"
            )
            return investigation

        # Prepare investigation data
        investigation_data = self._prepare_investigation_data(
            metric_id, current_value, previous_value, change_absolute, data
        )

        # Execute diagnostic checks
        diagnoses = self._run_diagnostic_checks(metric_id, investigation_data)
        investigation.diagnoses = diagnoses

        # Generate recommendations
        recommendations = self._generate_recommendations(
            diagnoses, metric_id
        )
        investigation.recommendations = recommendations

        # Calculate attribution accuracy
        total_attributed = sum(d.estimated_impact for d in diagnoses if d.confirmed)
        if abs(change_absolute) > 0:
            investigation.attribution_accuracy = min(
                1.0, abs(total_attributed) / abs(change_absolute)
            )
        investigation.total_attributed_impact = total_attributed

        logger.info(
            f"Investigation complete for {metric_id}: "
            f"{len(diagnoses)} diagnoses, {len(recommendations)} recommendations"
        )

        return investigation

    def _get_metric_name(self, metric_id: str) -> str:
        """Get human-readable metric name."""
        names = {
            "cpl": "Cost Per Lead",
            "cvr": "Conversion Rate",
            "volume": "Lead Volume",
            "cpc": "Cost Per Click",
        }
        return names.get(metric_id, metric_id.upper())

    def _prepare_investigation_data(
        self,
        metric_id: str,
        current_value: float,
        previous_value: float,
        change_absolute: float,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Prepare data for diagnostic checks."""
        investigation_data = dict(data)
        investigation_data.update({
            "metric_id": metric_id,
            "metric_current": current_value,
            "metric_previous": previous_value,
            "metric_change_absolute": change_absolute,
            "metric_change_pct": (
                (change_absolute / previous_value) * 100
                if previous_value != 0 else 0
            ),
        })
        return investigation_data

    def _run_diagnostic_checks(
        self,
        metric_id: str,
        data: Dict[str, Any],
    ) -> List[Diagnosis]:
        """Run all diagnostic checks for a metric."""
        diagnoses = []
        check_ids = self.tree.get_checks_for_metric(metric_id)

        for check_id in check_ids:
            check_config = self.tree.get_check_config(check_id)
            if not check_config:
                logger.warning(f"No config found for check: {check_id}")
                continue

            check = self._check_instances.get(check_id)
            if not check:
                logger.warning(f"No check implementation for: {check_id}")
                continue

            try:
                diagnosis = check.evaluate(data, check_config)
                if diagnosis and diagnosis.confirmed:
                    diagnoses.append(diagnosis)
                    logger.debug(
                        f"Check {check_id} confirmed with "
                        f"{diagnosis.confidence} confidence"
                    )
            except Exception as e:
                logger.error(f"Error running check {check_id}: {e}")

        return diagnoses

    def _generate_recommendations(
        self,
        diagnoses: List[Diagnosis],
        metric_id: str,
    ) -> List[Recommendation]:
        """Generate recommendations from diagnoses."""
        check_configs = {
            d.check_id: self.tree.get_check_config(d.check_id)
            for d in diagnoses
            if d.confirmed
        }

        # Filter out None configs
        check_configs = {k: v for k, v in check_configs.items() if v}

        return self.recommendation_generator.generate_all_recommendations(
            diagnoses, check_configs, metric_id
        )

    def detect_metric_changes(
        self,
        current_df: pl.DataFrame,
        previous_df: pl.DataFrame,
        currency: str = "USD",
    ) -> Dict[str, Dict[str, float]]:
        """Detect changes in key metrics between periods."""
        metrics = {}

        # Calculate CPL
        current_spend = self._safe_sum(current_df, "spend")
        current_leads = self._safe_sum(current_df, "conversions_primary")
        previous_spend = self._safe_sum(previous_df, "spend")
        previous_leads = self._safe_sum(previous_df, "conversions_primary")

        current_cpl = current_spend / current_leads if current_leads > 0 else 0
        previous_cpl = previous_spend / previous_leads if previous_leads > 0 else 0

        metrics["cpl"] = {
            "current": current_cpl,
            "previous": previous_cpl,
        }

        # Calculate CVR
        current_clicks = self._safe_sum(current_df, "clicks")
        previous_clicks = self._safe_sum(previous_df, "clicks")

        current_cvr = (current_leads / current_clicks * 100) if current_clicks > 0 else 0
        previous_cvr = (previous_leads / previous_clicks * 100) if previous_clicks > 0 else 0

        metrics["cvr"] = {
            "current": current_cvr,
            "previous": previous_cvr,
        }

        # Calculate volume
        metrics["volume"] = {
            "current": current_leads,
            "previous": previous_leads,
        }

        return metrics

    def _safe_sum(self, df: pl.DataFrame, column: str) -> float:
        """Safely sum a column."""
        if df.is_empty() or column not in df.columns:
            return 0.0
        return float(df[column].fill_null(0).sum())

    def prepare_diagnostic_data(
        self,
        campaigns_current: pl.DataFrame,
        campaigns_previous: pl.DataFrame,
        impression_share_current: pl.DataFrame,
        impression_share_previous: pl.DataFrame,
        quality_scores_current: pl.DataFrame,
        quality_scores_previous: pl.DataFrame,
        search_terms_current: pl.DataFrame,
        search_terms_previous: pl.DataFrame,
        composition_shifts: Optional[List[CompositionShift]] = None,
    ) -> Dict[str, Any]:
        """Prepare all diagnostic data from analyzer outputs."""
        data = {}

        # Impression share data
        data.update(self._extract_impression_share_data(
            impression_share_current, impression_share_previous
        ))

        # Quality score data
        data.update(self._extract_quality_score_data(
            quality_scores_current, quality_scores_previous
        ))

        # Search term data
        data.update(self._extract_search_term_data(
            search_terms_current, search_terms_previous
        ))

        # CPC data from campaigns
        data.update(self._extract_cpc_data(
            campaigns_current, campaigns_previous
        ))

        # Composition shifts
        if composition_shifts:
            data["composition_shifts"] = [
                {
                    "dimension_type": s.dimension_type,
                    "dimension_value": s.dimension_value,
                    "shift_magnitude": s.shift_magnitude,
                    "direction": s.direction,
                }
                for s in composition_shifts
            ]
        else:
            data["composition_shifts"] = []

        return data

    def _extract_impression_share_data(
        self,
        current_df: pl.DataFrame,
        previous_df: pl.DataFrame,
    ) -> Dict[str, Any]:
        """Extract impression share metrics."""
        data = {}

        if not current_df.is_empty():
            data["impression_share_lost_rank_current"] = (
                current_df["search_rank_lost_is"].fill_null(0).mean()
                if "search_rank_lost_is" in current_df.columns else 0.0
            )
            data["absolute_top_is_current"] = (
                current_df["absolute_top_is"].fill_null(0).mean()
                if "absolute_top_is" in current_df.columns else 0.0
            )
        else:
            data["impression_share_lost_rank_current"] = 0.0
            data["absolute_top_is_current"] = 0.0

        if not previous_df.is_empty():
            data["impression_share_lost_rank_previous"] = (
                previous_df["search_rank_lost_is"].fill_null(0).mean()
                if "search_rank_lost_is" in previous_df.columns else 0.0
            )
            data["absolute_top_is_previous"] = (
                previous_df["absolute_top_is"].fill_null(0).mean()
                if "absolute_top_is" in previous_df.columns else 0.0
            )
        else:
            data["impression_share_lost_rank_previous"] = 0.0
            data["absolute_top_is_previous"] = 0.0

        return data

    def _extract_quality_score_data(
        self,
        current_df: pl.DataFrame,
        previous_df: pl.DataFrame,
    ) -> Dict[str, Any]:
        """Extract quality score metrics."""
        data = {}

        if not current_df.is_empty() and "quality_score" in current_df.columns:
            qs_valid = current_df.filter(pl.col("quality_score").is_not_null())
            data["avg_quality_score_current"] = (
                qs_valid["quality_score"].mean() if not qs_valid.is_empty() else 0.0
            )
            data["keywords_below_qs5_current"] = (
                qs_valid.filter(pl.col("quality_score") < 5).height
            )
            if "landing_page_exp" in current_df.columns:
                data["landing_page_exp_below_avg_current"] = (
                    current_df.filter(pl.col("landing_page_exp") == "BELOW_AVERAGE").height
                )
            else:
                data["landing_page_exp_below_avg_current"] = 0
        else:
            data["avg_quality_score_current"] = 0.0
            data["keywords_below_qs5_current"] = 0
            data["landing_page_exp_below_avg_current"] = 0

        if not previous_df.is_empty() and "quality_score" in previous_df.columns:
            qs_valid = previous_df.filter(pl.col("quality_score").is_not_null())
            data["avg_quality_score_previous"] = (
                qs_valid["quality_score"].mean() if not qs_valid.is_empty() else 0.0
            )
            data["keywords_below_qs5_previous"] = (
                qs_valid.filter(pl.col("quality_score") < 5).height
            )
            if "landing_page_exp" in previous_df.columns:
                data["landing_page_exp_below_avg_previous"] = (
                    previous_df.filter(pl.col("landing_page_exp") == "BELOW_AVERAGE").height
                )
            else:
                data["landing_page_exp_below_avg_previous"] = 0
        else:
            data["avg_quality_score_previous"] = 0.0
            data["keywords_below_qs5_previous"] = 0
            data["landing_page_exp_below_avg_previous"] = 0

        return data

    def _extract_search_term_data(
        self,
        current_df: pl.DataFrame,
        previous_df: pl.DataFrame,
    ) -> Dict[str, Any]:
        """Extract search term quality metrics."""
        data = {}

        # Current period
        if not current_df.is_empty():
            total_spend = current_df["cost"].fill_null(0).sum() if "cost" in current_df.columns else 0
            zero_conv_spend = (
                current_df.filter(pl.col("conversions") == 0)["cost"].fill_null(0).sum()
                if "conversions" in current_df.columns and "cost" in current_df.columns
                else 0
            )
            data["junk_ratio_current"] = (
                (zero_conv_spend / total_spend * 100) if total_spend > 0 else 0
            )
            data["zero_conv_spend_pct_current"] = data["junk_ratio_current"]

            # Average CPL for converting search terms
            converting_terms = current_df.filter(pl.col("conversions") > 0) if "conversions" in current_df.columns else pl.DataFrame()
            if not converting_terms.is_empty():
                st_spend = converting_terms["cost"].fill_null(0).sum() if "cost" in converting_terms.columns else 0
                st_conv = converting_terms["conversions"].fill_null(0).sum() if "conversions" in converting_terms.columns else 0
                data["avg_search_term_cpl_current"] = st_spend / st_conv if st_conv > 0 else 0
            else:
                data["avg_search_term_cpl_current"] = 0
        else:
            data["junk_ratio_current"] = 0
            data["zero_conv_spend_pct_current"] = 0
            data["avg_search_term_cpl_current"] = 0

        # Previous period
        if not previous_df.is_empty():
            total_spend = previous_df["cost"].fill_null(0).sum() if "cost" in previous_df.columns else 0
            zero_conv_spend = (
                previous_df.filter(pl.col("conversions") == 0)["cost"].fill_null(0).sum()
                if "conversions" in previous_df.columns and "cost" in previous_df.columns
                else 0
            )
            data["junk_ratio_previous"] = (
                (zero_conv_spend / total_spend * 100) if total_spend > 0 else 0
            )
            data["zero_conv_spend_pct_previous"] = data["junk_ratio_previous"]

            converting_terms = previous_df.filter(pl.col("conversions") > 0) if "conversions" in previous_df.columns else pl.DataFrame()
            if not converting_terms.is_empty():
                st_spend = converting_terms["cost"].fill_null(0).sum() if "cost" in converting_terms.columns else 0
                st_conv = converting_terms["conversions"].fill_null(0).sum() if "conversions" in converting_terms.columns else 0
                data["avg_search_term_cpl_previous"] = st_spend / st_conv if st_conv > 0 else 0
            else:
                data["avg_search_term_cpl_previous"] = 0
        else:
            data["junk_ratio_previous"] = 0
            data["zero_conv_spend_pct_previous"] = 0
            data["avg_search_term_cpl_previous"] = 0

        return data

    def _extract_cpc_data(
        self,
        current_df: pl.DataFrame,
        previous_df: pl.DataFrame,
    ) -> Dict[str, Any]:
        """Extract CPC metrics."""
        data = {}

        if not current_df.is_empty():
            spend = current_df["spend"].fill_null(0).sum() if "spend" in current_df.columns else 0
            clicks = current_df["clicks"].fill_null(0).sum() if "clicks" in current_df.columns else 0
            data["avg_cpc_current"] = spend / clicks if clicks > 0 else 0
        else:
            data["avg_cpc_current"] = 0

        if not previous_df.is_empty():
            spend = previous_df["spend"].fill_null(0).sum() if "spend" in previous_df.columns else 0
            clicks = previous_df["clicks"].fill_null(0).sum() if "clicks" in previous_df.columns else 0
            data["avg_cpc_previous"] = spend / clicks if clicks > 0 else 0
        else:
            data["avg_cpc_previous"] = 0

        return data
