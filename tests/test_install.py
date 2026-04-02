from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from research_idea_explorer.install import install_agent_surfaces, install_claude_command, install_codex_skill


class InstallTests(unittest.TestCase):
    def test_install_codex_skill_copies_packaged_skill(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-home-") as tmp_dir:
            result = install_codex_skill(home_dir=tmp_dir)
            skill_file = Path(result["targetDir"]) / "SKILL.md"
            self.assertTrue(skill_file.exists())
            self.assertIn("Research Idea Explorer Skill", skill_file.read_text(encoding="utf-8"))

    def test_install_claude_command_copies_packaged_command(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-project-") as tmp_dir:
            result = install_claude_command(project_dir=tmp_dir)
            command_file = Path(result["targetFile"])
            self.assertTrue(command_file.exists())
            self.assertIn("Turn the user's topic into brainstorm seeds first", command_file.read_text(encoding="utf-8"))

    def test_install_all_returns_both_targets(self) -> None:
        with tempfile.TemporaryDirectory(prefix="rie-home-") as home_dir, tempfile.TemporaryDirectory(prefix="rie-project-") as project_dir:
            result = install_agent_surfaces(home_dir=home_dir, project_dir=project_dir)
            self.assertTrue(Path(result["codex"]["targetDir"]).exists())
            self.assertTrue(Path(result["claude"]["targetFile"]).exists())
