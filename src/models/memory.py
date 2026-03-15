"""Structured optimization memory records."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ExperimentRecord:
    """Canonical experiment record persisted in memory."""

    record_id: str
    client_id: str
    brand: Optional[str]
    experiment_id: str
    hypothesis_id: str
    title: str
    platform: str
    status: str
    created_at: str
    review_after_days: int = 7
    summary: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ActionRecord:
    """Executed or planned mutation attached to an experiment."""

    record_id: str
    client_id: str
    brand: Optional[str]
    experiment_id: str
    action_id: str
    action_type: str
    platform: str
    source_alias: Optional[str]
    target_kind: str
    target_id: Optional[str]
    status: str
    created_at: str
    payload: Dict[str, Any] = field(default_factory=dict)


@dataclass
class OutcomeRecord:
    """Outcome snapshot collected during evaluation."""

    record_id: str
    client_id: str
    brand: Optional[str]
    experiment_id: str
    outcome_id: str
    measured_at: str
    status: str
    baseline: Dict[str, Any] = field(default_factory=dict)
    observed: Dict[str, Any] = field(default_factory=dict)
    delta: Dict[str, Any] = field(default_factory=dict)
    notes: List[str] = field(default_factory=list)


@dataclass
class LessonRecord:
    """Learned rule or conclusion derived from experiment history."""

    record_id: str
    client_id: str
    brand: Optional[str]
    lesson_id: str
    title: str
    created_at: str
    status: str
    summary: str
    evidence: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)
