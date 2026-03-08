"""Evidence evaluation for diagnostic checks."""
import logging
import re
from typing import Dict, Any, List, Optional, Tuple

from ..data_models import (
    EvidenceRule,
    EvidenceResult,
    ThresholdConfig,
)

logger = logging.getLogger(__name__)


class EvidenceEvaluator:
    """Evaluates evidence rules against data."""

    def __init__(self, thresholds: Optional[ThresholdConfig] = None):
        self.thresholds = thresholds or ThresholdConfig(
            min_data_points=7,
            significance_level=0.7,
            anomaly_z_score=2.0,
            composition_shift_threshold=0.15,
            confidence_high=0.85,
            confidence_medium=0.50,
        )

    def evaluate_rules(
        self,
        rules: List[EvidenceRule],
        data: Dict[str, Any],
    ) -> List[EvidenceResult]:
        """Evaluate a list of evidence rules against data."""
        results = []
        for rule in rules:
            result = self.evaluate_rule(rule, data)
            results.append(result)
        return results

    def evaluate_rule(
        self,
        rule: EvidenceRule,
        data: Dict[str, Any],
    ) -> EvidenceResult:
        """Evaluate a single evidence rule."""
        metric = rule.metric
        condition = rule.condition

        # Get the actual value from data
        actual_value = self._get_metric_value(metric, data)

        # Parse and evaluate the condition
        passed, expected = self._evaluate_condition(condition, actual_value, data)

        return EvidenceResult(
            metric=metric,
            condition=condition,
            expected=expected,
            actual_value=actual_value,
            passed=passed,
            weight=rule.weight,
        )

    def calculate_confidence(self, results: List[EvidenceResult]) -> Tuple[float, str]:
        """Calculate confidence score from evidence results."""
        if not results:
            return 0.0, "low"

        total_weight = sum(r.weight for r in results)
        if total_weight == 0:
            return 0.0, "low"

        weighted_score = sum(r.weight for r in results if r.passed)
        confidence_score = weighted_score / total_weight

        # Determine confidence level
        if confidence_score >= self.thresholds.confidence_high:
            confidence_level = "high"
        elif confidence_score >= self.thresholds.confidence_medium:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        return confidence_score, confidence_level

    def _get_metric_value(self, metric: str, data: Dict[str, Any]) -> float:
        """Extract a metric value from the data dictionary."""
        # Handle nested keys with dot notation
        if "." in metric:
            parts = metric.split(".")
            value = data
            for part in parts:
                if isinstance(value, dict):
                    value = value.get(part, 0.0)
                else:
                    return 0.0
            return float(value) if value is not None else 0.0

        # Direct key access
        value = data.get(metric, 0.0)
        return float(value) if value is not None else 0.0

    def _evaluate_condition(
        self,
        condition: str,
        actual_value: float,
        data: Dict[str, Any],
    ) -> Tuple[bool, str]:
        """Parse and evaluate a condition string."""
        condition = condition.strip().lower()

        # Pattern: "increased > 10%"
        match = re.match(r"(increased|decreased)\s*>\s*([\d.]+)(%|pts)?", condition)
        if match:
            direction = match.group(1)
            threshold_value = float(match.group(2))
            unit = match.group(3) or "%"

            # For percentage conditions, actual_value should be a change percentage
            if unit == "%":
                expected = f"{direction} by more than {threshold_value}%"
                if direction == "increased":
                    passed = actual_value > threshold_value
                else:
                    passed = actual_value < -threshold_value
            else:
                # Points condition
                expected = f"{direction} by more than {threshold_value} pts"
                if direction == "increased":
                    passed = actual_value > threshold_value
                else:
                    passed = actual_value < -threshold_value

            return passed, expected

        # Pattern: "> 15pts" (simple comparison)
        match = re.match(r">\s*([\d.]+)(pts|%)?", condition)
        if match:
            threshold_value = float(match.group(1))
            unit = match.group(2) or ""
            expected = f"greater than {threshold_value}{unit}"
            passed = actual_value > threshold_value
            return passed, expected

        # Pattern: "< 50%"
        match = re.match(r"<\s*([\d.]+)(pts|%)?", condition)
        if match:
            threshold_value = float(match.group(1))
            unit = match.group(2) or ""
            expected = f"less than {threshold_value}{unit}"
            passed = actual_value < threshold_value
            return passed, expected

        # Pattern: ">= 90%"
        match = re.match(r">=\s*([\d.]+)(pts|%)?", condition)
        if match:
            threshold_value = float(match.group(1))
            unit = match.group(2) or ""
            expected = f"at least {threshold_value}{unit}"
            passed = actual_value >= threshold_value
            return passed, expected

        # Simple "increased" or "decreased"
        if condition == "increased":
            expected = "increased"
            passed = actual_value > 0
            return passed, expected

        if condition == "decreased":
            expected = "decreased"
            passed = actual_value < 0
            return passed, expected

        # Unknown condition format
        logger.warning(f"Unknown condition format: {condition}")
        return False, condition

    def estimate_impact(
        self,
        results: List[EvidenceResult],
        metric_change: float,
        data: Dict[str, Any],
    ) -> float:
        """Estimate the impact of diagnosed causes on the metric change."""
        if not results:
            return 0.0

        # Calculate weighted impact based on passed evidence
        passed_results = [r for r in results if r.passed]
        if not passed_results:
            return 0.0

        total_weight = sum(r.weight for r in passed_results)
        if total_weight == 0:
            return 0.0

        # Attribute a portion of the metric change based on evidence weights
        attributed_impact = metric_change * (total_weight / sum(r.weight for r in results))

        return attributed_impact
