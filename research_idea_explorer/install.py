"""Install Codex skill and Claude command surfaces from package assets."""

from __future__ import annotations

import os
from importlib import resources
from pathlib import Path
from typing import Any


PACKAGE = "research_idea_explorer"
SKILL_NAME = "research-idea-explorer"
CLAUDE_COMMAND_NAME = "research-idea-explorer"


def _copy_resource_tree(source, target: Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    for entry in source.iterdir():
        destination = target / entry.name
        if entry.is_dir():
            _copy_resource_tree(entry, destination)
        else:
            destination.write_bytes(entry.read_bytes())


def install_codex_skill(home_dir: str | None = None) -> dict[str, str]:
    home = Path(home_dir or os.path.expanduser("~")).resolve()
    source = resources.files(PACKAGE).joinpath("assets", "skills", SKILL_NAME)
    target = home / ".codex" / "skills" / SKILL_NAME
    _copy_resource_tree(source, target)
    return {"targetDir": str(target)}


def install_claude_command(project_dir: str | None = None) -> dict[str, str]:
    project = Path(project_dir or os.getcwd()).resolve()
    source = resources.files(PACKAGE).joinpath("assets", "claude", "commands", f"{CLAUDE_COMMAND_NAME}.md")
    target = project / ".claude" / "commands" / f"{CLAUDE_COMMAND_NAME}.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(source.read_bytes())
    return {"targetFile": str(target)}


def install_agent_surfaces(home_dir: str | None = None, project_dir: str | None = None) -> dict[str, Any]:
    return {"codex": install_codex_skill(home_dir=home_dir), "claude": install_claude_command(project_dir=project_dir)}
