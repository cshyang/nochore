"""Optimization experiment services."""

from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from src.engine.evaluator import build_learning_result, build_review_payload
from src.engine.optimizer import build_optimization_plan
from src.engine.policy import evaluate_action_plan
from src.models import ActionPlan, ActionRecord, AnalysisResults, ExperimentRecord, OutcomeRecord
from src.tools.memory import MemoryStore


def plan_optimization(
    results: AnalysisResults,
    memory_store: MemoryStore,
) -> Dict[str, Any]:
    """Build a non-persistent optimization plan."""
    memory_rows = memory_store.list_records(results.client_id, brand=results.brand)
    plan = build_optimization_plan(results, memory_rows)
    plan["hypotheses"] = [asdict(item) for item in plan["hypotheses"]]
    plan["actions"] = [asdict(item) for item in plan["actions"]]
    return plan


def run_optimization(
    results: AnalysisResults,
    memory_store: MemoryStore,
    *,
    dry_run: bool,
) -> Dict[str, Any]:
    """Evaluate and persist a dry-run optimization execution."""
    plan = build_optimization_plan(
        results,
        memory_store.list_records(results.client_id, brand=results.brand),
    )
    if not dry_run:
        return {
            "client_id": results.client_id,
            "scope": results.scope,
            "brand": results.brand,
            "status": "blocked",
            "message": "Live execution adapters are not enabled in this phase. Re-run with --dry-run.",
        }

    now = datetime.now(timezone.utc).isoformat()
    experiments = []
    action_rows = []
    decisions = []
    for hypothesis in plan["hypotheses"]:
        experiment_id = f"EXP-{uuid4().hex[:8]}"
        experiment = ExperimentRecord(
            record_id=f"record-{experiment_id}",
            client_id=results.client_id,
            brand=results.brand,
            experiment_id=experiment_id,
            hypothesis_id=hypothesis.hypothesis_id,
            title=hypothesis.title,
            platform="mixed",
            status="planned_dry_run",
            created_at=now,
            review_after_days=hypothesis.review_after_days,
            summary=hypothesis.summary,
            metadata={"confidence": hypothesis.confidence},
        )
        memory_store.append(results.client_id, "experiments", experiment)
        experiments.append(asdict(experiment))

        for action in [item for item in plan["actions"] if item.hypothesis_id == hypothesis.hypothesis_id]:
            decision = evaluate_action_plan(action, dry_run=True)
            action_record = ActionRecord(
                record_id=f"record-{action.action_id}",
                client_id=results.client_id,
                brand=results.brand,
                experiment_id=experiment_id,
                action_id=action.action_id,
                action_type=action.action_type,
                platform=action.platform,
                source_alias=action.source_alias,
                target_kind=action.target_kind,
                target_id=action.target_id,
                status=decision.decision,
                created_at=now,
                payload=action.payload,
            )
            memory_store.append(results.client_id, "actions", action_record)
            action_rows.append(asdict(action_record))
            decisions.append(asdict(decision))

    return {
        "client_id": results.client_id,
        "scope": results.scope,
        "brand": results.brand,
        "status": "complete",
        "dry_run": True,
        "experiments": experiments,
        "actions": action_rows,
        "decisions": decisions,
    }


def review_experiment(memory_store: MemoryStore, experiment_id: str) -> Dict[str, Any]:
    """Return a review payload for one experiment."""
    experiment = None
    for client_dir in memory_store.base_dir.iterdir():
        if not client_dir.is_dir():
            continue
        for row in memory_store.read(client_dir.name, "experiments"):
            if row.get("experiment_id") == experiment_id:
                experiment = row
                break
        if experiment:
            break
    if not experiment:
        return {"experiment_id": experiment_id, "status": "not_found"}

    client_id = experiment["client_id"]
    experiment_id = experiment["experiment_id"]
    actions = [
        row for row in memory_store.read(client_id, "actions")
        if row.get("experiment_id") == experiment_id
    ]
    outcomes = [
        row for row in memory_store.read(client_id, "outcomes")
        if row.get("experiment_id") == experiment_id
    ]
    lessons = [
        row for row in memory_store.read(client_id, "lessons")
        if row.get("title", "").endswith(experiment["title"])
    ]
    return build_review_payload(experiment, actions, outcomes, lessons)


def learn_experiment(memory_store: MemoryStore, experiment_id: str) -> Dict[str, Any]:
    """Derive and persist a lesson for an experiment if outcomes exist."""
    experiment = None
    for client_dir in memory_store.base_dir.iterdir():
        if not client_dir.is_dir():
            continue
        for row in memory_store.read(client_dir.name, "experiments"):
            if row.get("experiment_id") == experiment_id:
                experiment = row
                break
        if experiment:
            break
    if not experiment:
        return {"experiment_id": experiment_id, "status": "not_found"}

    outcomes = [
        row for row in memory_store.read(experiment["client_id"], "outcomes")
        if row.get("experiment_id") == experiment["experiment_id"]
    ]
    lesson = build_learning_result(experiment, outcomes)
    if lesson is None:
        return {
            "experiment_id": experiment_id,
            "status": "pending_outcomes",
            "message": "No outcomes recorded for this experiment yet.",
        }

    memory_store.append(experiment["client_id"], "lessons", lesson)
    return {"experiment_id": experiment_id, "status": "complete", "lesson": asdict(lesson)}


def record_manual_live_execution(
    memory_store: MemoryStore,
    action: ActionPlan,
    *,
    summary: str,
    execution_result: Dict[str, Any],
) -> Dict[str, Any]:
    """Persist a manual live execution into structured memory."""
    now = datetime.now(timezone.utc).isoformat()
    experiment_id = f"EXP-MANUAL-{uuid4().hex[:8]}"
    experiment = ExperimentRecord(
        record_id=f"record-{experiment_id}",
        client_id=action.client_id,
        brand=action.brand,
        experiment_id=experiment_id,
        hypothesis_id=action.hypothesis_id,
        title=summary,
        platform=action.platform,
        status="manual_live_executed",
        created_at=now,
        summary=summary,
        metadata={
            "execution_mode": "live",
            "source_alias": action.source_alias,
            "action_type": action.action_type,
        },
    )
    action_record = ActionRecord(
        record_id=f"record-{action.action_id}-{uuid4().hex[:6]}",
        client_id=action.client_id,
        brand=action.brand,
        experiment_id=experiment_id,
        action_id=action.action_id,
        action_type=action.action_type,
        platform=action.platform,
        source_alias=action.source_alias,
        target_kind=action.target_kind,
        target_id=action.target_id,
        status="executed_live",
        created_at=now,
        payload={
            "execution_mode": "live",
            "requested": dict(action.payload),
            "idempotency_key": action.idempotency_key,
            "pre_mutation_state": execution_result.get("pre_mutation_state", {}),
            "mutation_result": execution_result.get("mutation_result", {}),
            "rollback": execution_result.get("rollback", {}),
        },
    )
    memory_store.append(action.client_id, "experiments", experiment)
    memory_store.append(action.client_id, "actions", action_record)
    return {"experiment": asdict(experiment), "action_record": asdict(action_record)}
