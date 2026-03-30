"""Evaluation and learning helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from src.models import LessonRecord


def build_review_payload(
    experiment: Dict[str, Any],
    actions: List[Dict[str, Any]],
    outcomes: List[Dict[str, Any]],
    lessons: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Build a review payload for one experiment."""
    return {
        "experiment": experiment,
        "actions": actions,
        "outcomes": outcomes,
        "lessons": lessons,
        "status": "complete" if outcomes else "pending_outcomes",
    }


def build_learning_result(
    experiment: Dict[str, Any],
    outcomes: List[Dict[str, Any]],
) -> Optional[LessonRecord]:
    """Create a lesson record when outcomes exist."""
    if not outcomes:
        return None

    return LessonRecord(
        record_id=f"lesson-{experiment['experiment_id']}",
        client_id=experiment["client_id"],
        brand=experiment.get("brand"),
        lesson_id=f"LES-{experiment['experiment_id']}",
        title=f"Learning for {experiment['title']}",
        created_at=datetime.now(timezone.utc).isoformat(),
        status="draft",
        summary="Evaluation completed; review outcomes and promote the lesson if valid.",
        evidence={"outcome_count": len(outcomes)},
        tags=["auto-generated"],
    )
