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
