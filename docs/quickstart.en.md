# Research Idea Explorer Quick Start

[Project Home](../README.md) | [English Docs](./README.en.md) | [中文快速上手](./quickstart.zh.md)

## Get running in 5 minutes

### 1. Check your environment

```bash
node --version
```

You only need `Node.js 18+`.
This repository currently has no extra npm dependencies, so you can run it directly from the repo root without `npm install`, and it is not a `pip install` package.

If you want a reusable machine-wide install for other users or other workspaces, you can also install it globally:

```bash
npm install -g .
```

This provides two command names:
- `research-idea-explorer`
- `rie`

### 2. Generate your first round of ideas

```bash
node src/cli.js ideas --query "urban heat planning"
```

This command will:

1. search relevant literature
2. build a first-pass literature map
3. generate research moves and a focused frontier
4. produce research cards
5. write a JSON memory graph

If you want the deeper two-round mode:

```bash
node src/cli.js ideas --query "urban heat planning" --rounds 2
```

### 3. Inspect memory state

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json
```

To list the most recent ideas:

```bash
node src/cli.js graph --memory ./data/memory/cli-memory.json --view ideas
```

### 4. Accept a direction and continue

First list the generated ideas:

```bash
node src/cli.js feedback --memory ./data/memory/cli-memory.json
```

Then accept one:

```bash
node src/cli.js feedback --memory ./data/memory/cli-memory.json --idea-id <idea-id> --decision accepted --note "strong direction"
```

Then run `ideas` again to continue from the updated memory graph. If the memory graph already contains an `accepted` idea, the next `ideas` run automatically upgrades to two rounds unless you pass `--rounds 1`.

By default, memory continuation is topic-scoped:
- nearby topics can continue from each other
- unrelated topics in the same memory file do not cross-contaminate

If the same topic keeps getting rejected and there is still no accepted direction, the system automatically switches into a lateral reset:
- widen the literature map instead of staring at the same top papers
- prefer a different contrast, idea family, or evidence lane
- avoid treating "more original" as "just make the scope smaller"

If you want one shared global history instead:

```bash
node src/cli.js ideas --query "your topic here" --memory-scope global
```

## Common patterns

### Specify literature sources

```bash
node src/cli.js ideas --query "large language model reasoning" --providers arxiv,openalex,crossref
```

### Use a local paper library

```bash
node src/cli.js ideas --query "urban heat planning" --providers local --local-library-path ./data/library.json
```

### Prefer semantic retrieval

```bash
node src/cli.js ideas --query "urban heat planning" --search-strategy embedding
```

### Prefer neighborhood expansion

```bash
node src/cli.js ideas --query "urban heat planning" --search-strategy graph
```

### Force the deeper two-round search

```bash
node src/cli.js ideas --query "urban heat planning" --rounds 2
```

## Use it in Codex

Codex uses the skill surface, which is separate from the local CLI.
If you installed the package globally, run:

```bash
research-idea-explorer install codex-skill
```

If you are still working from the repo checkout, you can also run:

```bash
node src/cli.js install codex-skill
```

After restarting Codex, you can say:

```text
Use $research-idea-explorer to generate research directions around “urban heat adaptation”.
Search literature first and give me one strong frontier. If we find a promising direction, branch again through adjacent literature.
```

## Use it in Claude Code

If you installed the package globally, install the command into the target project:

```bash
research-idea-explorer install claude-command --project /path/to/your-project
```

If you are still working from the repo checkout, you can also run:

```bash
node src/cli.js install claude-command --project /path/to/your-project
```

Then inside that project, run:

```text
/research-idea-explorer
```

## Default rules

- research-generation calls search literature first
- pure utility calls such as `graph`, `feedback`, and output-format explanation do not require retrieval
- the default retrieval mode is `hybrid`
- the default search depth is `1` round
- accepted directions automatically trigger `2` rounds on the next continuation unless you pass `--rounds 1`
- repeated rejection on the same topic triggers a lateral reset instead of a narrower continuation
- the default memory scope is `topic`

## If you remember only one command

```bash
node src/cli.js ideas --query "your topic here"
```
