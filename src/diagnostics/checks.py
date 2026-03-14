"""Diagnostic check implementations."""
import logging
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional

from ..models import (
    DiagnosticCheckConfig,
    Diagnosis,
    EvidenceResult,
)
from .evidence import EvidenceEvaluator

logger = logging.getLogger(__name__)


class DiagnosticCheck(ABC):
    """Base class for diagnostic checks."""

    def __init__(self, evaluator: Optional[EvidenceEvaluator] = None):
        self.evaluator = evaluator or EvidenceEvaluator()

    @abstractmethod
    def evaluate(
        self,
        data: Dict[str, Any],
        config: DiagnosticCheckConfig,
    ) -> Optional[Diagnosis]:
        """Evaluate this check against the provided data."""
        pass

    def _prepare_data(self, data: Dict[str, Any], config: DiagnosticCheckConfig) -> Dict[str, Any]:
        """Prepare data for evaluation. Override in subclasses for custom data preparation."""
        return data

    def _build_diagnosis(
        self,
        config: DiagnosticCheckConfig,
        evidence_results: List[EvidenceResult],
        data: Dict[str, Any],
    ) -> Optional[Diagnosis]:
        """Build a Diagnosis from evidence results."""
        # Calculate confidence
        confidence_score, confidence_level = self.evaluator.calculate_confidence(evidence_results)

        # Determine if check is confirmed
        confirmed = any(r.passed for r in evidence_results) and confidence_score >= 0.3

        if not confirmed:
            return None

        # Extract affected items from data
        affected_campaigns = data.get("affected_campaigns", [])
        affected_keywords = data.get("affected_keywords", [])

        # Estimate impact
        metric_change = data.get("metric_change_absolute", 0.0)
        estimated_impact = self.evaluator.estimate_impact(
            evidence_results, metric_change, data
        )

        # Determine impact direction
        impact_direction = "increased" if metric_change > 0 else "decreased"

        return Diagnosis(
            check_id=config.check_id,
            check_name=config.name,
            confirmed=confirmed,
            confidence=confidence_level,
            confidence_score=confidence_score,
            evidence=evidence_results,
            estimated_impact=abs(estimated_impact),
            impact_direction=impact_direction,
            affected_campaigns=affected_campaigns[:10],  # Limit to top 10
            affected_keywords=affected_keywords[:10],
        )


class CompetitionCheck(DiagnosticCheck):
    """Check for increased auction competition."""

    def evaluate(
        self,
        data: Dict[str, Any],
        config: DiagnosticCheckConfig,
    ) -> Optional[Diagnosis]:
        """Evaluate competition changes."""
        # Prepare competition-specific data
        prepared_data = self._prepare_competition_data(data)

        # Evaluate evidence rules
        evidence_results = self.evaluator.evaluate_rules(
            config.evidence_rules, prepared_data
        )

        return self._build_diagnosis(config, evidence_results, prepared_data)

    def _prepare_competition_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare competition-specific metrics."""
        result = dict(data)

        # Calculate IS lost to rank change
        is_lost_rank_current = data.get("impression_share_lost_rank_current", 0.0)
        is_lost_rank_previous = data.get("impression_share_lost_rank_previous", 0.0)
        result["impression_share_lost_rank"] = is_lost_rank_current - is_lost_rank_previous

        # Calculate CPC change percentage
        cpc_current = data.get("avg_cpc_current", 0.0)
        cpc_previous = data.get("avg_cpc_previous", 0.0)
        if cpc_previous > 0:
            result["avg_cpc"] = ((cpc_current - cpc_previous) / cpc_previous) * 100
        else:
            result["avg_cpc"] = 0.0

        # Calculate absolute top IS change
        top_is_current = data.get("absolute_top_is_current", 0.0)
        top_is_previous = data.get("absolute_top_is_previous", 0.0)
        result["absolute_top_is"] = top_is_current - top_is_previous

        return result


class QualityScoreCheck(DiagnosticCheck):
    """Check for quality score degradation."""

    def evaluate(
        self,
        data: Dict[str, Any],
        config: DiagnosticCheckConfig,
    ) -> Optional[Diagnosis]:
        """Evaluate quality score changes."""
        prepared_data = self._prepare_qs_data(data)

        evidence_results = self.evaluator.evaluate_rules(
            config.evidence_rules, prepared_data
        )

        return self._build_diagnosis(config, evidence_results, prepared_data)

    def _prepare_qs_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare QS-specific metrics."""
        result = dict(data)

        # Calculate average QS change
        avg_qs_current = data.get("avg_quality_score_current", 0.0)
        avg_qs_previous = data.get("avg_quality_score_previous", 0.0)
        result["avg_quality_score"] = avg_qs_current - avg_qs_previous

        # Count keywords below QS 5 change
        below_5_current = data.get("keywords_below_qs5_current", 0)
        below_5_previous = data.get("keywords_below_qs5_previous", 0)
        result["keywords_below_qs5"] = below_5_current - below_5_previous

        # Landing page experience change
        lp_below_avg_current = data.get("landing_page_exp_below_avg_current", 0)
        lp_below_avg_previous = data.get("landing_page_exp_below_avg_previous", 0)
        result["landing_page_exp_below_avg"] = lp_below_avg_current - lp_below_avg_previous

        return result


class SearchTermQualityCheck(DiagnosticCheck):
    """Check for search term quality decline."""

    def evaluate(
        self,
        data: Dict[str, Any],
        config: DiagnosticCheckConfig,
    ) -> Optional[Diagnosis]:
        """Evaluate search term quality."""
        prepared_data = self._prepare_search_term_data(data)

        evidence_results = self.evaluator.evaluate_rules(
            config.evidence_rules, prepared_data
        )

        return self._build_diagnosis(config, evidence_results, prepared_data)

    def _prepare_search_term_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare search term quality metrics."""
        result = dict(data)

        # Junk ratio change (spend on zero-conversion terms)
        junk_ratio_current = data.get("junk_ratio_current", 0.0)
        junk_ratio_previous = data.get("junk_ratio_previous", 0.0)
        result["junk_ratio"] = junk_ratio_current - junk_ratio_previous

        # Average search term CPL change
        st_cpl_current = data.get("avg_search_term_cpl_current", 0.0)
        st_cpl_previous = data.get("avg_search_term_cpl_previous", 0.0)
        if st_cpl_previous > 0:
            result["avg_search_term_cpl"] = ((st_cpl_current - st_cpl_previous) / st_cpl_previous) * 100
        else:
            result["avg_search_term_cpl"] = 0.0

        # Zero-conversion spend percentage change
        zero_conv_current = data.get("zero_conv_spend_pct_current", 0.0)
        zero_conv_previous = data.get("zero_conv_spend_pct_previous", 0.0)
        result["zero_conv_spend_pct"] = zero_conv_current - zero_conv_previous

        return result


class CompositionShiftCheck(DiagnosticCheck):
    """Check for traffic composition shifts."""

    def evaluate(
        self,
        data: Dict[str, Any],
        config: DiagnosticCheckConfig,
    ) -> Optional[Diagnosis]:
        """Evaluate composition shifts across dimensions."""
        prepared_data = self._prepare_composition_data(data, config)

        evidence_results = self.evaluator.evaluate_rules(
            config.evidence_rules, prepared_data
        )

        diagnosis = self._build_diagnosis(config, evidence_results, prepared_data)

        # Enhance diagnosis with dimension-specific info
        if diagnosis and diagnosis.confirmed:
            shifts = data.get("composition_shifts", [])
            if shifts:
                # Add shift details to affected campaigns
                shift_details = [
                    f"{s.get('dimension_type', 'unknown')}: {s.get('dimension_value', 'unknown')} "
                    f"({s.get('shift_magnitude', 0):.1f}pts)"
                    for s in shifts[:5]
                ]
                diagnosis.affected_campaigns = shift_details

        return diagnosis

    def _prepare_composition_data(
        self,
        data: Dict[str, Any],
        config: DiagnosticCheckConfig,
    ) -> Dict[str, Any]:
        """Prepare composition shift metrics."""
        result = dict(data)

        # Get the maximum shift magnitude across all dimensions
        shifts = data.get("composition_shifts", [])
        if shifts:
            max_shift = max(
                abs(s.get("shift_magnitude", 0.0)) for s in shifts
            )
            result["dimension_shift_magnitude"] = max_shift
        else:
            result["dimension_shift_magnitude"] = 0.0

        # Check configured dimensions
        dimensions = config.dimensions or ["device", "geo", "hour"]
        dimension_shifts = {}
        for shift in shifts:
            dim_type = shift.get("dimension_type", "")
            if dim_type in dimensions:
                if dim_type not in dimension_shifts:
                    dimension_shifts[dim_type] = []
                dimension_shifts[dim_type].append(shift)

        result["dimension_shifts"] = dimension_shifts

        return result


# Check registry for easy lookup
CHECK_REGISTRY: Dict[str, type] = {
    "competition": CompetitionCheck,
    "quality_score": QualityScoreCheck,
    "search_term_quality": SearchTermQualityCheck,
    "composition_shift": CompositionShiftCheck,
}


def create_check(check_id: str, evaluator: Optional[EvidenceEvaluator] = None) -> Optional[DiagnosticCheck]:
    """Factory function to create a check instance."""
    check_class = CHECK_REGISTRY.get(check_id)
    if check_class:
        return check_class(evaluator)
    return None


def get_all_checks(evaluator: Optional[EvidenceEvaluator] = None) -> Dict[str, DiagnosticCheck]:
    """Get instances of all registered checks."""
    return {
        check_id: check_class(evaluator)
        for check_id, check_class in CHECK_REGISTRY.items()
    }
