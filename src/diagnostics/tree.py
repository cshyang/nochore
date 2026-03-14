"""Diagnostic tree for loading and executing checks."""
import logging
from typing import Dict, Any, List, Optional

from ..config import DiagnosticTreeConfigLoader
from ..models import (
    DiagnosticTreeConfig,
    DiagnosticCheckConfig,
    Diagnosis,
    ThresholdConfig,
)

logger = logging.getLogger(__name__)


class DiagnosticTree:
    """Loads and executes diagnostic checks from configuration."""

    def __init__(self, config_path: str = "config/diagnostic_tree.yaml"):
        self.config_loader = DiagnosticTreeConfigLoader(config_path)
        self._config: Optional[DiagnosticTreeConfig] = None
        self._checks: Dict[str, "DiagnosticCheck"] = {}

    def load(self) -> bool:
        """Load the diagnostic tree configuration."""
        self._config = self.config_loader.load()
        if not self._config:
            logger.warning("Failed to load diagnostic tree configuration")
            return False
        return True

    def get_checks_for_metric(self, metric_id: str) -> List[str]:
        """Get the list of check IDs to run for a given metric."""
        return self.config_loader.get_metric_checks(metric_id)

    def get_check_config(self, check_id: str) -> Optional[DiagnosticCheckConfig]:
        """Get the configuration for a specific check."""
        return self.config_loader.get_check_config(check_id)

    def get_change_threshold(self, metric_id: str) -> float:
        """Get the change threshold that triggers investigation for a metric."""
        return self.config_loader.get_change_threshold(metric_id)

    def should_investigate(self, metric_id: str, change_pct: float) -> bool:
        """Determine if a metric change should trigger investigation."""
        threshold = self.get_change_threshold(metric_id)
        return abs(change_pct) >= threshold

    @property
    def thresholds(self) -> Optional[ThresholdConfig]:
        """Get global threshold configuration."""
        return self.config_loader.thresholds

    @property
    def config(self) -> Optional[DiagnosticTreeConfig]:
        """Get the loaded configuration."""
        return self._config

    def execute_checks(
        self,
        metric_id: str,
        data: Dict[str, Any],
        check_registry: Dict[str, "DiagnosticCheck"],
    ) -> List[Diagnosis]:
        """Execute all configured checks for a metric."""
        diagnoses = []
        check_ids = self.get_checks_for_metric(metric_id)

        for check_id in check_ids:
            check_config = self.get_check_config(check_id)
            if not check_config:
                logger.warning(f"Check config not found: {check_id}")
                continue

            check = check_registry.get(check_id)
            if not check:
                logger.warning(f"Check not registered: {check_id}")
                continue

            try:
                diagnosis = check.evaluate(data, check_config)
                if diagnosis:
                    diagnoses.append(diagnosis)
            except Exception as e:
                logger.error(f"Error executing check {check_id}: {e}")

        return diagnoses
