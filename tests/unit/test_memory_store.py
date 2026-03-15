"""Unit tests for structured memory storage."""

from __future__ import annotations

from tempfile import TemporaryDirectory
import unittest

from src.models import ActionRecord, ExperimentRecord, LessonRecord, OutcomeRecord
from src.tools.memory import MemoryStore


class MemoryStoreTests(unittest.TestCase):
    def test_append_list_search_and_summarize(self) -> None:
        with TemporaryDirectory() as tmp_dir:
            store = MemoryStore(base_dir=tmp_dir)
            experiment = ExperimentRecord(
                record_id="record-exp-1",
                client_id="nota",
                brand="Nota Cafe",
                experiment_id="EXP-1",
                hypothesis_id="HYP-1",
                title="Test budget experiment",
                platform="google_ads",
                status="planned",
                created_at="2026-03-15T00:00:00Z",
            )
            action = ActionRecord(
                record_id="record-act-1",
                client_id="nota",
                brand="Nota Cafe",
                experiment_id="EXP-1",
                action_id="ACT-1",
                action_type="adjust_google_ads_budget",
                platform="google_ads",
                source_alias="nota_ads",
                target_kind="campaign",
                target_id="camp-1",
                status="approved",
                created_at="2026-03-15T00:00:00Z",
            )
            outcome = OutcomeRecord(
                record_id="record-out-1",
                client_id="nota",
                brand="Nota Cafe",
                experiment_id="EXP-1",
                outcome_id="OUT-1",
                measured_at="2026-03-22T00:00:00Z",
                status="win",
            )
            lesson = LessonRecord(
                record_id="record-les-1",
                client_id="nota",
                brand="Nota Cafe",
                lesson_id="LES-1",
                title="Budget increases worked on constrained winners",
                created_at="2026-03-22T00:00:00Z",
                status="draft",
                summary="Learning summary",
            )

            store.append("nota", "experiments", experiment)
            store.append("nota", "actions", action)
            store.append("nota", "outcomes", outcome)
            store.append("nota", "lessons", lesson)

            self.assertEqual(len(store.list_records("nota")), 4)
            self.assertEqual(store.get_record("record-exp-1")["experiment_id"], "EXP-1")
            self.assertEqual(len(store.search("nota", "budget")), 3)

            summary_path = store.summarize("nota", brand="Nota Cafe")
            self.assertTrue(summary_path.exists())
            text = summary_path.read_text(encoding="utf-8")
            self.assertIn("Optimization Memory", text)
            self.assertIn("EXP-1", text)


if __name__ == "__main__":
    unittest.main()
