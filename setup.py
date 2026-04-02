from pathlib import Path

from setuptools import find_packages, setup


setup(
    name="research-idea-explorer",
    version="0.2.0",
    description="Research ideation backend for Codex CLI and Claude Code",
    long_description=Path("README.md").read_text(encoding="utf-8"),
    long_description_content_type="text/markdown",
    author="James Lemon",
    license="MIT",
    python_requires=">=3.9",
    packages=find_packages(exclude=("tests",)),
    include_package_data=True,
    package_data={
        "research_idea_explorer": [
            "assets/claude/commands/*.md",
            "assets/skills/research-idea-explorer/*.md",
            "assets/skills/research-idea-explorer/agents/*.yaml",
            "assets/skills/research-idea-explorer/references/*.md",
        ]
    },
    entry_points={
        "console_scripts": [
            "research-idea-explorer=research_idea_explorer.cli:main",
            "rie=research_idea_explorer.cli:main",
        ]
    },
)
