# Dev Notes

This page is for repository development, not end-user installation.

## Local setup

Use an editable install from the repo root:

```bash
python3 -m pip install --no-build-isolation -e .
```

If an older `pip` toolchain still fails in editable mode, use:

```bash
python3 setup.py develop
```

Then run the module directly:

```bash
python3 -m research_idea_explorer.cli ideas --query "urban heat planning"
```

## Tests

```bash
python3 -m unittest discover -s tests -v
```

## Local agent-surface install

Install the Codex skill into your home directory:

```bash
python3 -m research_idea_explorer.cli install codex-skill
```

Install the Claude Code command into a project:

```bash
python3 -m research_idea_explorer.cli install claude-command --project /path/to/your-project
```

## Notes

- The shipped user-facing path is the packaged command: `research-idea-explorer`
- The repo-local fallback is `python3 -m research_idea_explorer.cli`
- The old Node implementation is no longer the supported backend
