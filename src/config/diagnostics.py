"""Diagnostic tree configuration loader."""

import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml
from rich.console import Console

from ..models import (
    CheckConfig,
    DiagnosticCheckConfig,
    DiagnosticTreeConfig,
    EvidenceRule,
    MetricConfig,
    RecommendationTemplate,
    ThresholdConfig,
)

logger = logging.getLogger(__name__)
console = Console()


class DiagnosticTreeConfigLoader:
    """Loads and validates the diagnostic tree configuration."""

    REQUIRED_SECTIONS = ["version", "metrics", "checks", "thresholds"]

    def __init__(self, config_path: str = "config/diagnostic_tree.yaml"):
        self.config_path = Path(config_path)
        self._config: Optional[DiagnosticTreeConfig] = None

    def load(self) -> Optional[DiagnosticTreeConfig]:
        """Load and parse the diagnostic tree configuration."""
        try:
            if not self.config_path.exists():
                logger.warning("Diagnostic tree config not found: %s", self.config_path)
                return None

            with self.config_path.open("r", encoding="utf-8") as handle:
                raw_config = yaml.safe_load(handle)

            if not self._validate_structure(raw_config):
                return None

            self._config = self._parse_config(raw_config)
            logger.info("Loaded diagnostic tree config v%s", self._config.version)
            return self._config
        except yaml.YAMLError as exc:
            console.print(f"[red]Error parsing diagnostic tree YAML: {exc}[/red]")
            return None
        except Exception as exc:
            logger.error("Error loading diagnostic tree config: %s", exc)
            return None

    def _validate_structure(self, raw_config: Dict[str, Any]) -> bool:
        for section in self.REQUIRED_SECTIONS:
            if section not in raw_config:
                console.print(f"[red]Diagnostic tree config missing required section: {section}[/red]")
                return False

        version = raw_config.get("version", "")
        if not isinstance(version, str) or not version:
            console.print("[red]Invalid or missing version in diagnostic tree config[/red]")
            return False

        return True

    def _parse_config(self, raw_config: Dict[str, Any]) -> DiagnosticTreeConfig:
        metrics: Dict[str, MetricConfig] = {}
        for metric_id, metric_data in raw_config.get("metrics", {}).items():
            metrics[metric_id] = MetricConfig(
                name=metric_data.get("name", metric_id),
                formula=metric_data.get("formula", ""),
                change_threshold=float(metric_data.get("change_threshold", 0.10)),
                diagnostic_checks=metric_data.get("diagnostic_checks", []),
            )

        checks: Dict[str, CheckConfig] = {}
        for check_id, check_data in raw_config.get("checks", {}).items():
            checks[check_id] = CheckConfig(
                name=check_data.get("name", check_id),
                description=check_data.get("description", ""),
                evidence=check_data.get("evidence", []),
                recommendations=check_data.get("recommendations", []),
                dimensions=check_data.get("dimensions"),
                threshold=check_data.get("threshold"),
            )

        threshold_data = raw_config.get("thresholds", {})
        thresholds = ThresholdConfig(
            min_data_points=int(threshold_data.get("min_data_points", 7)),
            significance_level=float(threshold_data.get("significance_level", 0.7)),
            anomaly_z_score=float(threshold_data.get("anomaly_z_score", 2.0)),
            composition_shift_threshold=float(threshold_data.get("composition_shift_threshold", 0.15)),
            confidence_high=float(threshold_data.get("confidence_high", 0.85)),
            confidence_medium=float(threshold_data.get("confidence_medium", 0.50)),
        )

        return DiagnosticTreeConfig(
            version=raw_config.get("version", "1.0"),
            metrics=metrics,
            checks=checks,
            thresholds=thresholds,
        )

    def get_check_config(self, check_id: str) -> Optional[DiagnosticCheckConfig]:
        """Get a fully-typed diagnostic check configuration."""
        if not self._config:
            return None

        check = self._config.checks.get(check_id)
        if not check:
            return None

        evidence_rules = [
            EvidenceRule(
                metric=item.get("metric", ""),
                condition=item.get("condition", ""),
                weight=float(item.get("weight", 1.0)),
            )
            for item in check.evidence
        ]

        rec_templates = [
            RecommendationTemplate(
                action=item.get("action", ""),
                effort=item.get("effort", "medium"),
                template=item.get("template", ""),
            )
            for item in check.recommendations
        ]

        return DiagnosticCheckConfig(
            check_id=check_id,
            name=check.name,
            description=check.description,
            evidence_rules=evidence_rules,
            recommendation_templates=rec_templates,
            dimensions=check.dimensions,
            threshold=check.threshold,
        )

    def get_metric_checks(self, metric_id: str) -> List[str]:
        """Get check IDs configured for a metric."""
        if not self._config:
            return []
        metric = self._config.metrics.get(metric_id)
        return metric.diagnostic_checks if metric else []

    def get_change_threshold(self, metric_id: str) -> float:
        """Get the change threshold for a metric."""
        if not self._config:
            return 0.10
        metric = self._config.metrics.get(metric_id)
        return metric.change_threshold if metric else 0.10

    @property
    def thresholds(self) -> Optional[ThresholdConfig]:
        """Get global thresholds."""
        return self._config.thresholds if self._config else None
