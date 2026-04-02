from __future__ import annotations

import json
import subprocess
import tempfile
import unittest
from pathlib import Path


class CliTests(unittest.TestCase):
    def test_graph_summary_json_on_empty_memory(self) -> None:
        result = subprocess.run(
            ["python3", "-m", "research_idea_explorer.cli", "graph", "--memory", "/tmp/rie-py-cli-empty.json", "--view", "summary", "--format", "json"],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(result.stdout)
        self.assertEqual(payload["summary"]["runs"], 0)
        self.assertEqual(payload["summary"]["nodeCount"], 0)

    def test_feedback_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-cli-") as tmp_dir:
            memory_path = str(Path(tmp_dir) / "memory.json")
            result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "ideas",
                    "--query",
                    "urban heat adaptation",
                    "--providers",
                    "local",
                    "--local-library-path",
                    str(Path.cwd() / "tests" / "fixtures" / "library.json"),
                    "--memory",
                    memory_path,
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout)
            idea_id = payload["frontier"][0]["id"]
            feedback = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "feedback",
                    "--memory",
                    memory_path,
                    "--idea-id",
                    idea_id,
                    "--decision",
                    "accepted",
                    "--note",
                    "strong direction",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            feedback_payload = json.loads(feedback.stdout)
            self.assertEqual(feedback_payload["ideaId"], idea_id)
            self.assertEqual(feedback_payload["decision"], "accepted")

    def test_ideas_command_tolerates_legacy_non_dict_payload_nodes(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-cli-legacy-") as tmp_dir:
            memory_path = Path(tmp_dir) / "legacy-memory.json"
            memory_path.write_text(
                json.dumps(
                    {
                        "version": 1,
                        "createdAt": "2026-03-23T17:18:48.862Z",
                        "updatedAt": "2026-03-23T17:18:48.862Z",
                        "nodes": {
                            "idea:legacy": {
                                "id": "idea:legacy",
                                "kind": "idea",
                                "label": "Legacy idea",
                                "payload": ["unexpected", "legacy", "shape"],
                                "status": "accepted",
                            }
                        },
                        "edges": [],
                        "stats": {"runs": 1},
                    }
                ),
                encoding="utf-8",
            )
            result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "ideas",
                    "--query",
                    "urban heat adaptation",
                    "--providers",
                    "local",
                    "--local-library-path",
                    str(Path.cwd() / "tests" / "fixtures" / "library.json"),
                    "--memory",
                    str(memory_path),
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            payload = json.loads(result.stdout)
            self.assertTrue(payload["frontier"])

    def test_ideas_preferences_are_remembered_and_reused(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-cli-preferences-") as tmp_dir:
            memory_path = str(Path(tmp_dir) / "memory.json")
            first_result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "ideas",
                    "--query",
                    "urban heat adaptation",
                    "--providers",
                    "local",
                    "--local-library-path",
                    str(Path.cwd() / "tests" / "fixtures" / "library.json"),
                    "--memory",
                    memory_path,
                    "--format",
                    "json",
                    "--preference-note",
                    "不要 survey，更偏 causal identification，要 policy relevance",
                    "--remember-preferences",
                    "topic",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            first_payload = json.loads(first_result.stdout)
            self.assertIn("identify", first_payload["activePreferences"]["preferredClaims"])
            self.assertIn("survey", first_payload["activePreferences"]["avoidEvidenceKinds"])

            second_result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "ideas",
                    "--query",
                    "urban heat adaptation",
                    "--providers",
                    "local",
                    "--local-library-path",
                    str(Path.cwd() / "tests" / "fixtures" / "library.json"),
                    "--memory",
                    memory_path,
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            second_payload = json.loads(second_result.stdout)
            self.assertIn("identify", second_payload["activePreferences"]["preferredClaims"])
            self.assertIn("survey", second_payload["activePreferences"]["avoidEvidenceKinds"])

            graph_result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "graph",
                    "--memory",
                    memory_path,
                    "--view",
                    "preferences",
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            graph_payload = json.loads(graph_result.stdout)
            self.assertEqual(len(graph_payload["preferences"]["topics"]), 1)
            self.assertIn("policy relevance", graph_payload["preferences"]["topics"][0]["stakes"])

    def test_feedback_can_remember_preferences_from_idea_topic(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-cli-feedback-preferences-") as tmp_dir:
            memory_path = str(Path(tmp_dir) / "memory.json")
            ideas_result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "ideas",
                    "--query",
                    "urban heat adaptation",
                    "--providers",
                    "local",
                    "--local-library-path",
                    str(Path.cwd() / "tests" / "fixtures" / "library.json"),
                    "--memory",
                    memory_path,
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            idea_id = json.loads(ideas_result.stdout)["frontier"][0]["id"]

            subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "feedback",
                    "--memory",
                    memory_path,
                    "--idea-id",
                    idea_id,
                    "--decision",
                    "accepted",
                    "--note",
                    "不要 survey，更偏 causal identification，要 policy relevance",
                    "--remember-preferences",
                    "topic",
                ],
                check=True,
                capture_output=True,
                text=True,
            )

            graph_result = subprocess.run(
                [
                    "python3",
                    "-m",
                    "research_idea_explorer.cli",
                    "graph",
                    "--memory",
                    memory_path,
                    "--view",
                    "preferences",
                    "--format",
                    "json",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            graph_payload = json.loads(graph_result.stdout)
            self.assertEqual(len(graph_payload["preferences"]["topics"]), 1)
            self.assertIn("identify", graph_payload["preferences"]["topics"][0]["preferredClaims"])
