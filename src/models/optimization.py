"""Optimizer planning and execution schemas."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ExperimentHypothesis:
    """Hypothesis produced by the optimizer from analysis plus memory."""

    hypothesis_id: str
    client_id: str
    brand: Optional[str]
    title: str
    summary: str
    confidence: str
    expected_outcome: str
    review_after_days: int = 7
    evidence: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ActionPlan:
    """Typed platform action proposed by the optimizer."""

    action_id: str
    hypothesis_id: str
    action_type: str
    platform: str
    client_id: str
    brand: Optional[str]
    source_alias: Optional[str]
    target_kind: str
    target_id: Optional[str]
    confidence: str
    risk_level: str
    idempotency_key: str
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExecutionDecision:
    """Policy decision for an action plan."""

    action_id: str
    decision: str
    reason: str
    checks: Dict[str, Any] = field(default_factory=dict)
    warnings: List[str] = field(default_factory=list)
