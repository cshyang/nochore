"""Recommendation generation from diagnoses."""
import logging
import re
from typing import Dict, Any, List, Optional

from ..models import (
    Diagnosis,
    Recommendation,
    DiagnosticCheckConfig,
    RecommendationTemplate,
)

logger = logging.getLogger(__name__)


class RecommendationGenerator:
    """Generates actionable recommendations from diagnoses."""

    # Effort to priority mapping (lower effort = higher priority for same impact)
    EFFORT_PRIORITY = {"low": 1, "medium": 2, "high": 3}

    def __init__(self):
        self._action_counter = 0

    def generate_from_diagnosis(
        self,
        diagnosis: Diagnosis,
        check_config: DiagnosticCheckConfig,
        metric_id: str = "cpl",
    ) -> List[Recommendation]:
        """Generate recommendations from a confirmed diagnosis."""
        if not diagnosis.confirmed:
            return []

        recommendations = []
        for template in check_config.recommendation_templates:
            rec = self._create_recommendation(
                diagnosis=diagnosis,
                template=template,
                metric_id=metric_id,
            )
            recommendations.append(rec)

        return recommendations

    def _create_recommendation(
        self,
        diagnosis: Diagnosis,
        template: RecommendationTemplate,
        metric_id: str,
    ) -> Recommendation:
        """Create a single recommendation from a template."""
        self._action_counter += 1
        action_id = f"REC-{self._action_counter:03d}"

        # Prepare template context
        context = self._build_template_context(diagnosis)

        # Render template
        description = self._render_template(template.template, context)

        # Generate title from action
        title = self._generate_title(template.action)

        # Calculate priority based on impact and effort
        priority = self._calculate_priority(
            confidence=diagnosis.confidence,
            impact=diagnosis.estimated_impact,
            effort=template.effort,
        )

        # Determine impact unit
        impact_unit = self._get_impact_unit(metric_id)

        return Recommendation(
            action_id=action_id,
            diagnosis_id=diagnosis.check_id,
            title=title,
            description=description,
            priority=priority,
            expected_impact=diagnosis.estimated_impact,
            impact_unit=impact_unit,
            effort=template.effort,
            confidence=diagnosis.confidence,
            affected_items=diagnosis.affected_campaigns + diagnosis.affected_keywords,
            action_details={
                "action": template.action,
                "check_id": diagnosis.check_id,
                "confidence_score": diagnosis.confidence_score,
            },
        )

    def _build_template_context(self, diagnosis: Diagnosis) -> Dict[str, Any]:
        """Build context dictionary for template rendering."""
        return {
            "affected_campaigns": ", ".join(diagnosis.affected_campaigns[:5]) or "affected campaigns",
            "affected_keywords": ", ".join(diagnosis.affected_keywords[:5]) or "affected keywords",
            "campaigns": ", ".join(diagnosis.affected_campaigns[:3]) or "campaigns",
            "keywords": ", ".join(diagnosis.affected_keywords[:3]) or "keywords",
            "impact": f"{diagnosis.estimated_impact:.2f}",
            "confidence": diagnosis.confidence,
            "dimension": "device/geo/hour",  # Default for composition shifts
            "details": self._summarize_evidence(diagnosis),
        }

    def _render_template(self, template: str, context: Dict[str, Any]) -> str:
        """Render a template string with context."""
        result = template
        for key, value in context.items():
            placeholder = "{" + key + "}"
            result = result.replace(placeholder, str(value))
        return result

    def _generate_title(self, action: str) -> str:
        """Generate a human-readable title from action ID."""
        # Convert action_id to title case
        title = action.replace("_", " ").title()
        return title

    def _calculate_priority(
        self,
        confidence: str,
        impact: float,
        effort: str,
    ) -> int:
        """Calculate priority score (1 = highest priority)."""
        # Base priority from effort
        effort_score = self.EFFORT_PRIORITY.get(effort, 2)

        # Adjust for confidence
        confidence_modifier = 0
        if confidence == "high":
            confidence_modifier = -1
        elif confidence == "low":
            confidence_modifier = 1

        # Adjust for impact magnitude
        impact_modifier = 0
        if impact > 5.0:
            impact_modifier = -1
        elif impact < 1.0:
            impact_modifier = 1

        priority = max(1, effort_score + confidence_modifier + impact_modifier)
        return priority

    def _get_impact_unit(self, metric_id: str) -> str:
        """Get the unit for the metric."""
        units = {
            "cpl": "CPL",
            "cvr": "CVR%",
            "volume": "leads",
            "cpc": "CPC",
        }
        return units.get(metric_id, metric_id.upper())

    def _summarize_evidence(self, diagnosis: Diagnosis) -> str:
        """Create a brief summary of the evidence."""
        passed_evidence = [e for e in diagnosis.evidence if e.passed]
        if not passed_evidence:
            return "based on diagnostic analysis"

        summaries = []
        for evidence in passed_evidence[:3]:
            summaries.append(f"{evidence.metric}: {evidence.actual_value:.1f}")

        return ", ".join(summaries)

    def prioritize_recommendations(
        self,
        recommendations: List[Recommendation],
    ) -> List[Recommendation]:
        """Sort recommendations by priority (highest first)."""
        return sorted(recommendations, key=lambda r: (r.priority, -r.expected_impact))

    def generate_all_recommendations(
        self,
        diagnoses: List[Diagnosis],
        check_configs: Dict[str, DiagnosticCheckConfig],
        metric_id: str = "cpl",
    ) -> List[Recommendation]:
        """Generate and prioritize recommendations from all diagnoses."""
        all_recommendations = []

        for diagnosis in diagnoses:
            if not diagnosis.confirmed:
                continue

            config = check_configs.get(diagnosis.check_id)
            if not config:
                logger.warning(f"No config found for check: {diagnosis.check_id}")
                continue

            recs = self.generate_from_diagnosis(diagnosis, config, metric_id)
            all_recommendations.extend(recs)

        return self.prioritize_recommendations(all_recommendations)

    def flag_missing_data_recommendations(
        self,
        recommendations: List[Recommendation],
        available_data: Dict[str, bool],
    ) -> List[Recommendation]:
        """Flag recommendations that require data we don't have."""
        flagged = []
        for rec in recommendations:
            # Check if recommendation requires unavailable data
            requires_qs = "quality" in rec.title.lower() or "qs" in rec.action_details.get("action", "")
            requires_is = "impression" in rec.title.lower() or "budget" in rec.title.lower()

            missing_data = []
            if requires_qs and not available_data.get("quality_scores", True):
                missing_data.append("quality score data")
            if requires_is and not available_data.get("impression_share", True):
                missing_data.append("impression share data")

            if missing_data:
                rec.confidence = "low"
                rec.action_details["missing_data"] = missing_data

            flagged.append(rec)

        return flagged
